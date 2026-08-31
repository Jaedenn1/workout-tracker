"use client";

import { useEffect, useMemo, useState } from "react";
import { defaultRoutines, getExerciseDefinition, type RoutineDefinition } from "../data/training";
import {
  BODYWEIGHT_KEY,
  HISTORY_KEY,
  READINESS_KEY,
  allExerciseSummaries,
  formatDuration,
  formatShortDate,
  localDay,
  safeArray,
  type BodyweightEntry,
  type ReadinessRecord,
  type WorkoutHistoryItem,
} from "../lib/trainingIntelligence";

const ROUTINES_KEY = "workout-tracker:v0.4:routines";
const ACTIVE_ROUTINE_KEY = "workout-tracker:v0.4:active-routine";
const DRAFTS_KEY = "workout-tracker:v0.7:drafts";

type Draft = { startedAt?: string | null; sessionActive?: boolean };

function readRoutines() {
  try {
    const parsed = JSON.parse(localStorage.getItem(ROUTINES_KEY) ?? "null");
    return Array.isArray(parsed) && parsed.length ? (parsed as RoutineDefinition[]) : defaultRoutines;
  } catch {
    return defaultRoutines;
  }
}

function activeDraft(draft?: Draft) {
  if (!draft?.sessionActive || !draft.startedAt) return false;
  const started = new Date(draft.startedAt).getTime();
  const age = Date.now() - started;
  return Number.isFinite(started) && age >= 0 && age <= 6 * 60 * 60 * 1000;
}

function readinessLabel(record: ReadinessRecord | null) {
  if (!record) return "Add a 10-second readiness check before training.";
  return `${record.sleep} sleep · ${record.energy} energy · ${record.soreness} soreness`;
}

export default function TodayDashboard() {
  const [history, setHistory] = useState<WorkoutHistoryItem[]>([]);
  const [routines, setRoutines] = useState<RoutineDefinition[]>(defaultRoutines);
  const [activeRoutineId, setActiveRoutineId] = useState("legs");
  const [draftRunning, setDraftRunning] = useState(false);
  const [bodyweight, setBodyweight] = useState<BodyweightEntry[]>([]);
  const [readiness, setReadiness] = useState<ReadinessRecord[]>([]);
  const today = localDay(new Date());

  useEffect(() => {
    const nextHistory = safeArray<WorkoutHistoryItem>(localStorage.getItem(HISTORY_KEY));
    const nextRoutines = readRoutines();
    let active = localStorage.getItem(ACTIVE_ROUTINE_KEY) ?? nextRoutines[0]?.id ?? "legs";
    if (!nextRoutines.some((routine) => routine.id === active)) active = nextRoutines[0]?.id ?? "legs";
    let drafts: Record<string, Draft> = {};
    try { drafts = JSON.parse(localStorage.getItem(DRAFTS_KEY) ?? "{}") as Record<string, Draft>; } catch { drafts = {}; }
    setHistory(nextHistory);
    setRoutines(nextRoutines);
    setActiveRoutineId(active);
    setDraftRunning(activeDraft(drafts[active]));
    setBodyweight(safeArray<BodyweightEntry>(localStorage.getItem(BODYWEIGHT_KEY)));
    setReadiness(safeArray<ReadinessRecord>(localStorage.getItem(READINESS_KEY)));
  }, []);

  const activeRoutine = routines.find((routine) => routine.id === activeRoutineId) ?? routines[0] ?? defaultRoutines[0];
  const latestWeight = [...bodyweight].sort((a, b) => String(b.recordedAt).localeCompare(String(a.recordedAt)))[0];
  const todayReadiness = readiness.find((item) => item.date === today) ?? null;
  const summaries = useMemo(() => allExerciseSummaries(history), [history]);
  const summaryMap = useMemo(() => new Map(summaries.map((item) => [item.id, item])), [summaries]);
  const progressionReady = activeRoutine.exerciseIds.filter((id) => summaryMap.get(id)?.progression?.action === "increase").length;
  const plannedSets = activeRoutine.exerciseIds.reduce((sum, id) => sum + (getExerciseDefinition(id)?.setCount ?? 3), 0);
  const lastSameRoutine = history.find((workout) => workout.routineId === activeRoutine.id || workout.name === activeRoutine.name);
  const latestPr = history.flatMap((workout) => (workout.prs ?? []).map((pr) => ({ pr, completedAt: workout.completedAt })))[0];
  const firstTarget = activeRoutine.exerciseIds.map((id) => summaryMap.get(id)).find((item) => item?.progression)?.progression;

  function setReadinessField<K extends "sleep" | "energy" | "soreness">(field: K, value: ReadinessRecord[K]) {
    const base: ReadinessRecord = todayReadiness ?? {
      date: today,
      sleep: "ok",
      energy: "normal",
      soreness: "some",
      updatedAt: new Date().toISOString(),
    };
    const nextRecord = { ...base, [field]: value, updatedAt: new Date().toISOString() } as ReadinessRecord;
    const next = [nextRecord, ...readiness.filter((item) => item.date !== today)].slice(0, 90);
    setReadiness(next);
    localStorage.setItem(READINESS_KEY, JSON.stringify(next));
  }

  return (
    <main className="ti-shell ti-home">
      <header className="ti-topbar">
        <div><p className="ti-eyebrow">TODAY · V1.3</p><h1>Training Console</h1></div>
        <a className="ti-icon-link" href="/routines">Routines</a>
      </header>

      <section className="ti-today-hero">
        <div className="ti-hero-copy">
          <p className="ti-eyebrow">TODAY'S WORKOUT</p>
          <h2>{activeRoutine.name}</h2>
          <p>{activeRoutine.exerciseIds.length} exercises · about {plannedSets} working sets{progressionReady ? ` · ${progressionReady} ready to progress` : ""}</p>
          <div className="ti-hero-actions">
            <a className="ti-primary" href="/gym">{draftRunning ? "Resume workout" : "Start workout"}</a>
            <a className="ti-secondary" href="/progress">View targets</a>
          </div>
        </div>
        <div className="ti-hero-stat">
          <span>Last {activeRoutine.name}</span>
          <strong>{lastSameRoutine ? formatShortDate(lastSameRoutine.completedAt) : "No session yet"}</strong>
          <small>{lastSameRoutine ? `${formatDuration(lastSameRoutine.durationSeconds)} · ${Math.round(lastSameRoutine.totalVolume).toLocaleString()} lb` : "Build your baseline today."}</small>
        </div>
      </section>

      <section className="ti-readiness-card">
        <div className="ti-section-head"><div><p className="ti-eyebrow">READINESS</p><h2>How are you today?</h2></div><span>{readinessLabel(todayReadiness)}</span></div>
        <div className="ti-readiness-grid">
          <div><strong>Sleep</strong><div className="ti-segments">{(["poor", "ok", "good"] as const).map((value) => <button key={value} className={todayReadiness?.sleep === value ? "active" : ""} onClick={() => setReadinessField("sleep", value)}>{value}</button>)}</div></div>
          <div><strong>Energy</strong><div className="ti-segments">{(["low", "normal", "high"] as const).map((value) => <button key={value} className={todayReadiness?.energy === value ? "active" : ""} onClick={() => setReadinessField("energy", value)}>{value}</button>)}</div></div>
          <div><strong>Soreness</strong><div className="ti-segments">{(["none", "some", "high"] as const).map((value) => <button key={value} className={todayReadiness?.soreness === value ? "active" : ""} onClick={() => setReadinessField("soreness", value)}>{value}</button>)}</div></div>
        </div>
      </section>

      <section className="ti-home-grid">
        <a className="ti-card ti-click-card" href="/progress"><span>Next target</span><strong>{firstTarget?.target ?? "Log a baseline"}</strong><small>{firstTarget?.label ?? "Progression will appear after a session"} →</small></a>
        <a className="ti-card ti-click-card" href="/bodyweight"><span>Bodyweight</span><strong>{latestWeight ? `${Number(latestWeight.value).toFixed(1)} lb` : "Add weight"}</strong><small>View and edit entries →</small></a>
        <a className="ti-card ti-click-card" href="/prs"><span>Latest PR</span><strong>{latestPr?.pr ?? "No PR yet"}</strong><small>{latestPr ? formatShortDate(latestPr.completedAt) : "Your record board is ready"} →</small></a>
        <a className="ti-card ti-click-card" href="/history"><span>Last session</span><strong>{history[0]?.name ?? "No workouts yet"}</strong><small>{history[0] ? `${history[0].completedSets} sets · ${formatDuration(history[0].durationSeconds)}` : "History starts with workout #1"} →</small></a>
      </section>

      <section className="ti-quick-row">
        <a href="/gym">⚡ Gym</a><a href="/progress">▥ Progress</a><a href="/routines">≡ Routines</a><a href="/prs">🏆 PRs</a>
      </section>
    </main>
  );
}
