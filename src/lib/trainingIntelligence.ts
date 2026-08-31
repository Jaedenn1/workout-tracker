import { getExerciseDefinition } from "../data/training";
import { bestEstimatedOneRepMax, estimateOneRepMax, progressionDecision, type PerformanceSet } from "./progression";

export const HISTORY_KEY = "workout-tracker:v0.2:history";
export const BODYWEIGHT_KEY = "workout-tracker:v0.6:bodyweight";
export const READINESS_KEY = "workout-tracker:v1.3:readiness";

export type HistorySet = { weight: number; reps: number; rir?: number | null; estimated1RM?: number };
export type HistoryExercise = { id: string; name: string; repMin?: number; repMax?: number; increment?: number; sets: HistorySet[] };
export type WorkoutHistoryItem = {
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
  sessionNote?: string;
};
export type BodyweightEntry = { id: string; value: number; recordedAt: string };
export type ReadinessRecord = {
  date: string;
  sleep: "poor" | "ok" | "good";
  energy: "low" | "normal" | "high";
  soreness: "none" | "some" | "high";
  updatedAt: string;
};
export type ExerciseSession = {
  workoutId: string;
  workoutName: string;
  completedAt: string;
  sets: HistorySet[];
  volume: number;
  bestE1rm: number;
  bestWeight: number;
  totalReps: number;
};
export type ExerciseSummary = {
  id: string;
  name: string;
  muscle: string;
  sessions: ExerciseSession[];
  sessionCount: number;
  totalSets: number;
  totalVolume: number;
  bestWeight: number;
  bestE1rm: number;
  bestSessionVolume: number;
  maxReps: number;
  progression: { action: "increase" | "hold" | "build"; label: string; target: string; reason: string } | null;
  plateau: boolean;
};
export type WorkoutComparison = {
  current: WorkoutHistoryItem;
  previous: WorkoutHistoryItem;
  volumePct: number | null;
  setDelta: number;
  durationDeltaSeconds: number;
  rirDelta: number | null;
  prDelta: number;
};
export type PersonalRecord = {
  key: string;
  category: "e1RM" | "weight" | "reps" | "exercise-volume" | "workout-volume";
  label: string;
  value: string;
  exerciseId?: string;
  exerciseName?: string;
  completedAt: string;
};

export function safeArray<T>(raw: string | null): T[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function localDay(value: string | Date) {
  const date = typeof value === "string" ? new Date(value) : value;
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function formatShortDate(value: string) {
  return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" }).format(new Date(value));
}

export function formatDuration(seconds: number) {
  const minutes = Math.max(0, Math.round(Number(seconds || 0) / 60));
  if (minutes < 60) return `${minutes}m`;
  return `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
}

function performance(sets: HistorySet[]): PerformanceSet[] {
  return (sets ?? [])
    .filter((set) => Number.isFinite(Number(set.weight)) && Number.isFinite(Number(set.reps)) && Number(set.reps) > 0)
    .map((set) => ({ weight: Number(set.weight), reps: Number(set.reps), rir: set.rir ?? null }));
}

export function exerciseSessions(history: WorkoutHistoryItem[], exerciseId: string): ExerciseSession[] {
  const result: ExerciseSession[] = [];
  for (const workout of [...history].reverse()) {
    const exercise = (workout.exercises ?? []).find((item) => item.id === exerciseId);
    if (!exercise?.sets?.length) continue;
    const sets = exercise.sets.filter((set) => Number(set.reps) > 0);
    if (!sets.length) continue;
    result.push({
      workoutId: workout.id,
      workoutName: workout.name,
      completedAt: workout.completedAt,
      sets,
      volume: sets.reduce((sum, set) => sum + Number(set.weight || 0) * Number(set.reps || 0), 0),
      bestE1rm: bestEstimatedOneRepMax(performance(sets)),
      bestWeight: Math.max(...sets.map((set) => Number(set.weight || 0)), 0),
      totalReps: sets.reduce((sum, set) => sum + Number(set.reps || 0), 0),
    });
  }
  return result;
}

export function summarizeExercise(history: WorkoutHistoryItem[], exerciseId: string): ExerciseSummary | null {
  const sessions = exerciseSessions(history, exerciseId);
  if (!sessions.length) return null;
  let name = exerciseId;
  let repMin = 8;
  let repMax = 12;
  let increment = 5;
  for (const workout of history) {
    const item = (workout.exercises ?? []).find((exercise) => exercise.id === exerciseId);
    if (item) {
      name = item.name || name;
      repMin = Number(item.repMin ?? repMin);
      repMax = Number(item.repMax ?? repMax);
      increment = Number(item.increment ?? increment);
      break;
    }
  }
  const definition = getExerciseDefinition(exerciseId);
  if (definition) {
    name = definition.name;
    repMin = definition.repMin;
    repMax = definition.repMax;
    increment = definition.increment;
  }
  const latest = sessions.at(-1)!;
  const plannedSets = definition?.setCount ?? Math.max(1, latest.sets.length);
  const fallbackWeight = definition?.fallbackWeight ?? latest.sets[0]?.weight ?? 0;
  const decision = progressionDecision(performance(latest.sets), repMin, repMax, increment, fallbackWeight, plannedSets);
  const weights = [...new Set(decision.suggestedWeights.filter((weight) => Number.isFinite(weight)))];
  const recent = sessions.slice(-3).map((session) => session.bestE1rm).filter((value) => value > 0);
  const plateau = recent.length === 3 && Math.max(...recent) > 0 && (Math.max(...recent) - Math.min(...recent)) / Math.max(...recent) < 0.01;
  return {
    id: exerciseId,
    name,
    muscle: definition?.muscle ?? "Other",
    sessions,
    sessionCount: sessions.length,
    totalSets: sessions.reduce((sum, session) => sum + session.sets.length, 0),
    totalVolume: sessions.reduce((sum, session) => sum + session.volume, 0),
    bestWeight: Math.max(...sessions.map((session) => session.bestWeight), 0),
    bestE1rm: Math.max(...sessions.map((session) => session.bestE1rm), 0),
    bestSessionVolume: Math.max(...sessions.map((session) => session.volume), 0),
    maxReps: Math.max(...sessions.flatMap((session) => session.sets.map((set) => Number(set.reps || 0))), 0),
    progression: {
      action: decision.action,
      label: decision.action === "increase" ? "Increase load" : decision.action === "hold" ? "Hold load" : "Build reps",
      target: `${weights.length ? `${weights.join(" / ")} lb · ` : ""}${repMin}–${repMax} reps`,
      reason: decision.reason,
    },
    plateau,
  };
}

export function allExerciseSummaries(history: WorkoutHistoryItem[]) {
  const ids = new Set<string>();
  for (const workout of history) for (const exercise of workout.exercises ?? []) if (exercise.id) ids.add(exercise.id);
  return [...ids]
    .map((id) => summarizeExercise(history, id))
    .filter((value): value is ExerciseSummary => Boolean(value))
    .sort((a, b) => b.sessions.at(-1)!.completedAt.localeCompare(a.sessions.at(-1)!.completedAt));
}

export function compareLatestWorkout(history: WorkoutHistoryItem[]): WorkoutComparison | null {
  const current = history[0];
  if (!current) return null;
  const previous = history.slice(1).find((item) =>
    current.routineId ? item.routineId === current.routineId : item.name === current.name,
  );
  if (!previous) return null;
  const previousVolume = Number(previous.totalVolume || 0);
  const currentVolume = Number(current.totalVolume || 0);
  return {
    current,
    previous,
    volumePct: previousVolume > 0 ? ((currentVolume - previousVolume) / previousVolume) * 100 : null,
    setDelta: Number(current.completedSets || 0) - Number(previous.completedSets || 0),
    durationDeltaSeconds: Number(current.durationSeconds || 0) - Number(previous.durationSeconds || 0),
    rirDelta:
      typeof current.averageRir === "number" && typeof previous.averageRir === "number"
        ? current.averageRir - previous.averageRir
        : null,
    prDelta: Number(current.prs?.length ?? 0) - Number(previous.prs?.length ?? 0),
  };
}

export function weeklyStats(history: WorkoutHistoryItem[], days = 7) {
  const cutoff = Date.now() - days * 86400000;
  const workouts = history.filter((workout) => new Date(workout.completedAt).getTime() >= cutoff);
  return {
    sessions: workouts.length,
    sets: workouts.reduce((sum, workout) => sum + Number(workout.completedSets || 0), 0),
    volume: workouts.reduce((sum, workout) => sum + Number(workout.totalVolume || 0), 0),
    duration: workouts.reduce((sum, workout) => sum + Number(workout.durationSeconds || 0), 0),
  };
}

export function derivePersonalRecords(history: WorkoutHistoryItem[]): PersonalRecord[] {
  const summaries = allExerciseSummaries(history);
  const records: PersonalRecord[] = [];
  for (const summary of summaries) {
    const bestE = summary.sessions.reduce((best, session) => session.bestE1rm > best.bestE1rm ? session : best, summary.sessions[0]);
    const bestW = summary.sessions.reduce((best, session) => session.bestWeight > best.bestWeight ? session : best, summary.sessions[0]);
    const bestV = summary.sessions.reduce((best, session) => session.volume > best.volume ? session : best, summary.sessions[0]);
    let repDate = summary.sessions[0].completedAt;
    let maxReps = 0;
    for (const session of summary.sessions) for (const set of session.sets) if (set.reps > maxReps) { maxReps = set.reps; repDate = session.completedAt; }
    records.push(
      { key: `${summary.id}-e1rm`, category: "e1RM", label: "Best estimated 1RM", value: `${Math.round(bestE.bestE1rm)} lb`, exerciseId: summary.id, exerciseName: summary.name, completedAt: bestE.completedAt },
      { key: `${summary.id}-weight`, category: "weight", label: "Heaviest load", value: `${bestW.bestWeight} lb`, exerciseId: summary.id, exerciseName: summary.name, completedAt: bestW.completedAt },
      { key: `${summary.id}-reps`, category: "reps", label: "Most reps in a set", value: `${maxReps} reps`, exerciseId: summary.id, exerciseName: summary.name, completedAt: repDate },
      { key: `${summary.id}-volume`, category: "exercise-volume", label: "Best exercise volume", value: `${Math.round(bestV.volume).toLocaleString()} lb`, exerciseId: summary.id, exerciseName: summary.name, completedAt: bestV.completedAt },
    );
  }
  if (history.length) {
    const bestWorkout = history.reduce((best, workout) => Number(workout.totalVolume || 0) > Number(best.totalVolume || 0) ? workout : best, history[0]);
    records.unshift({ key: "workout-volume", category: "workout-volume", label: "Highest workout volume", value: `${Math.round(Number(bestWorkout.totalVolume || 0)).toLocaleString()} lb`, completedAt: bestWorkout.completedAt });
  }
  return records;
}

export function longestTrainingStreak(history: WorkoutHistoryItem[]) {
  const days = [...new Set(history.map((workout) => localDay(workout.completedAt)))].sort();
  if (!days.length) return 0;
  let best = 1;
  let current = 1;
  for (let index = 1; index < days.length; index += 1) {
    const prev = new Date(`${days[index - 1]}T12:00:00`).getTime();
    const next = new Date(`${days[index]}T12:00:00`).getTime();
    if (Math.round((next - prev) / 86400000) === 1) current += 1;
    else current = 1;
    best = Math.max(best, current);
  }
  return best;
}

export function readinessForWorkout(readiness: ReadinessRecord[], workout: WorkoutHistoryItem) {
  const day = localDay(workout.completedAt);
  return readiness.find((record) => record.date === day) ?? null;
}

export function readinessScore(record: ReadinessRecord | null) {
  if (!record) return null;
  const sleep = record.sleep === "good" ? 2 : record.sleep === "ok" ? 1 : 0;
  const energy = record.energy === "high" ? 2 : record.energy === "normal" ? 1 : 0;
  const soreness = record.soreness === "none" ? 2 : record.soreness === "some" ? 1 : 0;
  return sleep + energy + soreness;
}

export function deltaLabel(value: number | null, suffix = "") {
  if (value == null || !Number.isFinite(value)) return "—";
  const rounded = Math.abs(value) >= 10 ? Math.round(value) : Math.round(value * 10) / 10;
  return `${rounded > 0 ? "+" : ""}${rounded}${suffix}`;
}
