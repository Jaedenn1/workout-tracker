"use client";

import { useEffect, useMemo, useState } from "react";
import {
  BODYWEIGHT_KEY,
  HISTORY_KEY,
  READINESS_KEY,
  allExerciseSummaries,
  compareLatestWorkout,
  deltaLabel,
  formatDuration,
  formatShortDate,
  readinessForWorkout,
  readinessScore,
  safeArray,
  weeklyStats,
  type BodyweightEntry,
  type ReadinessRecord,
  type WorkoutHistoryItem,
} from "../lib/trainingIntelligence";

function signedDuration(seconds: number) {
  if (!seconds) return "0m";
  return `${seconds > 0 ? "+" : "−"}${formatDuration(Math.abs(seconds))}`;
}

export default function TrainingIntelligenceDashboard() {
  const [history, setHistory] = useState<WorkoutHistoryItem[]>([]);
  const [bodyweight, setBodyweight] = useState<BodyweightEntry[]>([]);
  const [readiness, setReadiness] = useState<ReadinessRecord[]>([]);

  useEffect(() => {
    setHistory(safeArray<WorkoutHistoryItem>(localStorage.getItem(HISTORY_KEY)));
    setBodyweight(safeArray<BodyweightEntry>(localStorage.getItem(BODYWEIGHT_KEY)));
    setReadiness(safeArray<ReadinessRecord>(localStorage.getItem(READINESS_KEY)));
  }, []);

  const week = useMemo(() => weeklyStats(history), [history]);
  const comparison = useMemo(() => compareLatestWorkout(history), [history]);
  const summaries = useMemo(() => allExerciseSummaries(history), [history]);
  const ready = summaries.filter((item) => item.progression?.action === "increase");
  const plateaus = summaries.filter((item) => item.plateau);
  const latestWeight = [...bodyweight].sort((a, b) => String(b.recordedAt).localeCompare(String(a.recordedAt)))[0];
  const latestReadiness = readiness[0] ?? null;
  const scored = history
    .map((workout) => ({ workout, score: readinessScore(readinessForWorkout(readiness, workout)) }))
    .filter((item): item is { workout: WorkoutHistoryItem; score: number } => item.score != null);
  const highReady = scored.filter((item) => item.score >= 5);
  const lowReady = scored.filter((item) => item.score <= 2);
  const avgHigh = highReady.length ? highReady.reduce((sum, item) => sum + item.workout.totalVolume, 0) / highReady.length : null;
  const avgLow = lowReady.length ? lowReady.reduce((sum, item) => sum + item.workout.totalVolume, 0) / lowReady.length : null;

  return (
    <main className="ti-shell">
      <header className="ti-topbar"><div><p className="ti-eyebrow">TRAINING INTELLIGENCE · V1.3</p><h1>Progress</h1><p>Targets first. Details one level deeper.</p></div><div className="ti-top-actions"><a href="/prs">PR board</a><a href="/gym">Gym</a></div></header>

      <section className="ti-kpi-grid">
        <div className="ti-kpi"><span>7-day sessions</span><strong>{week.sessions}</strong></div>
        <div className="ti-kpi"><span>Working sets</span><strong>{week.sets}</strong></div>
        <div className="ti-kpi"><span>Volume</span><strong>{Math.round(week.volume).toLocaleString()}<small> lb</small></strong></div>
        <div className="ti-kpi"><span>Training time</span><strong>{formatDuration(week.duration)}</strong></div>
      </section>

      {comparison && (
        <section className="ti-card ti-comparison">
          <div className="ti-section-head"><div><p className="ti-eyebrow">VS LAST {comparison.current.name.toUpperCase()}</p><h2>{comparison.current.name}</h2></div><span>{formatShortDate(comparison.current.completedAt)}</span></div>
          <div className="ti-compare-grid">
            <div><span>Volume</span><strong>{deltaLabel(comparison.volumePct, "%")}</strong><small>{Math.round(comparison.current.totalVolume).toLocaleString()} lb today</small></div>
            <div><span>Sets</span><strong>{deltaLabel(comparison.setDelta)}</strong><small>{comparison.current.completedSets} completed</small></div>
            <div><span>Duration</span><strong>{signedDuration(comparison.durationDeltaSeconds)}</strong><small>{formatDuration(comparison.current.durationSeconds)}</small></div>
            <div><span>Avg RIR</span><strong>{deltaLabel(comparison.rirDelta)}</strong><small>{typeof comparison.current.averageRir === "number" ? comparison.current.averageRir.toFixed(1) : "Not rated"}</small></div>
          </div>
        </section>
      )}

      <section className="ti-two-col">
        <div className="ti-card">
          <div className="ti-section-head"><div><p className="ti-eyebrow">NEXT SESSION</p><h2>Progression targets</h2></div><span>{ready.length} load increases ready</span></div>
          <div className="ti-target-list">
            {summaries.slice(0, 8).map((exercise) => (
              <a href={`/exercise/${encodeURIComponent(exercise.id)}`} className="ti-target-row" key={exercise.id}>
                <div><strong>{exercise.name}</strong><span>{exercise.progression?.reason}</span></div>
                <div><b className={`ti-action ${exercise.progression?.action}`}>{exercise.progression?.label}</b><small>{exercise.progression?.target}</small></div>
              </a>
            ))}
            {!summaries.length && <p className="ti-empty">Complete your first workout and the app will build targets automatically.</p>}
          </div>
        </div>

        <div className="ti-card">
          <div className="ti-section-head"><div><p className="ti-eyebrow">SIGNALS</p><h2>What needs attention</h2></div></div>
          <div className="ti-signal-list">
            <div className="ti-signal"><strong>{ready.length ? `${ready.length} exercise${ready.length === 1 ? "" : "s"} ready for more load` : "No forced load increases"}</strong><span>{ready.length ? ready.slice(0, 3).map((item) => item.name).join(" · ") : "Keep accumulating clean reps."}</span></div>
            <div className="ti-signal"><strong>{plateaus.length ? `${plateaus.length} possible plateau${plateaus.length === 1 ? "" : "s"}` : "No obvious plateaus"}</strong><span>{plateaus.length ? `${plateaus.slice(0, 3).map((item) => item.name).join(" · ")} have been nearly flat across 3 sessions.` : "Recent e1RM trends are still moving."}</span></div>
            <div className="ti-signal"><strong>{latestWeight ? `Bodyweight ${Number(latestWeight.value).toFixed(1)} lb` : "Bodyweight not logged"}</strong><span><a href="/bodyweight">Open bodyweight manager →</a></span></div>
          </div>
        </div>
      </section>

      <section className="ti-card">
        <div className="ti-section-head"><div><p className="ti-eyebrow">EXERCISES</p><h2>Performance library</h2></div><span>Tap any exercise for its full page</span></div>
        <div className="ti-exercise-grid">
          {summaries.map((exercise) => (
            <a href={`/exercise/${encodeURIComponent(exercise.id)}`} className="ti-exercise-tile" key={exercise.id}>
              <span>{exercise.muscle}</span><strong>{exercise.name}</strong><div><b>{Math.round(exercise.bestE1rm)} lb e1RM</b><small>{exercise.sessionCount} sessions</small></div>
            </a>
          ))}
          {!summaries.length && <p className="ti-empty">Exercise pages populate automatically from completed workouts.</p>}
        </div>
      </section>

      <section className="ti-two-col">
        <a className="ti-card ti-click-card" href="/prs"><span>Personal records</span><strong>Open PR board</strong><small>Load · reps · e1RM · volume · streaks →</small></a>
        <div className="ti-card"><span>Readiness relationship</span><strong>{latestReadiness ? `${latestReadiness.sleep} sleep · ${latestReadiness.energy} energy` : "Start tagging readiness"}</strong><small>{avgHigh != null && avgLow != null ? `High-readiness sessions average ${Math.round(((avgHigh - avgLow) / Math.max(1, avgLow)) * 100)}% different volume vs low-readiness sessions.` : "After a few tagged workouts, this card will compare performance by readiness."}</small></div>
      </section>
    </main>
  );
}
