"use client";

import { useEffect, useMemo, useState } from "react";
import { getExerciseDefinition } from "../data/training";
import { bestEstimatedOneRepMax, progressionDecision, type PerformanceSet } from "../lib/progression";

const HISTORY_KEY = "workout-tracker:v0.2:history";
const BODYWEIGHT_KEY = "workout-tracker:v0.6:bodyweight";

type HistorySet = { weight: number; reps: number; rir?: number | null; estimated1RM?: number };
type HistoryExercise = { id: string; name: string; repMin: number; repMax: number; increment: number; sets: HistorySet[] };
type WorkoutHistoryItem = {
  id: string;
  routineId?: string;
  name: string;
  completedAt: string;
  durationSeconds: number;
  totalVolume: number;
  completedSets: number;
  averageRir?: number | null;
  prs?: string[];
  exercises: HistoryExercise[];
};
type BodyweightEntry = { id: string; value: number; recordedAt: string };
type ExerciseTrend = { id: string; name: string; points: Array<{ completedAt: string; bestE1rm: number; sets: HistorySet[] }> };

function safeArray<T>(raw: string | null): T[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function formatDuration(seconds: number) {
  const minutes = Math.max(0, Math.round(seconds / 60));
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest ? `${hours}h ${rest}m` : `${hours}h`;
}

function shortDate(value: string) {
  return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" }).format(new Date(value));
}

function performance(sets: HistorySet[]): PerformanceSet[] {
  return sets
    .filter((set) => Number.isFinite(set.weight) && Number.isFinite(set.reps) && set.reps > 0)
    .map((set) => ({ weight: Number(set.weight), reps: Number(set.reps), rir: set.rir ?? null }));
}

function Sparkline({ values }: { values: number[] }) {
  if (values.length < 2) return <div className="v16-empty">More sessions needed for a trend.</div>;
  const width = 460;
  const height = 120;
  const pad = 10;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = Math.max(1, max - min);
  const points = values.map((value, index) => {
    const x = pad + (index / Math.max(1, values.length - 1)) * (width - pad * 2);
    const y = height - pad - ((value - min) / span) * (height - pad * 2);
    return `${x},${y}`;
  }).join(" ");
  return (
    <div className="v16-sparkline">
      <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Strength trend">
        <polyline points={points} fill="none" stroke="currentColor" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      <div><span>{Math.round(min)}</span><span>{Math.round(max)}</span></div>
    </div>
  );
}

export default function TrainingDashboardPage() {
  const [history, setHistory] = useState<WorkoutHistoryItem[]>([]);
  const [bodyweight, setBodyweight] = useState<BodyweightEntry[]>([]);
  const [selectedExerciseId, setSelectedExerciseId] = useState("");

  useEffect(() => {
    const workouts = safeArray<WorkoutHistoryItem>(localStorage.getItem(HISTORY_KEY));
    const weights = safeArray<BodyweightEntry>(localStorage.getItem(BODYWEIGHT_KEY));
    setHistory(workouts);
    setBodyweight(weights);
    const first = workouts.flatMap((workout) => workout.exercises ?? [])[0];
    if (first) setSelectedExerciseId(first.id);
  }, []);

  const weekly = useMemo(() => {
    const cutoff = Date.now() - 7 * 24 * 60 * 60 * 1000;
    const recent = history.filter((workout) => new Date(workout.completedAt).getTime() >= cutoff);
    const rirs = recent.map((item) => item.averageRir).filter((value): value is number => typeof value === "number" && Number.isFinite(value));
    return {
      sessions: recent.length,
      sets: recent.reduce((sum, item) => sum + Number(item.completedSets || 0), 0),
      volume: recent.reduce((sum, item) => sum + Number(item.totalVolume || 0), 0),
      duration: recent.reduce((sum, item) => sum + Number(item.durationSeconds || 0), 0),
      rir: rirs.length ? rirs.reduce((a, b) => a + b, 0) / rirs.length : null,
    };
  }, [history]);

  const trends = useMemo<ExerciseTrend[]>(() => {
    const byId = new Map<string, ExerciseTrend>();
    for (const workout of [...history].reverse()) {
      for (const exercise of workout.exercises ?? []) {
        const sets = performance(exercise.sets ?? []);
        if (!sets.length) continue;
        const current = byId.get(exercise.id) ?? { id: exercise.id, name: exercise.name, points: [] };
        current.points.push({ completedAt: workout.completedAt, bestE1rm: bestEstimatedOneRepMax(sets), sets: exercise.sets });
        byId.set(exercise.id, current);
      }
    }
    return [...byId.values()].sort((a, b) => b.points.length - a.points.length);
  }, [history]);

  const selected = trends.find((trend) => trend.id === selectedExerciseId) ?? trends[0] ?? null;

  const targets = useMemo(() => trends.slice(0, 5).map((trend) => {
    const latest = trend.points.at(-1);
    const definition = getExerciseDefinition(trend.id);
    if (!latest || !definition) return { id: trend.id, name: trend.name, action: "Keep logging", target: "More history needed" };
    const decision = progressionDecision(performance(latest.sets), definition.repMin, definition.repMax, definition.increment, definition.fallbackWeight, definition.setCount);
    const weights = [...new Set(decision.suggestedWeights.filter((value) => value > 0))];
    return {
      id: trend.id,
      name: trend.name,
      action: decision.action === "increase" ? "Add load" : decision.action === "hold" ? "Hold" : "Beat reps",
      target: `${weights.length ? `${weights.join(" / ")} lb · ` : ""}${definition.repMin}–${definition.repMax} reps`,
    };
  }), [trends]);

  const recentPrs = useMemo(() => history.flatMap((workout) => (workout.prs ?? []).map((text) => ({ text, date: workout.completedAt }))).slice(0, 4), [history]);
  const currentWeight = bodyweight[0]?.value ?? null;
  const previousWeight = bodyweight[1]?.value ?? null;
  const weightDelta = currentWeight != null && previousWeight != null ? currentWeight - previousWeight : null;
  const lastWorkout = history[0] ?? null;

  return (
    <main className="v16-shell">
      <header className="v16-page-header">
        <div>
          <p className="v16-kicker">TRAINING</p>
          <h1>Progress</h1>
          <p>One clean overview. Open a section when you actually need the detail.</p>
        </div>
      </header>

      <section className="v16-summary-grid" aria-label="Seven day training summary">
        <div><span>Sessions</span><strong>{weekly.sessions}</strong></div>
        <div><span>Working sets</span><strong>{weekly.sets}</strong></div>
        <div><span>Volume</span><strong>{Math.round(weekly.volume).toLocaleString()} lb</strong></div>
        <div><span>Training time</span><strong>{formatDuration(weekly.duration)}</strong></div>
      </section>

      <section className="v16-action-grid">
        <a className="v16-action-card v16-bodyweight-card" href="/bodyweight">
          <div><span className="v16-action-icon">⚖</span><p className="v16-kicker">BODYWEIGHT</p><h2>{currentWeight == null ? "Log weight" : `${currentWeight} lb`}</h2></div>
          <div className="v16-action-meta">
            <span>{weightDelta == null ? "Add, edit or correct entries" : `${weightDelta >= 0 ? "+" : ""}${weightDelta.toFixed(1)} lb vs previous`}</span>
            <b>Open →</b>
          </div>
        </a>
        <a className="v16-action-card" href="/history">
          <div><span className="v16-action-icon">◷</span><p className="v16-kicker">LAST SESSION</p><h2>{lastWorkout?.name ?? "No sessions yet"}</h2></div>
          <div className="v16-action-meta"><span>{lastWorkout ? `${shortDate(lastWorkout.completedAt)} · ${lastWorkout.completedSets} sets` : "Complete a workout to start history"}</span><b>History →</b></div>
        </a>
      </section>

      <div className="v16-content-grid">
        <section className="v16-panel v16-panel-wide">
          <div className="v16-section-head">
            <div><p className="v16-kicker">STRENGTH</p><h2>Estimated 1RM trend</h2></div>
            <select value={selected?.id ?? ""} onChange={(event) => setSelectedExerciseId(event.target.value)}>
              {trends.map((trend) => <option key={trend.id} value={trend.id}>{trend.name}</option>)}
            </select>
          </div>
          {selected ? <>
            <Sparkline values={selected.points.map((point) => point.bestE1rm)} />
            <div className="v16-inline-stats"><span>{selected.points.length} sessions</span><span>Latest {Math.round(selected.points.at(-1)?.bestE1rm ?? 0)} lb e1RM</span></div>
          </> : <div className="v16-empty">Complete workouts to unlock strength trends.</div>}
        </section>

        <section className="v16-panel">
          <div className="v16-section-head"><div><p className="v16-kicker">NEXT SESSION</p><h2>Targets</h2></div></div>
          <div className="v16-list">
            {targets.length ? targets.map((target) => <div className="v16-list-row" key={target.id}><div><strong>{target.name}</strong><span>{target.target}</span></div><b>{target.action}</b></div>) : <div className="v16-empty">More history needed.</div>}
          </div>
        </section>

        <section className="v16-panel">
          <div className="v16-section-head"><div><p className="v16-kicker">EFFORT</p><h2>Training signal</h2></div></div>
          <div className="v16-signal-card">
            <strong>{weekly.rir == null ? "RIR not logged" : `${weekly.rir.toFixed(1)} avg RIR`}</strong>
            <span>{weekly.rir == null ? "Log RIR during working sets to make effort trends useful." : weekly.rir < 1 ? "Very hard week. Watch recovery and performance." : weekly.rir <= 3 ? "Productive effort range based on your recent logs." : "Plenty of reps in reserve this week."}</span>
          </div>
        </section>

        <section className="v16-panel v16-panel-wide">
          <div className="v16-section-head"><div><p className="v16-kicker">RECORDS</p><h2>Recent PRs</h2></div><a href="/history">View history</a></div>
          <div className="v16-pr-grid">
            {recentPrs.length ? recentPrs.map((pr, index) => <div key={`${pr.date}-${index}`}><span>🏆</span><strong>{pr.text}</strong><small>{shortDate(pr.date)}</small></div>) : <div className="v16-empty">PRs will collect here as you train.</div>}
          </div>
        </section>
      </div>
    </main>
  );
}
