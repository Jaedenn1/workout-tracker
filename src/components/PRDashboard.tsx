"use client";

import { useEffect, useMemo, useState } from "react";
import { HISTORY_KEY, derivePersonalRecords, formatShortDate, longestTrainingStreak, safeArray, type PersonalRecord, type WorkoutHistoryItem } from "../lib/trainingIntelligence";

type Filter = "all" | PersonalRecord["category"];

export default function PRDashboard() {
  const [history, setHistory] = useState<WorkoutHistoryItem[]>([]);
  const [filter, setFilter] = useState<Filter>("all");
  useEffect(() => setHistory(safeArray<WorkoutHistoryItem>(localStorage.getItem(HISTORY_KEY))), []);
  const records = useMemo(() => derivePersonalRecords(history), [history]);
  const filtered = filter === "all" ? records : records.filter((record) => record.category === filter);
  const streak = longestTrainingStreak(history);
  const recentEvents = history.flatMap((workout) => (workout.prs ?? []).map((label) => ({ label, completedAt: workout.completedAt }))).slice(0, 12);
  const workoutVolume = records.find((record) => record.category === "workout-volume");

  return <main className="ti-shell">
    <header className="ti-topbar"><div><p className="ti-eyebrow">PERSONAL RECORDS</p><h1>PR Board</h1><p>Your best strength, rep and volume marks in one place.</p></div><div className="ti-top-actions"><a href="/progress">← Progress</a><a href="/gym">Gym</a></div></header>
    <section className="ti-kpi-grid"><div className="ti-kpi"><span>Training streak</span><strong>{streak}<small> days</small></strong></div><div className="ti-kpi"><span>Tracked records</span><strong>{records.length}</strong></div><div className="ti-kpi"><span>Recent PR events</span><strong>{recentEvents.length}</strong></div><div className="ti-kpi"><span>Best workout volume</span><strong>{workoutVolume?.value ?? "—"}</strong></div></section>
    <section className="ti-card"><div className="ti-filter-row">{(["all", "e1RM", "weight", "reps", "exercise-volume", "workout-volume"] as Filter[]).map((item) => <button key={item} className={filter === item ? "active" : ""} onClick={() => setFilter(item)}>{item === "all" ? "All" : item.replace("-", " ")}</button>)}</div><div className="ti-pr-grid">{filtered.map((record) => record.exerciseId ? <a className="ti-pr-card" href={`/exercise/${encodeURIComponent(record.exerciseId)}`} key={record.key}><span>{record.label}</span><strong>{record.value}</strong><b>{record.exerciseName}</b><small>{formatShortDate(record.completedAt)} →</small></a> : <div className="ti-pr-card" key={record.key}><span>{record.label}</span><strong>{record.value}</strong><b>All workouts</b><small>{formatShortDate(record.completedAt)}</small></div>)}</div>{!records.length && <p className="ti-empty">PRs will populate automatically after completed workouts.</p>}</section>
    <section className="ti-card"><div className="ti-section-head"><div><p className="ti-eyebrow">RECENT</p><h2>Record moments</h2></div></div><div className="ti-event-list">{recentEvents.map((event, index) => <div key={`${event.completedAt}-${index}`}><span>🏆</span><strong>{event.label}</strong><small>{formatShortDate(event.completedAt)}</small></div>)}{!recentEvents.length && <p className="ti-empty">When the logger detects a new e1RM, it will appear here.</p>}</div></section>
  </main>;
}
