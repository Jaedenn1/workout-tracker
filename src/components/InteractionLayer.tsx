"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";

const TILT_SELECTOR = [
  ".v11-workout-hero",
  ".v11-home-card",
  ".gym-card",
  ".v06-card",
  ".v10-card",
  ".health-card",
  ".watch-card",
].join(",");

const REVEAL_SELECTOR = [
  ".v11-workout-hero",
  ".v11-home-card",
  ".v11-quick-actions",
  ".gym-stats",
  ".gym-card",
  ".gym-finish",
  ".v06-kpis",
  ".v06-card",
  ".v10-hero",
  ".v10-status",
  ".v10-card",
  ".v10-kpis",
  ".v10-summary-row",
  ".health-hero",
  ".health-status",
  ".health-card",
  ".health-panel",
  ".watch-hero",
  ".watch-status",
  ".watch-card",
].join(",");

function isInternalNavigation(anchor: HTMLAnchorElement) {
  if (anchor.target && anchor.target !== "_self") return false;
  if (anchor.hasAttribute("download")) return false;
  if (anchor.dataset.noClientNav === "true") return false;

  const url = new URL(anchor.href, window.location.href);
  if (url.origin !== window.location.origin) return false;
  if (url.pathname.startsWith("/api/")) return false;
  if (url.pathname.match(/\.(?:json|xml|txt|svg|png|jpg|jpeg|webp|pdf|zip)$/i)) return false;
  if (url.pathname === window.location.pathname && url.search === window.location.search && url.hash) return false;
  return true;
}

export default function InteractionLayer() {
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    document.body.classList.remove("pc-route-enter", "pc-route-leave");
    let second: number | null = null;
    const first = window.requestAnimationFrame(() => {
      second = window.requestAnimationFrame(() => document.body.classList.add("pc-route-enter"));
    });
    return () => {
      window.cancelAnimationFrame(first);
      if (second != null) window.cancelAnimationFrame(second);
    };
  }, [pathname]);

  useEffect(() => {
    const handleNavigation = (event: MouseEvent) => {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const target = event.target;
      if (!(target instanceof Element)) return;
      const anchor = target.closest("a[href]");
      if (!(anchor instanceof HTMLAnchorElement) || !isInternalNavigation(anchor)) return;

      const url = new URL(anchor.href, window.location.href);
      if (url.pathname === window.location.pathname && url.search === window.location.search && !url.hash) return;

      event.preventDefault();
      document.body.classList.add("pc-route-leave");
      router.push(`${url.pathname}${url.search}${url.hash}`);
    };

    document.addEventListener("click", handleNavigation, true);
    return () => document.removeEventListener("click", handleNavigation, true);
  }, [router]);

  useEffect(() => {
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    const finePointer = window.matchMedia("(hover: hover) and (pointer: fine)");
    if (reducedMotion.matches) return;

    const handlePointerMove = (event: PointerEvent) => {
      document.documentElement.style.setProperty("--pc-pointer-x", `${event.clientX}px`);
      document.documentElement.style.setProperty("--pc-pointer-y", `${event.clientY}px`);

      if (!finePointer.matches) return;
      const target = event.target;
      if (!(target instanceof Element)) return;
      const surface = target.closest(TILT_SELECTOR);
      if (!(surface instanceof HTMLElement)) return;

      const rect = surface.getBoundingClientRect();
      if (!rect.width || !rect.height) return;
      const x = (event.clientX - rect.left) / rect.width - 0.5;
      const y = (event.clientY - rect.top) / rect.height - 0.5;
      surface.style.setProperty("--pc-rotate-x", `${(-y * 2.6).toFixed(2)}deg`);
      surface.style.setProperty("--pc-rotate-y", `${(x * 3.2).toFixed(2)}deg`);
      surface.style.setProperty("--pc-glow-x", `${((x + 0.5) * 100).toFixed(1)}%`);
      surface.style.setProperty("--pc-glow-y", `${((y + 0.5) * 100).toFixed(1)}%`);
      surface.classList.add("pc-tilting");
    };

    const handlePointerOut = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      const surface = target.closest(TILT_SELECTOR);
      if (!(surface instanceof HTMLElement)) return;
      const related = event.relatedTarget;
      if (related instanceof Node && surface.contains(related)) return;
      surface.style.setProperty("--pc-rotate-x", "0deg");
      surface.style.setProperty("--pc-rotate-y", "0deg");
      surface.classList.remove("pc-tilting");
    };

    document.addEventListener("pointermove", handlePointerMove, { passive: true });
    document.addEventListener("pointerout", handlePointerOut, { passive: true });
    return () => {
      document.removeEventListener("pointermove", handlePointerMove);
      document.removeEventListener("pointerout", handlePointerOut);
    };
  }, []);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          entry.target.classList.add("pc-in-view");
          observer.unobserve(entry.target);
        }
      },
      { threshold: 0.08, rootMargin: "0px 0px -24px" },
    );

    const register = (root: ParentNode = document) => {
      root.querySelectorAll(REVEAL_SELECTOR).forEach((element) => {
        if (!(element instanceof HTMLElement) || element.classList.contains("pc-reveal")) return;
        element.classList.add("pc-reveal");
        observer.observe(element);
      });
    };

    register();
    const mutations = new MutationObserver((entries) => {
      for (const entry of entries) {
        entry.addedNodes.forEach((node) => {
          if (!(node instanceof Element)) return;
          if (node.matches(REVEAL_SELECTOR)) {
            node.classList.add("pc-reveal");
            observer.observe(node);
          }
          register(node);
        });
      }
    });
    mutations.observe(document.body, { childList: true, subtree: true });

    return () => {
      mutations.disconnect();
      observer.disconnect();
    };
  }, [pathname]);

  useEffect(() => {
    const handlePress = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      const control = target.closest("button, a.v11-primary-action, .v11-bottom-nav a, .v11-quick-actions a, .health-primary, .health-secondary, .watch-button, .v10-back, .health-back, .watch-back, .v10-file-button");
      if (!(control instanceof HTMLElement)) return;
      control.classList.add("pc-pressed");
      if ("vibrate" in navigator) navigator.vibrate?.(7);
    };

    const clearPress = () => document.querySelectorAll(".pc-pressed").forEach((element) => element.classList.remove("pc-pressed"));
    document.addEventListener("pointerdown", handlePress, { passive: true });
    document.addEventListener("pointerup", clearPress, { passive: true });
    document.addEventListener("pointercancel", clearPress, { passive: true });
    window.addEventListener("blur", clearPress);
    return () => {
      document.removeEventListener("pointerdown", handlePress);
      document.removeEventListener("pointerup", clearPress);
      document.removeEventListener("pointercancel", clearPress);
      window.removeEventListener("blur", clearPress);
    };
  }, []);

  return <div className="pc-ambient-glow" aria-hidden="true" />;
}
