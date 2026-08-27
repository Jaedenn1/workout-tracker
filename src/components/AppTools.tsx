"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import ProgressDashboard from "./ProgressDashboard";
import { db } from "../lib/database";

const SYNC_KEY_STORAGE = "workout-tracker:v0.5:sync-key";
const AUTO_SYNC_STORAGE = "workout-tracker:v0.5:auto-sync";
const HISTORY_KEY = "workout-tracker:v0.2:history";
const ROUTINES_KEY = "workout-tracker:v0.4:routines";
const ACTIVE_ROUTINE_KEY = "workout-tracker:v0.4:active-routine";
const DRAFTS_KEY = "workout-tracker:v0.4:drafts";
const BODYWEIGHT_KEY = "workout-tracker:v0.6:bodyweight";
const V07_CUSTOM_KEY = "workout-tracker:v0.7:custom-exercises";
const V07_NOTES_KEY = "workout-tracker:v0.7:exercise-notes";
const V07_REST_KEY = "workout-tracker:v0.7:rest-seconds";
const V07_EXTRAS_KEY = "workout-tracker:v0.7:routine-extras";
const V07_DRAFTS_KEY = "workout-tracker:v0.7:drafts";
const V08_HEALTH_IMPORTS_KEY = "workout-tracker:v0.8:healthkit-imports";

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

type CloudResponse = {
  configured?: boolean;
  found?: boolean;
  payload?: SyncPayload;
  updatedAt?: string;
  message?: string;
};

type SyncPayload = {
  version: 2 | 3;
  updatedAt: string;
  state: {
    history: unknown;
    routines: unknown;
    activeRoutineId: string | null;
    drafts: unknown;
    bodyweight?: unknown;
    v07CustomExercises?: unknown;
    v07Notes?: unknown;
    v07RestSeconds?: unknown;
    v07RoutineExtras?: unknown;
    v07Drafts?: unknown;
    v08HealthImports?: unknown;
  };
};

function safeParse(raw: string | null) {
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function collectPayload(): SyncPayload {
  return {
    version: 3,
    updatedAt: new Date().toISOString(),
    state: {
      history: safeParse(localStorage.getItem(HISTORY_KEY)) ?? [],
      routines: safeParse(localStorage.getItem(ROUTINES_KEY)) ?? [],
      activeRoutineId: localStorage.getItem(ACTIVE_ROUTINE_KEY),
      drafts: safeParse(localStorage.getItem(DRAFTS_KEY)) ?? {},
      bodyweight: safeParse(localStorage.getItem(BODYWEIGHT_KEY)) ?? [],
      v07CustomExercises: safeParse(localStorage.getItem(V07_CUSTOM_KEY)) ?? [],
      v07Notes: safeParse(localStorage.getItem(V07_NOTES_KEY)) ?? {},
      v07RestSeconds: safeParse(localStorage.getItem(V07_REST_KEY)) ?? {},
      v07RoutineExtras: safeParse(localStorage.getItem(V07_EXTRAS_KEY)) ?? {},
      v07Drafts: safeParse(localStorage.getItem(V07_DRAFTS_KEY)) ?? {},
      v08HealthImports: safeParse(localStorage.getItem(V08_HEALTH_IMPORTS_KEY)) ?? [],
    },
  };
}

function applyPayload(payload: SyncPayload) {
  localStorage.setItem(HISTORY_KEY, JSON.stringify(payload.state.history ?? []));
  localStorage.setItem(ROUTINES_KEY, JSON.stringify(payload.state.routines ?? []));
  if (payload.state.activeRoutineId) localStorage.setItem(ACTIVE_ROUTINE_KEY, payload.state.activeRoutineId);
  localStorage.setItem(DRAFTS_KEY, JSON.stringify(payload.state.drafts ?? {}));
  if (payload.state.bodyweight != null) localStorage.setItem(BODYWEIGHT_KEY, JSON.stringify(payload.state.bodyweight));
  if (payload.state.v07CustomExercises != null) localStorage.setItem(V07_CUSTOM_KEY, JSON.stringify(payload.state.v07CustomExercises));
  if (payload.state.v07Notes != null) localStorage.setItem(V07_NOTES_KEY, JSON.stringify(payload.state.v07Notes));
  if (payload.state.v07RestSeconds != null) localStorage.setItem(V07_REST_KEY, JSON.stringify(payload.state.v07RestSeconds));
  if (payload.state.v07RoutineExtras != null) localStorage.setItem(V07_EXTRAS_KEY, JSON.stringify(payload.state.v07RoutineExtras));
  if (payload.state.v07Drafts != null) localStorage.setItem(V07_DRAFTS_KEY, JSON.stringify(payload.state.v07Drafts));
  if (payload.state.v08HealthImports != null) localStorage.setItem(V08_HEALTH_IMPORTS_KEY, JSON.stringify(payload.state.v08HealthImports));
}

function makeSyncKey() {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function syncFetch(method: "GET" | "PUT", key: string, payload?: SyncPayload) {
  const response = await fetch("/api/sync", {
    method,
    headers: {
      Authorization: `Bearer ${key}`,
      ...(payload ? { "Content-Type": "application/json" } : {}),
    },
    body: payload ? JSON.stringify(payload) : undefined,
    cache: "no-store",
  });

  let data: CloudResponse = {};
  try {
    data = await response.json();
  } catch {
    // Keep generic status text below.
  }
  return { response, data };
}

export default function AppTools() {
  const pathname = usePathname();
  const [syncOpen, setSyncOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [progressOpen, setProgressOpen] = useState(false);
  const [syncKey, setSyncKey] = useState("");
  const [status, setStatus] = useState("IndexedDB-backed · local-first");
  const [busy, setBusy] = useState(false);
  const [standalone, setStandalone] = useState(false);
  const [installPrompt, setInstallPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isIos, setIsIos] = useState(false);
  const [installHelp, setInstallHelp] = useState("");
  const autoSyncRef = useRef(false);
  const lastSnapshotRef = useRef("");

  useEffect(() => {
    if ("serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js").catch(() => undefined);
    const nav = navigator as Navigator & { standalone?: boolean };
    setStandalone(window.matchMedia("(display-mode: standalone)").matches || Boolean(nav.standalone));
    setIsIos(/iphone|ipad|ipod/i.test(navigator.userAgent));
    const existingKey = localStorage.getItem(SYNC_KEY_STORAGE) ?? "";
    setSyncKey(existingKey);
    autoSyncRef.current = localStorage.getItem(AUTO_SYNC_STORAGE) === "1";

    const handleInstall = (event: Event) => {
      event.preventDefault();
      setInstallPrompt(event as BeforeInstallPromptEvent);
    };
    const handleProgress = () => setProgressOpen(true);
    window.addEventListener("beforeinstallprompt", handleInstall as EventListener);
    window.addEventListener("workout-tracker:open-progress", handleProgress);
    return () => {
      window.removeEventListener("beforeinstallprompt", handleInstall as EventListener);
      window.removeEventListener("workout-tracker:open-progress", handleProgress);
    };
  }, []);

  useEffect(() => {
    setMoreOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!syncKey || !autoSyncRef.current) return;
    const interval = window.setInterval(async () => {
      const payload = collectPayload();
      const snapshot = JSON.stringify(payload.state);
      if (snapshot === lastSnapshotRef.current) return;
      try {
        const { response, data } = await syncFetch("PUT", syncKey, payload);
        if (response.ok) {
          lastSnapshotRef.current = snapshot;
          await db.syncQueue.clear();
          setStatus("Cloud sync ready · queued changes backed up");
        } else if (response.status === 503 || data.configured === false) {
          autoSyncRef.current = false;
          setStatus("Cloud database not connected yet · IndexedDB data is safe");
        }
      } catch {
        setStatus("Offline · IndexedDB data is safe");
      }
    }, 20000);
    return () => window.clearInterval(interval);
  }, [syncKey]);

  function ensureKey() {
    const key = syncKey.trim() || makeSyncKey();
    if (key !== syncKey) setSyncKey(key);
    localStorage.setItem(SYNC_KEY_STORAGE, key);
    return key;
  }

  async function checkCloud() {
    const key = ensureKey();
    setBusy(true);
    try {
      const { response, data } = await syncFetch("GET", key);
      if (response.ok) setStatus(data.found ? "Cloud connected · backup found" : "Cloud connected · no backup yet");
      else if (response.status === 503 || data.configured === false) setStatus("Cloud database not connected yet · IndexedDB data is safe");
      else setStatus(data.message ?? "Cloud check failed");
    } catch {
      setStatus("Offline · IndexedDB data is safe");
    } finally {
      setBusy(false);
    }
  }

  async function backupNow() {
    const key = ensureKey();
    const payload = collectPayload();
    setBusy(true);
    try {
      const { response, data } = await syncFetch("PUT", key, payload);
      if (response.ok) {
        autoSyncRef.current = true;
        localStorage.setItem(AUTO_SYNC_STORAGE, "1");
        lastSnapshotRef.current = JSON.stringify(payload.state);
        await db.syncQueue.clear();
        setStatus("Backed up · automatic sync enabled");
      } else if (response.status === 503 || data.configured === false) setStatus("Cloud database not connected yet · IndexedDB data is safe");
      else setStatus(data.message ?? "Backup failed");
    } catch {
      setStatus("Offline · IndexedDB data is safe");
    } finally {
      setBusy(false);
    }
  }

  async function restoreCloud() {
    const key = ensureKey();
    setBusy(true);
    try {
      const { response, data } = await syncFetch("GET", key);
      if (!response.ok) {
        setStatus(response.status === 503 || data.configured === false ? "Cloud database not connected yet · IndexedDB data is safe" : data.message ?? "Restore failed");
        return;
      }
      if (!data.found || !data.payload) {
        setStatus("Cloud connected · no backup found for this key");
        return;
      }
      if (!window.confirm("Replace this device's local workout data with the cloud backup?")) return;
      applyPayload(data.payload);
      await db.syncQueue.clear();
      autoSyncRef.current = true;
      localStorage.setItem(AUTO_SYNC_STORAGE, "1");
      setStatus("Cloud backup restored");
      window.location.reload();
    } catch {
      setStatus("Offline · IndexedDB data is safe");
    } finally {
      setBusy(false);
    }
  }

  async function copyKey() {
    const key = ensureKey();
    try {
      await navigator.clipboard.writeText(key);
      setStatus("Sync key copied");
    } catch {
      setStatus("Copy failed · select the key manually");
    }
  }

  async function installApp() {
    if (installPrompt) {
      await installPrompt.prompt();
      const choice = await installPrompt.userChoice;
      if (choice.outcome === "accepted") setStandalone(true);
      setInstallPrompt(null);
      return;
    }
    setSyncOpen(true);
    setMoreOpen(false);
    setInstallHelp(isIos ? "On iPhone: tap Safari's Share button, then Add to Home Screen." : "Open your browser menu and choose Install app or Add to Home Screen.");
  }

  const moreIsActive = ["/data", "/health", "/watch"].some((route) => pathname.startsWith(route));

  return (
    <>
      <nav className="v11-bottom-nav" aria-label="Primary navigation">
        <a className={pathname === "/" ? "active" : ""} href="/">
          <span className="v11-nav-icon">⌂</span><span>Home</span>
        </a>
        <a className={pathname.startsWith("/gym") ? "active" : ""} href="/gym">
          <span className="v11-nav-icon">⚡</span><span>Gym</span>
        </a>
        <a className={pathname.startsWith("/history") ? "active" : ""} href="/history">
          <span className="v11-nav-icon">◷</span><span>History</span>
        </a>
        <button className={progressOpen ? "active" : ""} type="button" onClick={() => setProgressOpen(true)}>
          <span className="v11-nav-icon">▥</span><span>Progress</span>
        </button>
        <button className={moreOpen || moreIsActive ? "active" : ""} type="button" onClick={() => setMoreOpen((value) => !value)}>
          <span className="v11-nav-icon">•••</span><span>More</span>
        </button>
      </nav>

      {moreOpen && (
        <div className="v11-more-backdrop" onClick={() => setMoreOpen(false)}>
          <section className="v11-more-sheet" onClick={(event) => event.stopPropagation()} aria-label="More options">
            <div className="v11-more-handle" />
            <div className="v11-more-heading">
              <div><p>MORE</p><h2>Tools & connections</h2></div>
              <button type="button" onClick={() => setMoreOpen(false)}>×</button>
            </div>
            <div className="v11-more-grid">
              <a href="/data"><span>🛡</span><strong>Data Center</strong><small>Backups, restore & export</small></a>
              <a href="/health"><span>🍎</span><strong>Apple Health</strong><small>HealthKit bridge</small></a>
              <a href="/watch"><span>⌚</span><strong>Apple Watch</strong><small>Watch session bridge</small></a>
              <button type="button" onClick={() => { setMoreOpen(false); setSyncOpen(true); }}><span>☁</span><strong>Sync</strong><small>Device & cloud settings</small></button>
              {!standalone && <button type="button" onClick={installApp}><span>＋</span><strong>Install App</strong><small>Add to Home Screen</small></button>}
            </div>
          </section>
        </div>
      )}

      {progressOpen && <ProgressDashboard onClose={() => setProgressOpen(false)} />}

      {syncOpen && (
        <div className="v05-backdrop" onClick={() => setSyncOpen(false)}>
          <section className="v05-panel" onClick={(event) => event.stopPropagation()}>
            <div className="v05-heading">
              <div><p>V1.1 · PHASE A</p><h2>Device & sync</h2></div>
              <button type="button" onClick={() => setSyncOpen(false)}>×</button>
            </div>
            <div className="v05-status">{status}</div>
            <div className="v05-block">
              <h3>Cloud sync key</h3>
              <p>One key covers routines, drafts, workout history, bodyweight, Gym Mode data, and locally imported Apple Health snapshots. IndexedDB remains the device-side durable source.</p>
              <div className="v05-key-row">
                <input value={syncKey} onChange={(event) => { setSyncKey(event.target.value.trim()); localStorage.setItem(SYNC_KEY_STORAGE, event.target.value.trim()); localStorage.removeItem(AUTO_SYNC_STORAGE); autoSyncRef.current = false; }} placeholder="Generate or paste sync key" spellCheck={false} />
                <button type="button" onClick={copyKey}>Copy</button>
              </div>
              <div className="v05-actions">
                <button type="button" disabled={busy} onClick={backupNow}>Back up now</button>
                <button type="button" disabled={busy} onClick={restoreCloud}>Restore cloud</button>
                <button type="button" disabled={busy} onClick={checkCloud}>Check</button>
              </div>
              <small>After the first successful backup, this device pushes changes about every 20 seconds and clears the local sync queue only after the server accepts the snapshot.</small>
            </div>
            <div className="v05-block">
              <h3>{standalone ? "Installed" : "Install on this device"}</h3>
              <p>{standalone ? "Workout Tracker is running as an installed app." : "Install it to your Home Screen. Phase A now launches into the new Home dashboard."}</p>
              {!standalone && <button type="button" className="v05-install" onClick={installApp}>Install app</button>}
              {installHelp && <small>{installHelp}</small>}
            </div>
            <p className="v05-footnote">Workout logging remains local-first. HealthKit, Watch sync, cloud sync, and internet failures never block a session.</p>
          </section>
        </div>
      )}
    </>
  );
}
