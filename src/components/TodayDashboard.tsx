"use client";

import { useEffect, useMemo, useState } from "react";
import { buildAdaptiveWeek } from "../lib/adaptiveTraining";
import { readHybridSessions, type HybridSession } from "../lib/hybridSessions";
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
import {
  WEEKLY_PLAN_KEY,
  defaultWeeklyPlan,
  normalizeWeeklyPlan,
  todayPlanIndex,
  type WeeklyPlanDay,
} from "../lib/weeklyPlan";

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

function readWeeklyPlan() {
  try {
    return normalizeWeeklyPlan(JSON.parse(localStorage.getItem(WEEKLY_PLAN_KEY) ?? "null"));
  } catch {
    return defaultWeeklyPlan;
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

function planAction(item: WeeklyPlanDay) {
  if (item.kind === "rest") return { href: "/plan", label: "Recovery day" };
  const routine = item.routineId ? `&routine=${encodeURIComponent(item.routineId)}` : "";
  return { href: `/live?kind=${encodeURIComponent(item.kind)}&title=${encodeURIComponent(item.title)}${routine}`, label: item.kind === "lift" ? "Start Live Training" : "Start live session" };
}

export default function TodayDashboard() {
  const [history, setHistory] = useState<WorkoutHistoryItem[]>([]);
  const [routines, setRoutines] = useState<RoutineDefinition[]>(defaultRoutines);
  const [activeRoutineId, setActiveRoutineId] = useState("legs");
  const [draftRunning, setDraftRunning] = useState(false);
  const [bodyweight, setBodyweight] = useState<BodyweightEntry[]>([]);
  const [readiness, setReadiness] = useState<ReadinessRecord[]>([]);
  const [weeklyPlan, setWeeklyPlan] = useState<WeeklyPlanDay[]>(defaultWeeklyPlan);
  const [hybridSessions, setHybridSessions] = useState<HybridSession[]>([]);
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
    setWeeklyPlan(readWeeklyPlan());
    setHybridSessions(readHybridSessions());

    const onPlanChange = () => setWeeklyPlan(readWeeklyPlan());
    const onHybridChange = () => setHybridSessions(readHybridSessions());
    window.addEventListener("workout-tracker:weekly-plan", onPlanChange);
    window.addEventListener("workout-tracker:hybrid-session", onHybridChange);
    return () => {
      window.removeEventListener("workout-tracker:weekly-plan", onPlanChange);
      window.removeEventListener("workout-tracker:hybrid-session", onHybridChange);
    };
  }, []);

  const activeRoutine = routines.find((routine) => routine.id === activeRoutineId) ?? routines[0] ?? defaultRoutines[0];
  const latestWeight = [...bodyweight].sort((a, b) => String(b.recordedAt).localeCompare(String(a.recordedAt)))[0];
  const todayReadiness = readiness.find((item) => item.date === today) ?? null;
  const todayPlan = weeklyPlan[todayPlanIndex()] ?? defaultWeeklyPlan[todayPlanIndex()];
  const todayPlanAction = planAction(todayPlan);
  const adaptiveWeek = useMemo(() => buildAdaptiveWeek(history, hybridSessions, weeklyPlan, readiness), [history, hybridSessions, weeklyPlan, readiness]);
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
        <div><p className="ti-eyebrow">TODAY · V1.9.1</p><h1>Training Console</h1></div>
        <div className="ti-top-actions"><a className="ti-icon-link" href="/live">Live OS</a><a className="ti-icon-link" href="/coach">Coach</a><a className="ti-icon-link" href="/plan">Weekly plan</a></div>
      </header>

      <section className="ti-today-hero">
        <div className="ti-hero-copy">
          <p className="ti-eyebrow">TODAY'S PLAN · {todayPlan.kind.toUpperCase()}</p>
          <h2>{todayPlan.title}</h2>
          <p>{todayPlan.detail || "No extra goal set."}{todayPlan.kind === "lift" ? ` · ${activeRoutine.name} ready` : ""}</p>
          <div className="ti-hero-actions">
            <a className="ti-primary" href={todayPlanAction.href}>{todayPlan.kind === "lift" && draftRunning ? "Resume workout" : todayPlanAction.label}</a>
            <a className="ti-secondary" href="/plan">Edit this week</a>
          </div>
        </div>
        <div className="ti-hero-stat">
          <span>{todayPlan.kind === "lift" ? `Last ${activeRoutine.name}` : "Hybrid tracking"}</span>
          <strong>{todayPlan.kind === "lift" ? (lastSameRoutine ? formatShortDate(lastSameRoutine.completedAt) : "No session yet") : "Logger ready"}</strong>
          <small>{todayPlan.kind === "lift" ? (lastSameRoutine ? `${formatDuration(lastSameRoutine.durationSeconds)} · ${Math.round(lastSameRoutine.totalVolume).toLocaleString()} lb` : `${activeRoutine.exerciseIds.length} exercises · about ${plannedSets} working sets${progressionReady ? ` · ${progressionReady} ready to progress` : ""}`) : "Run, conditioning, pool, and recovery sessions now save to hybrid history."}</small>
        </div>
      </section>

      <a className="ti-coach-strip" href="/coach"><span>Adaptive coach · {adaptiveWeek.todayRecommendation.signal}</span><strong>{adaptiveWeek.todayRecommendation.label}</strong><small>{adaptiveWeek.todayRecommendation.reason}</small></a>

      <section className="ti-readiness-card">
        <div className="ti-section-head"><div><p className="ti-eyebrow">READINESS</p><h2>How are you today?</h2></div><span>{readinessLabel(todayReadiness)}</span></div>
        <div className="ti-readiness-grid">
          <div><strong>Sleep</strong><div className="ti-segments">{(["poor", "ok", "good"] as const).map((value) => <button key={value} className={todayReadiness?.sleep === value ? "active" : ""} onClick={() => setReadinessField("sleep", value)}>{value}</button>)}</div></div>
          <div><strong>Energy</strong><div className="ti-segments">{(["low", "normal", "high"] as const).map((value) => <button key={value} className={todayReadiness?.energy === value ? "active" : ""} onClick={() => setReadinessField("energy", value)}>{value}</button>)}</div></div>
          <div><strong>Soreness</strong><div className="ti-segments">{(["none", "some", "high"] as const).map((value) => <button key={value} className={todayReadiness?.soreness === value ? "active" : ""} onClick={() => setReadinessField("soreness", value)}>{value}</button>)}</div></div>
        </div>
      </section>

      <section className="ti-home-grid">
        <a className="ti-card ti-click-card" href="/live"><span>Live Training OS</span><strong>Run today with the coach</strong><small>Real-time dose, fatigue & execution →</small></a>
        <a className="ti-card ti-click-card" href="/coach"><span>Adaptive coach</span><strong>{adaptiveWeek.todayRecommendation.label}</strong><small>{adaptiveWeek.completionRate == null ? "Week intelligence ready" : `${adaptiveWeek.completionRate}% plan-to-date`} →</small></a>
        <a className="ti-card ti-click-card" href="/plan"><span>Weekly plan</span><strong>{todayPlan.title}</strong><small>{todayPlan.shortDay} · {todayPlan.kind} →</small></a>
        <a className="ti-card ti-click-card" href="/session"><span>Hybrid logger</span><strong>Run · Condition · Recover</strong><small>Track non-lifting work →</small></a>
        <a className="ti-card ti-click-card" href="/progress"><span>Next target</span><strong>{firstTarget?.target ?? "Log a baseline"}</strong><small>{firstTarget?.label ?? "Progression will appear after a session"} →</small></a>
        <a className="ti-card ti-click-card" href="/bodyweight"><span>Bodyweight</span><strong>{latestWeight ? `${Number(latestWeight.value).toFixed(1)} lb` : "Add weight"}</strong><small>View and edit entries →</small></a>
        <a className="ti-card ti-click-card" href="/prs"><span>Latest PR</span><strong>{latestPr?.pr ?? "No PR yet"}</strong><small>{latestPr ? formatShortDate(latestPr.completedAt) : "Your record board is ready"} →</small></a>
        <a className="ti-card ti-click-card" href="/history"><span>Training history</span><strong>{history[0]?.name ?? "Open journal"}</strong><small>Lifting + hybrid sessions →</small></a>
      </section>

      <section className="ti-quick-row">
        <a href="/live">◉ Live OS</a><a href="/gym">⚡ Gym</a><a href="/session">◎ Quick log</a><a href="/coach">◈ Coach</a><a href="/plan">▦ Week</a><a href="/progress">▥ Progress</a><a href="/routines">≡ Routines</a><a href="/prs">🏆 PRs</a>
      </section>
    </main>
  );
}
