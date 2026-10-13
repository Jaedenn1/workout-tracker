"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { db } from "../lib/database";
import { Button, Field, ListRow, Sheet, TextInput } from "../ui";

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
  else localStorage.removeItem(ACTIVE_ROUTINE_KEY);
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
  const [syncKey, setSyncKey] = useState("");
  const [status, setStatus] = useState("IndexedDB-backed · local-first");
  const [busy, setBusy] = useState(false);
  const [standalone, setStandalone] = useState(false);
  const [installPrompt, setInstallPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isIos, setIsIos] = useState(false);
  const [installHelp, setInstallHelp] = useState("");
  const [autoSync, setAutoSync] = useState(false);
  const lastSnapshotRef = useRef("");

  useEffect(() => {
    if ("serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js").catch(() => undefined);
    const nav = navigator as Navigator & { standalone?: boolean };
    setStandalone(window.matchMedia("(display-mode: standalone)").matches || Boolean(nav.standalone));
    setIsIos(/iphone|ipad|ipod/i.test(navigator.userAgent));
    const existingKey = localStorage.getItem(SYNC_KEY_STORAGE) ?? "";
    setSyncKey(existingKey);
    setAutoSync(localStorage.getItem(AUTO_SYNC_STORAGE) === "1");

    const handleInstall = (event: Event) => {
      event.preventDefault();
      setInstallPrompt(event as BeforeInstallPromptEvent);
    };
    const handleProgress = () => window.location.assign("/progress");
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
    if (!syncKey || !autoSync) return;
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
          setAutoSync(false);
          localStorage.setItem(AUTO_SYNC_STORAGE, "0");
          setStatus("Cloud database not connected yet · IndexedDB data is safe");
        }
      } catch {
        setStatus("Offline · IndexedDB data is safe");
      }
    }, 20000);
    return () => window.clearInterval(interval);
  }, [syncKey, autoSync]);

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
        setAutoSync(true);
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
      setAutoSync(true);
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

  const progressIsActive = pathname.startsWith("/progress") || pathname.startsWith("/bodyweight");
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
        <a className={progressIsActive ? "active" : ""} href="/progress">
          <span className="v11-nav-icon">▥</span><span>Progress</span>
        </a>
        <button className={moreOpen || moreIsActive ? "active" : ""} type="button" onClick={() => setMoreOpen((value) => !value)}>
          <span className="v11-nav-icon">•••</span><span>More</span>
        </button>
      </nav>

      <Sheet open={moreOpen} onClose={() => setMoreOpen(false)} title="Settings & connections">
        <div className="ds-stack">
          <section className="ds-rise">
            <p className="ds-eyebrow">Data & device</p>
            <div style={{ marginTop: 10 }}>
              <ListRow
                href="/data"
                icon={<span aria-hidden="true">🛡</span>}
                title="Data Center"
                sub="Backups, restore and export"
                chevron
              />
              <ListRow
                icon={<span aria-hidden="true">☁</span>}
                title="Device & Sync"
                sub="Cloud backup and this device"
                chevron
                onClick={() => { setMoreOpen(false); setSyncOpen(true); }}
              />
            </div>
          </section>

          <section className="ds-rise ds-rise--1">
            <p className="ds-eyebrow">Apple</p>
            <div style={{ marginTop: 10 }}>
              <ListRow
                href="/health"
                icon={<span aria-hidden="true">🍎</span>}
                title="Apple Health"
                sub="HealthKit bridge and imports"
                chevron
              />
              <ListRow
                href="/watch"
                icon={<span aria-hidden="true">⌚</span>}
                title="Apple Watch"
                sub="Watch workout session bridge"
                chevron
              />
            </div>
          </section>

          {!standalone && (
            <section className="ds-rise ds-rise--2">
              <p className="ds-eyebrow">App</p>
              <div style={{ marginTop: 10 }}>
                <ListRow
                  icon={<span aria-hidden="true">＋</span>}
                  title="Install Workout Tracker"
                  sub="Add the app to your Home Screen"
                  chevron
                  onClick={installApp}
                />
              </div>
            </section>
          )}
        </div>
      </Sheet>

      <Sheet open={syncOpen} onClose={() => setSyncOpen(false)} title="Device & sync">
        <div className="ds-stack">
          <div className="ds-muted ds-rise">{status}</div>

          <section className="ds-rise ds-rise--1">
            <h3 className="ds-section-title">Cloud backup</h3>
            <p className="ds-muted" style={{ margin: "6px 0 12px" }}>Your routines, drafts, history, bodyweight, Gym Mode settings and Health imports use one private sync key. Local IndexedDB remains the device-side source of truth.</p>
            <Field label="Sync key">
              <TextInput value={syncKey} onChange={(event) => { setSyncKey(event.target.value.trim()); localStorage.setItem(SYNC_KEY_STORAGE, event.target.value.trim()); localStorage.removeItem(AUTO_SYNC_STORAGE); setAutoSync(false); }} placeholder="Generate or paste sync key" spellCheck={false} />
            </Field>
            <div style={{ marginTop: 8 }}>
              <Button variant="secondary" size="sm" onClick={copyKey}>Copy key</Button>
            </div>
            <div style={{ marginTop: 8 }}>
              <Button variant="primary" block disabled={busy} onClick={backupNow}>Back up now</Button>
            </div>
            <div className="ds-grid-2" style={{ marginTop: 8 }}>
              <Button variant="secondary" block disabled={busy} onClick={restoreCloud}>Restore</Button>
              <Button variant="secondary" block disabled={busy} onClick={checkCloud}>Check</Button>
            </div>
            <p className="ds-muted" style={{ fontSize: "0.78rem", margin: "10px 0 0" }}>After the first successful backup, this device pushes changes about every 20 seconds and clears the local queue only after the server accepts the snapshot.</p>
          </section>

          <section className="ds-rise ds-rise--2">
            <h3 className="ds-section-title">{standalone ? "Installed app" : "Install on this device"}</h3>
            <p className="ds-muted" style={{ margin: "6px 0 12px" }}>{standalone ? "Workout Tracker is running as an installed app." : "Install it so the tracker opens like a normal app from your Home Screen."}</p>
            {!standalone && <Button variant="secondary" block onClick={installApp}>Install app</Button>}
            {installHelp && <p className="ds-muted" style={{ fontSize: "0.78rem", margin: "10px 0 0" }}>{installHelp}</p>}
          </section>

          <p className="ds-muted ds-rise ds-rise--3" style={{ fontSize: "0.78rem" }}>Workout logging stays local-first. HealthKit, Watch, cloud and internet failures never block a session.</p>
        </div>
      </Sheet>
    </>
  );
}
