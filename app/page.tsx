"use client";

import { useEffect, useMemo, useState } from "react";

const HISTORY_KEY = "workout-tracker:v0.2:history";
const ROUTINES_KEY = "workout-tracker:v0.4:routines";
const ACTIVE_ROUTINE_KEY = "workout-tracker:v0.4:active-routine";
const V07_DRAFTS_KEY = "workout-tracker:v0.7:drafts";
const BODYWEIGHT_KEY = "workout-tracker:v0.6:bodyweight";

type HistoryItem = {
  id?: string;
  name?: string;
  completedAt?: string;
  totalVolume?: number;
  completedSets?: number;
  durationSeconds?: number;
  prs?: string[];
};

type Routine = {
  id: string;
  name: string;
  exerciseIds?: string[];
};

type BodyweightEntry = {
  value?: number;
  pounds?: number;
  weight?: number;
  recordedAt?: string;
};

type DraftMap = Record<string, { startedAt?: string | null; sessionActive?: boolean; exercises?: unknown[]; pausedAt?: string | null }>;

function readJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function formatDate(value?: string) {
  if (!value) return "No workouts yet";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "No workouts yet";
  return new Intl.DateTimeFormat(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
  }).format(date);
}

function formatDuration(seconds = 0) {
  const minutes = Math.max(0, Math.round(seconds / 60));
  return `${minutes} min`;
}

function draftIsActive(draft: DraftMap[string] | null | undefined) {
  if (!draft?.startedAt) return false;
  const declaredActive = draft.sessionActive ?? true;
  if (!declaredActive) return false;
  const started = new Date(draft.startedAt).getTime();
  const age = Date.now() - started;
  return Number.isFinite(started) && age >= 0 && age <= 6 * 60 * 60 * 1000;
}

export default function Home() {
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [routines, setRoutines] = useState<Routine[]>([]);
  const [activeRoutineId, setActiveRoutineId] = useState("");
  const [drafts, setDrafts] = useState<DraftMap>({});
  const [bodyweight, setBodyweight] = useState<BodyweightEntry[]>([]);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setHistory(readJson<HistoryItem[]>(HISTORY_KEY, []));
    setRoutines(readJson<Routine[]>(ROUTINES_KEY, []));
    setActiveRoutineId(localStorage.getItem(ACTIVE_ROUTINE_KEY) ?? "");
    setDrafts(readJson<DraftMap>(V07_DRAFTS_KEY, {}));
    setBodyweight(readJson<BodyweightEntry[]>(BODYWEIGHT_KEY, []));
    setReady(true);
  }, []);

  const activeRoutine = useMemo(
    () => routines.find((routine) => routine.id === activeRoutineId) ?? routines[0] ?? null,
    [routines, activeRoutineId],
  );

  const recentWorkout = history[0] ?? null;
  const currentDraft = activeRoutine ? drafts[activeRoutine.id] : null;
  const activeDraft = draftIsActive(currentDraft) ? currentDraft : null;

  const weekly = useMemo(() => {
    const cutoff = Date.now() - 7 * 24 * 60 * 60 * 1000;
    const items = history.filter((item) => {
      const time = item.completedAt ? new Date(item.completedAt).getTime() : 0;
      return Number.isFinite(time) && time >= cutoff;
    });
    return {
      workouts: items.length,
      sets: items.reduce((sum, item) => sum + Number(item.completedSets ?? 0), 0),
      volume: items.reduce((sum, item) => sum + Number(item.totalVolume ?? 0), 0),
    };
  }, [history]);

  const latestWeight = useMemo(() => {
    const sorted = [...bodyweight].sort((a, b) => {
      const aTime = a.recordedAt ? new Date(a.recordedAt).getTime() : 0;
      const bTime = b.recordedAt ? new Date(b.recordedAt).getTime() : 0;
      return bTime - aTime;
    });
    const value = sorted[0]?.pounds ?? sorted[0]?.weight ?? sorted[0]?.value;
    return Number.isFinite(Number(value)) ? Number(value) : null;
  }, [bodyweight]);

  const latestPr = history.find((item) => item.prs?.length)?.prs?.[0] ?? null;
  const today = new Intl.DateTimeFormat(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
  }).format(new Date());

  if (!ready) {
    return <main className="v11-home"><div className="v11-home-loading">Loading your dashboard…</div></main>;
  }

  return (
    <main className="v11-home">
      <header className="v11-home-header">
        <div>
          <p className="v11-kicker">WORKOUT TRACKER</p>
          <h1>Home</h1>
          <p>{today}</p>
        </div>
        <div className="v11-home-status">Local-first · ready</div>
      </header>

      <section className="v11-workout-hero">
        <div>
          <p className="v11-kicker">TODAY&apos;S WORKOUT</p>
          <h2>{activeRoutine?.name ?? "Choose a routine"}</h2>
          <p>
            {activeDraft
              ? activeDraft.pausedAt
                ? "Your workout is paused and saved exactly where you left it."
                : "You have an unfinished workout ready to continue."
              : activeRoutine
                ? `${activeRoutine.exerciseIds?.length ?? 0} planned exercises · ready when you are.`
                : "Open Gym Mode to choose or create your next session."}
          </p>
        </div>
        <a className="v11-primary-action" href="/gym">
          {activeDraft ? (activeDraft.pausedAt ? "Resume paused workout" : "Resume workout") : "Start workout"}
          <span>→</span>
        </a>
      </section>

      <section className="v11-home-grid">
        <article className="v11-home-card">
          <div className="v11-card-heading">
            <p className="v11-kicker">THIS WEEK</p>
            <a href="/history">History →</a>
          </div>
          <div className="v11-stat-row">
            <div><strong>{weekly.workouts}</strong><span>workouts</span></div>
            <div><strong>{weekly.sets}</strong><span>sets</span></div>
            <div><strong>{Math.round(weekly.volume).toLocaleString()}</strong><span>lb volume</span></div>
          </div>
        </article>

        <article className="v11-home-card">
          <div className="v11-card-heading">
            <p className="v11-kicker">LAST SESSION</p>
            <a href="/history">Open →</a>
          </div>
          <h3>{recentWorkout?.name ?? "No completed workout yet"}</h3>
          <p className="v11-card-copy">{formatDate(recentWorkout?.completedAt)}</p>
          {recentWorkout && (
            <div className="v11-mini-meta">
              <span>{recentWorkout.completedSets ?? 0} sets</span>
              <span>{formatDuration(recentWorkout.durationSeconds)}</span>
            </div>
          )}
        </article>

        <a className="v11-home-card v11-home-card-link" href="/progress">
          <div className="v11-card-heading">
            <p className="v11-kicker">LATEST PR</p>
            <span>Progress →</span>
          </div>
          <h3>{latestPr ?? "No PR recorded yet"}</h3>
          <p className="v11-card-copy">Open your organized training dashboard and strength trends.</p>
        </a>

        <a className="v11-home-card v11-home-card-link" href="/bodyweight">
          <div className="v11-card-heading">
            <p className="v11-kicker">BODYWEIGHT</p>
            <span>Manage →</span>
          </div>
          <h3>{latestWeight == null ? "Not logged" : `${latestWeight.toFixed(1)} lb`}</h3>
          <p className="v11-card-copy">Add, edit, or delete a bodyweight entry on its dedicated screen.</p>
        </a>
      </section>

      <section className="v11-quick-actions">
        <p className="v11-kicker">QUICK ACCESS</p>
        <div>
          <a href="/gym">⚡ Gym Mode</a>
          <a href="/history">🕘 Workout History</a>
          <a href="/progress">📊 Progress</a>
          <a href="/bodyweight">⚖ Bodyweight</a>
          <a href="/data">🛡 Data & Backups</a>
        </div>
      </section>
    </main>
  );
}
