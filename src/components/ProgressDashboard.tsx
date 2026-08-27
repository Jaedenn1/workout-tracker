"use client";

import { useEffect, useMemo, useState } from "react";
import { getExerciseDefinition } from "../data/training";
import {
  bestEstimatedOneRepMax,
  progressionDecision,
  type PerformanceSet,
} from "../lib/progression";

const HISTORY_KEY = "workout-tracker:v0.2:history";
const BODYWEIGHT_KEY = "workout-tracker:v0.6:bodyweight";

type HistorySet = {
  weight: number;
  reps: number;
  rir?: number | null;
  estimated1RM?: number;
};

type HistoryExercise = {
  id: string;
  name: string;
  repMin: number;
  repMax: number;
  increment: number;
  sets: HistorySet[];
};

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

type BodyweightEntry = {
  id: string;
  value: number;
  recordedAt: string;
};

type ExercisePoint = {
  workoutId: string;
  completedAt: string;
  bestE1rm: number;
  volume: number;
  sets: HistorySet[];
};

type ExerciseTrend = {
  id: string;
  name: string;
  muscle: string;
  points: ExercisePoint[];
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

function localDay(value: string | Date) {
  const date = typeof value === "string" ? new Date(value) : value;
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function shortDate(value: string) {
  return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" }).format(
    new Date(value),
  );
}

function formatDuration(seconds: number) {
  const minutes = Math.max(0, Math.round(seconds / 60));
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return `${hours}h ${rest}m`;
}

function setPerformance(sets: HistorySet[]): PerformanceSet[] {
  return sets
    .filter((set) => Number.isFinite(set.weight) && Number.isFinite(set.reps) && set.reps > 0)
    .map((set) => ({ weight: Number(set.weight), reps: Number(set.reps), rir: set.rir ?? null }));
}

function workoutDateRange(days: number) {
  return Date.now() - days * 24 * 60 * 60 * 1000;
}

function Sparkline({ values, label }: { values: number[]; label: string }) {
  if (values.length < 2) {
    return <div className="v06-chart-empty">Log at least two sessions to draw a trend.</div>;
  }

  const width = 520;
  const height = 150;
  const pad = 12;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = Math.max(1, max - min);
  const points = values
    .map((value, index) => {
      const x = pad + (index / Math.max(1, values.length - 1)) * (width - pad * 2);
      const y = height - pad - ((value - min) / span) * (height - pad * 2);
      return `${x},${y}`;
    })
    .join(" ");

  return (
    <div className="v06-chart-wrap">
      <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label={label}>
        <polyline points={points} fill="none" stroke="currentColor" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      <div className="v06-chart-axis">
        <span>{Math.round(min)}</span>
        <span>{Math.round(max)}</span>
      </div>
    </div>
  );
}

export default function ProgressDashboard({ onClose }: { onClose: () => void }) {
  const [history, setHistory] = useState<WorkoutHistoryItem[]>([]);
  const [bodyweight, setBodyweight] = useState<BodyweightEntry[]>([]);
  const [weightInput, setWeightInput] = useState("");
  const [selectedExerciseId, setSelectedExerciseId] = useState("");

  useEffect(() => {
    const savedHistory = safeArray<WorkoutHistoryItem>(localStorage.getItem(HISTORY_KEY));
    const savedWeight = safeArray<BodyweightEntry>(localStorage.getItem(BODYWEIGHT_KEY));
    setHistory(savedHistory);
    setBodyweight(savedWeight);

    const firstExercise = savedHistory.flatMap((workout) => workout.exercises ?? [])[0];
    if (firstExercise) setSelectedExerciseId(firstExercise.id);
  }, []);

  const exerciseTrends = useMemo<ExerciseTrend[]>(() => {
    const byId = new Map<string, ExerciseTrend>();
    const chronological = [...history].reverse();

    for (const workout of chronological) {
      for (const exercise of workout.exercises ?? []) {
        const performance = setPerformance(exercise.sets ?? []);
        if (!performance.length) continue;
        const definition = getExerciseDefinition(exercise.id);
        const current = byId.get(exercise.id) ?? {
          id: exercise.id,
          name: exercise.name,
          muscle: definition?.muscle ?? "Other",
          points: [],
        };
        current.points.push({
          workoutId: workout.id,
          completedAt: workout.completedAt,
          bestE1rm: bestEstimatedOneRepMax(performance),
          volume: exercise.sets.reduce((sum, set) => sum + set.weight * set.reps, 0),
          sets: exercise.sets,
        });
        byId.set(exercise.id, current);
      }
    }

    return [...byId.values()].sort((a, b) => b.points.length - a.points.length);
  }, [history]);

  const selectedTrend = useMemo(
    () => exerciseTrends.find((trend) => trend.id === selectedExerciseId) ?? exerciseTrends[0] ?? null,
    [exerciseTrends, selectedExerciseId],
  );

  const weekly = useMemo(() => {
    const cutoff = workoutDateRange(7);
    const recent = history.filter((workout) => new Date(workout.completedAt).getTime() >= cutoff);
    const totalVolume = recent.reduce((sum, workout) => sum + Number(workout.totalVolume || 0), 0);
    const sets = recent.reduce((sum, workout) => sum + Number(workout.completedSets || 0), 0);
    const duration = recent.reduce((sum, workout) => sum + Number(workout.durationSeconds || 0), 0);
    const rirs = recent
      .map((workout) => workout.averageRir)
      .filter((value): value is number => typeof value === "number" && Number.isFinite(value));
    const avgRir = rirs.length ? rirs.reduce((sum, value) => sum + value, 0) / rirs.length : null;
    return { sessions: recent.length, totalVolume, sets, duration, avgRir };
  }, [history]);

  const muscleWork = useMemo(() => {
    const cutoff = workoutDateRange(7);
    const totals = new Map<string, { sets: number; volume: number }>();
    for (const workout of history) {
      if (new Date(workout.completedAt).getTime() < cutoff) continue;
      for (const exercise of workout.exercises ?? []) {
        const muscle = getExerciseDefinition(exercise.id)?.muscle ?? "Other";
        const current = totals.get(muscle) ?? { sets: 0, volume: 0 };
        current.sets += exercise.sets.length;
        current.volume += exercise.sets.reduce((sum, set) => sum + set.weight * set.reps, 0);
        totals.set(muscle, current);
      }
    }
    return [...totals.entries()]
      .map(([muscle, values]) => ({ muscle, ...values }))
      .sort((a, b) => b.sets - a.sets);
  }, [history]);

  const prs = useMemo(
    () =>
      history
        .flatMap((workout) =>
          (workout.prs ?? []).map((text) => ({ text, date: workout.completedAt, workout: workout.name })),
        )
        .slice(0, 12),
    [history],
  );

  const progressionTargets = useMemo(() => {
    return exerciseTrends.slice(0, 8).map((trend) => {
      const latest = trend.points.at(-1);
      const definition = getExerciseDefinition(trend.id);
      if (!latest || !definition) {
        return { id: trend.id, name: trend.name, action: "Keep logging", target: "More history needed" };
      }
      const decision = progressionDecision(
        setPerformance(latest.sets),
        definition.repMin,
        definition.repMax,
        definition.increment,
        definition.fallbackWeight,
        definition.setCount,
      );
      const uniqueWeights = [...new Set(decision.suggestedWeights.filter((value) => value > 0))];
      return {
        id: trend.id,
        name: trend.name,
        action: decision.action === "increase" ? "↑ Add load" : decision.action === "hold" ? "Hold" : "Beat reps",
        target: `${uniqueWeights.length ? `${uniqueWeights.join(" / ")} lb · ` : ""}${definition.repMin}–${definition.repMax} reps`,
        reason: decision.reason,
      };
    });
  }, [exerciseTrends]);

  const signals = useMemo(() => {
    const items: Array<{ title: string; text: string; tone: "good" | "watch" | "neutral" }> = [];
    const fourDayCutoff = workoutDateRange(4);
    const recentFour = history.filter((workout) => new Date(workout.completedAt).getTime() >= fourDayCutoff);
    const lastThreeRir = history
      .slice(0, 3)
      .map((workout) => workout.averageRir)
      .filter((value): value is number => typeof value === "number" && Number.isFinite(value));
    const threeRir = lastThreeRir.length ? lastThreeRir.reduce((a, b) => a + b, 0) / lastThreeRir.length : null;

    if (recentFour.length >= 4 || (threeRir != null && threeRir < 1)) {
      items.push({
        title: "Fatigue signal",
        text: recentFour.length >= 4
          ? `${recentFour.length} sessions in the last 4 days. Keep an eye on performance and effort.`
          : `Your last logged sessions averaged ${threeRir?.toFixed(1)} RIR. That is consistently close to failure.`,
        tone: "watch",
      });
    } else {
      items.push({
        title: "Effort balance",
        text: threeRir == null ? "Log RIR consistently and v0.6 will watch effort trends." : `Recent average effort is ${threeRir.toFixed(1)} RIR. No high-effort flag right now.`,
        tone: "good",
      });
    }

    const plateau = exerciseTrends.find((trend) => {
      if (trend.points.length < 3) return false;
      const last = trend.points.slice(-3).map((point) => point.bestE1rm).filter((value) => value > 0);
      if (last.length < 3) return false;
      const high = Math.max(...last);
      const low = Math.min(...last);
      return high > 0 && (high - low) / high < 0.01;
    });

    if (plateau) {
      items.push({
        title: "Plateau watch",
        text: `${plateau.name} has stayed within ~1% e1RM across its last 3 sessions. Consider beating reps before adding load, changing the rep range, or reviewing recovery.`,
        tone: "watch",
      });
    } else {
      items.push({
        title: "Progress signal",
        text: exerciseTrends.length ? "No 3-session e1RM plateau detected in your logged exercises." : "Complete more sessions to unlock stagnation detection.",
        tone: "neutral",
      });
    }

    return items;
  }, [history, exerciseTrends]);

  const calendar = useMemo(() => {
    const counts = new Map<string, number>();
    history.forEach((workout) => {
      const key = localDay(workout.completedAt);
      counts.set(key, (counts.get(key) ?? 0) + 1);
    });

    return Array.from({ length: 28 }, (_, index) => {
      const date = new Date();
      date.setHours(12, 0, 0, 0);
      date.setDate(date.getDate() - (27 - index));
      const key = localDay(date);
      return { key, date, count: counts.get(key) ?? 0 };
    });
  }, [history]);

  const weightValues = [...bodyweight].reverse().map((entry) => entry.value);
  const currentWeight = bodyweight[0]?.value ?? null;
  const previousWeight = bodyweight[1]?.value ?? null;

  function addBodyweight() {
    const value = Number(weightInput);
    if (!Number.isFinite(value) || value <= 0 || value > 1000) return;
    const next = [
      { id: `weight-${Date.now()}`, value, recordedAt: new Date().toISOString() },
      ...bodyweight,
    ].slice(0, 365);
    setBodyweight(next);
    localStorage.setItem(BODYWEIGHT_KEY, JSON.stringify(next));
    setWeightInput("");
  }

  return (
    <div className="v06-backdrop" onClick={onClose}>
      <section className="v06-dashboard" onClick={(event) => event.stopPropagation()}>
        <header className="v06-heading">
          <div>
            <p>V0.6 · PROGRESS + INTELLIGENCE</p>
            <h2>Training dashboard</h2>
            <span>Trends from your own workout history — no social feed, no filler.</span>
          </div>
          <button type="button" onClick={onClose}>×</button>
        </header>

        <div className="v06-kpis">
          <div><span>7-day sessions</span><strong>{weekly.sessions}</strong></div>
          <div><span>Working sets</span><strong>{weekly.sets}</strong></div>
          <div><span>Volume</span><strong>{Math.round(weekly.totalVolume).toLocaleString()} lb</strong></div>
          <div><span>Training time</span><strong>{formatDuration(weekly.duration)}</strong></div>
          <div><span>Avg RIR</span><strong>{weekly.avgRir == null ? "—" : weekly.avgRir.toFixed(1)}</strong></div>
        </div>

        <div className="v06-grid-two">
          <section className="v06-card">
            <div className="v06-section-heading">
              <div><p>STRENGTH TREND</p><h3>Estimated 1RM</h3></div>
              <select value={selectedTrend?.id ?? ""} onChange={(event) => setSelectedExerciseId(event.target.value)}>
                {exerciseTrends.map((trend) => <option key={trend.id} value={trend.id}>{trend.name}</option>)}
              </select>
            </div>
            {selectedTrend ? (
              <>
                <Sparkline values={selectedTrend.points.map((point) => point.bestE1rm)} label={`${selectedTrend.name} estimated 1RM trend`} />
                <div className="v06-trend-summary">
                  <span>{selectedTrend.points.length} sessions</span>
                  <strong>{Math.round(selectedTrend.points.at(-1)?.bestE1rm ?? 0)} lb latest e1RM</strong>
                </div>
                <div className="v06-mini-history">
                  {selectedTrend.points.slice(-5).reverse().map((point, index) => {
                    const prior = selectedTrend.points[selectedTrend.points.length - 2 - index];
                    const delta = prior ? point.bestE1rm - prior.bestE1rm : 0;
                    return (
                      <div key={point.workoutId}>
                        <span>{shortDate(point.completedAt)}</span>
                        <strong>{point.sets.map((set) => `${set.weight}×${set.reps}`).join(" · ")}</strong>
                        <b>{prior ? `${delta >= 0 ? "+" : ""}${Math.round(delta)} e1RM` : "First"}</b>
                      </div>
                    );
                  })}
                </div>
              </>
            ) : <div className="v06-empty">Finish workouts to unlock strength trends.</div>}
          </section>

          <section className="v06-card">
            <div className="v06-section-heading"><div><p>BODYWEIGHT</p><h3>Scale trend</h3></div></div>
            <div className="v06-weight-input">
              <input inputMode="decimal" type="number" min="1" step="0.1" placeholder="Bodyweight (lb)" value={weightInput} onChange={(event) => setWeightInput(event.target.value)} />
              <button type="button" onClick={addBodyweight}>Log</button>
            </div>
            <Sparkline values={weightValues} label="Bodyweight trend" />
            <div className="v06-trend-summary">
              <span>{bodyweight.length} weigh-ins</span>
              <strong>{currentWeight == null ? "No weight logged" : `${currentWeight.toFixed(1)} lb${previousWeight == null ? "" : ` · ${currentWeight - previousWeight >= 0 ? "+" : ""}${(currentWeight - previousWeight).toFixed(1)}`}`}</strong>
            </div>
            <div className="v06-weight-history">
              {bodyweight.slice(0, 4).map((entry) => <span key={entry.id}>{shortDate(entry.recordedAt)} · {entry.value.toFixed(1)} lb</span>)}
            </div>
          </section>
        </div>

        <div className="v06-grid-two">
          <section className="v06-card">
            <div className="v06-section-heading"><div><p>7-DAY WORKLOAD</p><h3>Sets by muscle</h3></div></div>
            {muscleWork.length ? (
              <div className="v06-muscle-list">
                {muscleWork.map((item) => {
                  const maxSets = Math.max(...muscleWork.map((muscle) => muscle.sets), 1);
                  return (
                    <div key={item.muscle}>
                      <div><strong>{item.muscle}</strong><span>{item.sets} sets · {Math.round(item.volume).toLocaleString()} lb</span></div>
                      <i><b style={{ width: `${Math.max(8, (item.sets / maxSets) * 100)}%` }} /></i>
                    </div>
                  );
                })}
              </div>
            ) : <div className="v06-empty">No completed sets in the last 7 days.</div>}
          </section>

          <section className="v06-card">
            <div className="v06-section-heading"><div><p>TRAINING SIGNALS</p><h3>Fatigue & stagnation</h3></div></div>
            <div className="v06-signals">
              {signals.map((signal) => (
                <div className={`v06-signal ${signal.tone}`} key={signal.title}>
                  <strong>{signal.title}</strong>
                  <span>{signal.text}</span>
                </div>
              ))}
            </div>
            <small className="v06-disclaimer">These are simple training signals from your logged performance and RIR, not medical recovery measurements.</small>
          </section>
        </div>

        <section className="v06-card">
          <div className="v06-section-heading"><div><p>TARGET TO BEAT</p><h3>Next-session recommendations</h3></div><span>{progressionTargets.length} exercises</span></div>
          {progressionTargets.length ? (
            <div className="v06-targets">
              {progressionTargets.map((target) => (
                <div key={target.id}>
                  <span><strong>{target.name}</strong><small>{target.reason}</small></span>
                  <b>{target.action}</b>
                  <em>{target.target}</em>
                </div>
              ))}
            </div>
          ) : <div className="v06-empty">Complete a workout to generate targets.</div>}
        </section>

        <div className="v06-grid-two">
          <section className="v06-card">
            <div className="v06-section-heading"><div><p>PR DASHBOARD</p><h3>Recent records</h3></div><span>{prs.length}</span></div>
            {prs.length ? (
              <div className="v06-prs">
                {prs.map((pr, index) => <div key={`${pr.date}-${index}`}><span>🏆</span><strong>{pr.text}</strong><small>{shortDate(pr.date)} · {pr.workout}</small></div>)}
              </div>
            ) : <div className="v06-empty">PRs will appear here as you beat prior estimated 1RMs.</div>}
          </section>

          <section className="v06-card">
            <div className="v06-section-heading"><div><p>28-DAY CALENDAR</p><h3>Consistency</h3></div><span>{history.length} total workouts</span></div>
            <div className="v06-calendar">
              {calendar.map((day) => (
                <div className={day.count ? "trained" : ""} key={day.key} title={`${day.key}: ${day.count} workout${day.count === 1 ? "" : "s"}`}>
                  <span>{day.date.getDate()}</span>
                  {day.count > 0 && <b>{day.count}</b>}
                </div>
              ))}
            </div>
          </section>
        </div>
      </section>
    </div>
  );
}
