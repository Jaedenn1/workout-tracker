"use client";

import { useEffect, useMemo, useState } from "react";
import { getExerciseDefinition } from "../data/training";
import { HISTORY_KEY, formatShortDate, safeArray, summarizeExercise, type WorkoutHistoryItem } from "../lib/trainingIntelligence";

function sparkPoints(values: number[], width = 360, height = 90) {
  if (!values.length) return "";
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = Math.max(1, max - min);
  return values.map((value, index) => {
    const x = values.length === 1 ? width / 2 : (index / (values.length - 1)) * width;
    const y = height - ((value - min) / span) * (height - 16) - 8;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(" ");
}

export default function ExerciseDetail({ exerciseId }: { exerciseId: string }) {
  const [history, setHistory] = useState<WorkoutHistoryItem[]>([]);
  useEffect(() => setHistory(safeArray<WorkoutHistoryItem>(localStorage.getItem(HISTORY_KEY))), []);
  const summary = useMemo(() => summarizeExercise(history, exerciseId), [history, exerciseId]);
  const definition = getExerciseDefinition(exerciseId);
  const name = summary?.name ?? definition?.name ?? exerciseId;
  const e1rmValues = summary?.sessions.map((session) => session.bestE1rm) ?? [];
  const volumeValues = summary?.sessions.map((session) => session.volume) ?? [];

  return (
    <main className="ti-shell">
      <header className="ti-topbar"><div><p className="ti-eyebrow">EXERCISE DETAIL</p><h1>{name}</h1><p>{summary?.muscle ?? definition?.muscle ?? "Exercise"} · {summary?.sessionCount ?? 0} logged sessions</p></div><div className="ti-top-actions"><a href="/progress">← Progress</a><a href="/gym">Gym</a></div></header>
      {!summary ? <section className="ti-card"><h2>No history yet</h2><p className="ti-empty">Log this exercise in Gym Mode and this page will build its trend, records, and progression target.</p></section> : <>
        <section className="ti-kpi-grid">
          <div className="ti-kpi"><span>Best e1RM</span><strong>{Math.round(summary.bestE1rm)}<small> lb</small></strong></div>
          <div className="ti-kpi"><span>Heaviest load</span><strong>{summary.bestWeight}<small> lb</small></strong></div>
          <div className="ti-kpi"><span>Total sets</span><strong>{summary.totalSets}</strong></div>
          <div className="ti-kpi"><span>Total volume</span><strong>{Math.round(summary.totalVolume).toLocaleString()}<small> lb</small></strong></div>
        </section>
        <section className="ti-card ti-target-focus">
          <div><p className="ti-eyebrow">NEXT TARGET</p><h2>{summary.progression?.label}</h2><strong>{summary.progression?.target}</strong></div>
          <p>{summary.progression?.reason}</p>
          {summary.plateau && <span className="ti-warning">Possible plateau: e1RM has been nearly flat across the last three sessions.</span>}
        </section>
        <section className="ti-two-col">
          <div className="ti-card"><div className="ti-section-head"><div><p className="ti-eyebrow">STRENGTH TREND</p><h2>Estimated 1RM</h2></div><span>{e1rmValues.length} sessions</span></div><svg className="ti-spark" viewBox="0 0 360 90" role="img" aria-label="Estimated one rep max trend"><polyline points={sparkPoints(e1rmValues)} fill="none" stroke="currentColor" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" /></svg><div className="ti-chart-foot"><span>{Math.round(e1rmValues[0] ?? 0)} lb</span><strong>{Math.round(e1rmValues.at(-1) ?? 0)} lb</strong></div></div>
          <div className="ti-card"><div className="ti-section-head"><div><p className="ti-eyebrow">WORK TREND</p><h2>Exercise volume</h2></div><span>Best {Math.round(summary.bestSessionVolume).toLocaleString()} lb</span></div><svg className="ti-spark" viewBox="0 0 360 90" role="img" aria-label="Exercise volume trend"><polyline points={sparkPoints(volumeValues)} fill="none" stroke="currentColor" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" /></svg><div className="ti-chart-foot"><span>{Math.round(volumeValues[0] ?? 0).toLocaleString()} lb</span><strong>{Math.round(volumeValues.at(-1) ?? 0).toLocaleString()} lb</strong></div></div>
        </section>
        <section className="ti-card">
          <div className="ti-section-head"><div><p className="ti-eyebrow">HISTORY</p><h2>Every session</h2></div><span>Newest first</span></div>
          <div className="ti-session-list">{[...summary.sessions].reverse().map((session) => <article key={session.workoutId} className="ti-session-row"><div><strong>{formatShortDate(session.completedAt)}</strong><span>{session.workoutName}</span></div><div className="ti-session-sets">{session.sets.map((set, index) => <span key={`${session.workoutId}-${index}`}>{set.weight} × {set.reps}{set.rir == null ? "" : ` @${set.rir}`}</span>)}</div><div><b>{Math.round(session.bestE1rm)} lb e1RM</b><small>{Math.round(session.volume).toLocaleString()} lb volume</small></div></article>)}</div>
        </section>
      </>}
    </main>
  );
}
