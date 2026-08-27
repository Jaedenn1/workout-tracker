"use client";

import { useEffect, useMemo, useState, type ChangeEvent } from "react";

const HISTORY_KEY = "workout-tracker:v0.2:history";
const BODYWEIGHT_KEY = "workout-tracker:v0.6:bodyweight";
const HEALTH_IMPORTS_KEY = "workout-tracker:v0.8:healthkit-imports";

type WorkoutHistoryItem = {
  id?: string;
  name?: string;
  completedAt?: string;
  durationSeconds?: number;
  totalVolume?: number;
  completedSets?: number;
};

type BodyweightEntry = {
  id?: string;
  value?: number;
  pounds?: number;
  weight?: number;
  recordedAt?: string;
};

type BridgeBodyweight = {
  id: string;
  recordedAt: string;
  pounds: number;
};

type BridgeWorkout = {
  id: string;
  name: string;
  startedAt: string;
  completedAt: string;
  durationSeconds: number;
  totalVolume: number | null;
  completedSets: number | null;
};

type HealthBridgeEnvelope = {
  version: 1;
  exportedAt: string;
  source: string;
  bodyweight: BridgeBodyweight[];
  workouts: BridgeWorkout[];
};

type HealthImportSnapshot = HealthBridgeEnvelope & {
  importId: string;
  importedAt: string;
};

function safeArray<T>(raw: string | null): T[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function validDate(value: unknown): Date | null {
  if (typeof value !== "string") return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function normalizeBodyweight(input: unknown[]): BridgeBodyweight[] {
  return input.flatMap((entry, index) => {
    if (!entry || typeof entry !== "object") return [];
    const item = entry as Record<string, unknown>;
    const pounds = Number(item.pounds ?? item.weight ?? item.value);
    const recordedAt = validDate(item.recordedAt);
    if (!Number.isFinite(pounds) || pounds <= 0 || !recordedAt) return [];

    return [{
      id: String(item.id ?? `weight-${recordedAt.getTime()}-${index}`),
      recordedAt: recordedAt.toISOString(),
      pounds,
    }];
  });
}

function normalizeWorkouts(input: unknown[]): BridgeWorkout[] {
  return input.flatMap((entry, index) => {
    if (!entry || typeof entry !== "object") return [];
    const item = entry as Record<string, unknown>;
    const completedAt = validDate(item.completedAt);
    if (!completedAt) return [];

    const rawDuration = Number(item.durationSeconds ?? 0);
    const durationSeconds = Number.isFinite(rawDuration) ? Math.max(0, rawDuration) : 0;
    const explicitStart = validDate(item.startedAt);
    const startedAt = explicitStart ?? new Date(completedAt.getTime() - durationSeconds * 1000);
    const totalVolume = Number(item.totalVolume);
    const completedSets = Number(item.completedSets);

    return [{
      id: String(item.id ?? `workout-${completedAt.getTime()}-${index}`),
      name: String(item.name ?? "Strength Training"),
      startedAt: startedAt.toISOString(),
      completedAt: completedAt.toISOString(),
      durationSeconds,
      totalVolume: Number.isFinite(totalVolume) ? totalVolume : null,
      completedSets: Number.isFinite(completedSets) ? completedSets : null,
    }];
  });
}

function buildExport(history: WorkoutHistoryItem[], bodyweight: BodyweightEntry[]): HealthBridgeEnvelope {
  return {
    version: 1,
    exportedAt: new Date().toISOString(),
    source: "workout-tracker-web-v0.8",
    bodyweight: normalizeBodyweight(bodyweight),
    workouts: normalizeWorkouts(history),
  };
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

export default function HealthBridge() {
  const [history, setHistory] = useState<WorkoutHistoryItem[]>([]);
  const [bodyweight, setBodyweight] = useState<BodyweightEntry[]>([]);
  const [imports, setImports] = useState<HealthImportSnapshot[]>([]);
  const [status, setStatus] = useState("Ready for an offline file bridge.");
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    setHistory(safeArray<WorkoutHistoryItem>(localStorage.getItem(HISTORY_KEY)));
    setBodyweight(safeArray<BodyweightEntry>(localStorage.getItem(BODYWEIGHT_KEY)));
    setImports(safeArray<HealthImportSnapshot>(localStorage.getItem(HEALTH_IMPORTS_KEY)));
    setHydrated(true);
  }, []);

  const exportEnvelope = useMemo(() => buildExport(history, bodyweight), [history, bodyweight]);
  const latestImport = imports[0] ?? null;

  function exportToIPhone() {
    const blob = new Blob([JSON.stringify(exportEnvelope, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `workout-health-bridge-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 0);
    setStatus(`Exported ${exportEnvelope.workouts.length} workouts and ${exportEnvelope.bodyweight.length} bodyweight entries.`);
  }

  async function importFromAppleHealth(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    try {
      const parsed = JSON.parse(await file.text()) as Partial<HealthBridgeEnvelope>;
      if (parsed.version !== 1 || !Array.isArray(parsed.workouts) || !Array.isArray(parsed.bodyweight)) {
        throw new Error("This is not a Workout Tracker v0.8 bridge file.");
      }

      const workouts = normalizeWorkouts(parsed.workouts);
      const weights = normalizeBodyweight(parsed.bodyweight);
      if (!workouts.length && !weights.length) {
        throw new Error("The bridge file does not contain usable workout or bodyweight entries.");
      }

      const snapshot: HealthImportSnapshot = {
        version: 1,
        exportedAt: validDate(parsed.exportedAt)?.toISOString() ?? new Date().toISOString(),
        source: typeof parsed.source === "string" ? parsed.source : "apple-health-v0.8",
        workouts,
        bodyweight: weights,
        importId: `health-import-${Date.now()}`,
        importedAt: new Date().toISOString(),
      };

      const next = [snapshot, ...imports].slice(0, 20);
      localStorage.setItem(HEALTH_IMPORTS_KEY, JSON.stringify(next));
      setImports(next);
      setStatus(`Imported an Apple Health snapshot with ${workouts.length} workouts and ${weights.length} bodyweight entries.`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Could not read that bridge file.");
    }
  }

  if (!hydrated) {
    return <main className="health-shell"><p className="health-muted">Loading Health bridge…</p></main>;
  }

  return (
    <main className="health-shell">
      <header className="health-hero">
        <div>
          <p className="health-eyebrow">V0.8 · NATIVE iOS + HEALTHKIT</p>
          <h1>Apple Health Bridge</h1>
          <p>
            Your browser never requests Health access. The native iPhone companion handles HealthKit permissions,
            while this page moves selected workout and bodyweight data through a local JSON file.
          </p>
        </div>
        <a className="health-back" href="/gym">← Gym Mode</a>
      </header>

      <div className="health-status" role="status">{status}</div>

      <section className="health-grid">
        <article className="health-card">
          <span className="health-icon">📱</span>
          <p className="health-kicker">NATIVE COMPANION</p>
          <h2>HealthKit stays on iPhone</h2>
          <p>
            The SwiftUI companion requests Apple Health permission only after you tap Connect. It can read recent
            strength workouts and bodyweight, then write only the entries you explicitly select.
          </p>
          <a
            className="health-secondary"
            href="https://github.com/Jaedenn1/workout-tracker/tree/main/ios/WorkoutTrackerNative"
            target="_blank"
            rel="noreferrer"
          >
            Open iOS source ↗
          </a>
        </article>

        <article className="health-card">
          <span className="health-icon">⬆️</span>
          <p className="health-kicker">WEB → APPLE HEALTH</p>
          <h2>Export your tracker data</h2>
          <div className="health-counts">
            <div><strong>{exportEnvelope.workouts.length}</strong><span>workouts</span></div>
            <div><strong>{exportEnvelope.bodyweight.length}</strong><span>weights</span></div>
          </div>
          <p>Download one local bridge file, open it in the native companion, choose exactly what to write, then approve Health access.</p>
          <button className="health-primary" type="button" onClick={exportToIPhone}>Export bridge file</button>
        </article>

        <article className="health-card">
          <span className="health-icon">⬇️</span>
          <p className="health-kicker">APPLE HEALTH → TRACKER</p>
          <h2>Import a Health snapshot</h2>
          <p>
            Import an export from the native companion. Apple Health snapshots stay isolated from your progression
            history so they cannot create fake PRs or alter your next-target calculations.
          </p>
          <label className="health-secondary" htmlFor="health-bridge-file">Import bridge file</label>
          <input
            id="health-bridge-file"
            className="health-file-input"
            type="file"
            accept="application/json,.json"
            onChange={importFromAppleHealth}
          />
        </article>
      </section>

      <section className="health-panel">
        <div className="health-panel-heading">
          <div>
            <p className="health-kicker">LATEST APPLE HEALTH SNAPSHOT</p>
            <h2>{latestImport ? formatDate(latestImport.importedAt) : "Nothing imported yet"}</h2>
          </div>
          {latestImport && <span>{latestImport.source}</span>}
        </div>

        {latestImport ? (
          <div className="health-summary-row">
            <div><strong>{latestImport.workouts.length}</strong><span>strength workouts</span></div>
            <div><strong>{latestImport.bodyweight.length}</strong><span>bodyweight entries</span></div>
            <div><strong>{imports.length}</strong><span>saved snapshots</span></div>
          </div>
        ) : (
          <p className="health-muted">Use the native companion to export Apple Health data, then import the JSON here.</p>
        )}
      </section>

      <section className="health-panel">
        <p className="health-kicker">HOW V0.8 WORKS</p>
        <div className="health-steps">
          <div><span>1</span><p>Export a bridge file from Workout Tracker.</p></div>
          <div><span>2</span><p>Open it in the native iPhone companion and request HealthKit access.</p></div>
          <div><span>3</span><p>Select the exact workouts or weights you want written to Apple Health.</p></div>
          <div><span>4</span><p>Export a Health snapshot back to the PWA whenever you want a local reference copy.</p></div>
        </div>
        <p className="health-note">
          Health data is not required to log a workout. Gym Mode remains local-first and works normally when HealthKit,
          cloud sync, or the internet are unavailable.
        </p>
      </section>
    </main>
  );
}
