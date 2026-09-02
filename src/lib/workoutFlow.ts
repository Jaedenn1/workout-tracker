import { bestEstimatedOneRepMax } from "./progression";
import { localDay, type ReadinessRecord, type WorkoutHistoryItem } from "./trainingIntelligence";

export type FlowSet = {
  weight: number | null;
  reps: number | null;
  rir?: number | null;
  completed: boolean;
  type?: string;
};

export type FlowExercise = {
  id: string;
  name: string;
  repMin: number;
  repMax: number;
  increment: number;
  previous: Array<{ weight: number; reps: number; rir?: number | null }>;
  suggestedWeights: number[];
  progressionAction: "increase" | "hold" | "build";
  sets: FlowSet[];
};

export type LiveDelta = {
  matchedSets: number;
  repDelta: number;
  volumeDelta: number;
  e1rmDelta: number | null;
};

export type ExerciseHistoryRow = {
  workoutId: string;
  completedAt: string;
  workoutName: string;
  sets: Array<{ weight: number; reps: number; rir?: number | null }>;
};

export function previousWorkoutForRoutine(
  history: WorkoutHistoryItem[],
  routineId: string,
  routineName: string,
) {
  return history.find((item) => (item.routineId ? item.routineId === routineId : item.name === routineName)) ?? null;
}

export function recentExerciseHistory(
  history: WorkoutHistoryItem[],
  exerciseId: string,
  limit = 3,
): ExerciseHistoryRow[] {
  const rows: ExerciseHistoryRow[] = [];
  for (const workout of history) {
    const exercise = workout.exercises?.find((item) => item.id === exerciseId);
    if (!exercise?.sets?.length) continue;
    rows.push({
      workoutId: workout.id,
      completedAt: workout.completedAt,
      workoutName: workout.name,
      sets: exercise.sets.map((set) => ({ weight: Number(set.weight || 0), reps: Number(set.reps || 0), rir: set.rir ?? null })),
    });
    if (rows.length >= limit) break;
  }
  return rows;
}

function firstPrevious(exercise: FlowExercise) {
  return exercise.previous.find((set) => Number(set.weight) > 0 && Number(set.reps) > 0) ?? null;
}

export function beatLastTimeTarget(exercise: FlowExercise) {
  const previous = firstPrevious(exercise);
  if (!previous) return { label: "Build a baseline", detail: `${exercise.repMin}–${exercise.repMax} controlled reps` };

  if (exercise.progressionAction === "increase") {
    const weight = exercise.suggestedWeights.find((value) => Number.isFinite(value) && value > 0) ?? previous.weight + exercise.increment;
    return {
      label: `${weight} lb × ${exercise.repMin}–${exercise.repMax}`,
      detail: `Last time started at ${previous.weight}×${previous.reps}. You earned a load increase.`,
    };
  }

  if (previous.reps >= exercise.repMax) {
    return {
      label: `${previous.weight} lb × ${exercise.repMax}`,
      detail: `Match last time with cleaner execution or more RIR before adding load.`,
    };
  }

  const targetReps = Math.min(exercise.repMax, previous.reps + 1);
  return {
    label: `${previous.weight} lb × ${targetReps}`,
    detail: `Last time: ${previous.weight}×${previous.reps}. Beat it by one clean rep.`,
  };
}

export function nextSetCue(exercise: FlowExercise) {
  const working = exercise.sets.filter((set) => (set.type ?? "working") === "working");
  const index = working.findIndex((set) => !set.completed);
  if (index < 0) return null;
  const set = working[index];
  const previous = exercise.previous[index];
  const weight = Number(set.weight ?? exercise.suggestedWeights[index] ?? previous?.weight ?? 0);
  let reps = exercise.repMin;
  if (previous && Math.abs(weight - previous.weight) < 0.01) reps = Math.min(exercise.repMax, Math.max(exercise.repMin, previous.reps + 1));
  return {
    setNumber: index + 1,
    target: `${weight} lb × ${reps}${reps < exercise.repMax ? `–${exercise.repMax}` : ""}`,
    previous: previous ? `${previous.weight}×${previous.reps}${previous.rir == null ? "" : ` @${previous.rir}`}` : "No previous set",
  };
}

export function liveMatchedDelta(exercises: FlowExercise[], previousWorkout: WorkoutHistoryItem | null): LiveDelta | null {
  if (!previousWorkout) return null;
  let matchedSets = 0;
  let currentReps = 0;
  let previousReps = 0;
  let currentVolume = 0;
  let previousVolume = 0;
  const currentPerformance: Array<{ weight: number; reps: number; rir?: number | null }> = [];
  const previousPerformance: Array<{ weight: number; reps: number; rir?: number | null }> = [];

  for (const exercise of exercises) {
    const priorExercise = previousWorkout.exercises?.find((item) => item.id === exercise.id);
    if (!priorExercise) continue;
    const completed = exercise.sets.filter(
      (set) => (set.type ?? "working") === "working" && set.completed && set.weight != null && set.reps != null && Number(set.reps) > 0,
    );
    completed.forEach((set, index) => {
      const prior = priorExercise.sets?.[index];
      if (!prior || Number(prior.reps) <= 0) return;
      const weight = Number(set.weight || 0);
      const reps = Number(set.reps || 0);
      const priorWeight = Number(prior.weight || 0);
      const priorReps = Number(prior.reps || 0);
      matchedSets += 1;
      currentReps += reps;
      previousReps += priorReps;
      currentVolume += weight * reps;
      previousVolume += priorWeight * priorReps;
      currentPerformance.push({ weight, reps, rir: set.rir ?? null });
      previousPerformance.push({ weight: priorWeight, reps: priorReps, rir: prior.rir ?? null });
    });
  }

  if (!matchedSets) return null;
  const currentBest = bestEstimatedOneRepMax(currentPerformance);
  const previousBest = bestEstimatedOneRepMax(previousPerformance);
  return {
    matchedSets,
    repDelta: currentReps - previousReps,
    volumeDelta: currentVolume - previousVolume,
    e1rmDelta: currentBest > 0 && previousBest > 0 ? currentBest - previousBest : null,
  };
}

export function readinessGuidance(record: ReadinessRecord | null) {
  if (!record) return null;
  const redFlags = Number(record.sleep === "poor") + Number(record.energy === "low") + Number(record.soreness === "high");
  if (redFlags >= 2) {
    return {
      tone: "caution" as const,
      title: "Low-readiness day",
      message: "Performance may be suppressed today. Holding load is reasonable—keep technique clean and let RIR decide whether to push.",
    };
  }
  if (redFlags === 1) {
    return {
      tone: "watch" as const,
      title: "Readiness note",
      message: "One readiness signal is off today. Keep the target, but do not force progression if the warm-up or first work set feels unusually hard.",
    };
  }
  return {
    tone: "good" as const,
    title: "Ready to train",
    message: "Readiness looks solid. Use the planned targets and let your actual RIR determine whether you earned the next jump.",
  };
}

export function readinessForToday(records: ReadinessRecord[], now = new Date()) {
  const day = localDay(now);
  return records.find((record) => record.date === day) ?? null;
}

export function completedWorkoutComparison(current: WorkoutHistoryItem, previous: WorkoutHistoryItem | null) {
  if (!previous) return [] as string[];
  const currentReps = current.exercises.reduce((sum, exercise) => sum + exercise.sets.reduce((setSum, set) => setSum + Number(set.reps || 0), 0), 0);
  const previousReps = previous.exercises.reduce((sum, exercise) => sum + exercise.sets.reduce((setSum, set) => setSum + Number(set.reps || 0), 0), 0);
  const volumeDelta = Number(current.totalVolume || 0) - Number(previous.totalVolume || 0);
  const setDelta = Number(current.completedSets || 0) - Number(previous.completedSets || 0);
  const durationDelta = Number(current.durationSeconds || 0) - Number(previous.durationSeconds || 0);
  const lines = [
    `${volumeDelta >= 0 ? "+" : ""}${Math.round(volumeDelta).toLocaleString()} lb volume`,
    `${currentReps - previousReps >= 0 ? "+" : ""}${currentReps - previousReps} reps`,
    `${setDelta >= 0 ? "+" : ""}${setDelta} working sets`,
    `${durationDelta <= 0 ? "" : "+"}${Math.round(durationDelta / 60)} min vs last ${current.name}`,
  ];
  return lines;
}
