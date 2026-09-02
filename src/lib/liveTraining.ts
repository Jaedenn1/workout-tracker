import { exerciseLibrary, getExerciseDefinition, type ExerciseDefinition, type MuscleGroup } from "../data/training";
import type { AdvancedIntelligenceSnapshot } from "./advancedTrainingIntelligence";
import { estimateOneRepMax, progressionDecision, type PerformanceSet } from "./progression";
import type { WorkoutHistoryItem } from "./trainingIntelligence";
import type { TrainingKind, WeeklyPlanDay } from "./weeklyPlan";

export const LIVE_SESSION_KEY = "workout-tracker:v1.9:live-session";

export type LiveOverrideMode = "coach" | "original" | "custom";
export type LiveDiscomfort = "joint" | "muscle" | "cramp" | "technique" | "other";
export type LiveTimelineTone = "neutral" | "good" | "warn" | "stop";
export type LiveTimelineEvent = { id: string; elapsedSeconds: number; label: string; detail: string; tone: LiveTimelineTone };
export type LivePrescription = {
  originalDuration: number;
  originalRpe: number;
  coachDuration: number;
  coachRpe: number;
  coachLoad: number;
  volumeScale: number;
  focus: string;
  avoid: string;
};

export type LiveSet = { id: string; weight: number | null; reps: number | null; rir: number | null; done: boolean };
export type LiveExercise = {
  id: string;
  name: string;
  muscle: MuscleGroup;
  repMin: number;
  repMax: number;
  increment: number;
  fallbackWeight: number;
  skipped?: boolean;
  sets: LiveSet[];
};

export type IntervalPaceSignal = { tone: LiveTimelineTone; detail: string };

export function clampLiveDuration(value: unknown, fallback = 45) {
  const parsed = Number(value);
  const safe = Number.isFinite(parsed) ? parsed : fallback;
  return Math.max(5, Math.min(300, Math.round(safe)));
}

export function clampLiveRpe(value: unknown, fallback = 7) {
  const parsed = Number(value);
  const safe = Number.isFinite(parsed) ? parsed : fallback;
  return Math.max(1, Math.min(10, Math.round(safe * 2) / 2));
}

export function validLiveSet(set: LiveSet) {
  return Boolean(
    set.done &&
    set.weight != null && Number.isFinite(Number(set.weight)) && Number(set.weight) >= 0 &&
    set.reps != null && Number.isFinite(Number(set.reps)) && Number(set.reps) > 0 &&
    (set.rir == null || (Number.isFinite(Number(set.rir)) && Number(set.rir) >= 0 && Number(set.rir) <= 6))
  );
}

export function completedLiveSetCount(exercises: LiveExercise[]) {
  return exercises.reduce((sum, exercise) => sum + exercise.sets.filter(validLiveSet).length, 0);
}

export function plannedLiveSetCount(exercises: LiveExercise[]) {
  return exercises.reduce((sum, exercise) => {
    const completed = exercise.sets.filter(validLiveSet).length;
    return sum + (exercise.skipped ? completed : exercise.sets.length);
  }, 0);
}

export function intervalPaceSignal(splitSeconds: number, priorSplits: number[]): IntervalPaceSignal {
  const split = Number(splitSeconds);
  const prior = priorSplits.filter((value) => Number.isFinite(value) && value > 0);
  if (!Number.isFinite(split) || split <= 0 || !prior.length) {
    return { tone: "neutral", detail: "Interval recorded." };
  }
  const baseline = prior.reduce((sum, value) => sum + value, 0) / prior.length;
  if (split < baseline * 0.96) {
    return { tone: "warn", detail: "This rep was >4% faster than your prior-rep average. Keep the next rep controlled enough to preserve quality." };
  }
  if (split > baseline * 1.06) {
    return { tone: "warn", detail: "This rep slowed >6% versus your prior-rep average. Consider ending the interval block if quality is dropping." };
  }
  return { tone: "neutral", detail: "Split stayed close to the current interval average." };
}

export function uid(prefix: string) {
  const token = typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  return `${prefix}-${token}`;
}

export function formatClock(totalSeconds: number) {
  const safe = Math.max(0, Math.floor(totalSeconds));
  const hours = Math.floor(safe / 3600);
  const minutes = Math.floor((safe % 3600) / 60);
  const seconds = safe % 60;
  return hours > 0
    ? `${hours}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`
    : `${minutes}:${String(seconds).padStart(2, "0")}`;
}

export function buildLivePrescription(plan: WeeklyPlanDay, signal: "push" | "maintain" | "reduce" | "recover", advanced: AdvancedIntelligenceSnapshot): LivePrescription {
  const originalDuration = clampLiveDuration(plan.targetDurationMinutes, plan.kind === "conditioning" ? 20 : 45);
  const originalRpe = clampLiveRpe(plan.targetRpe, plan.kind === "pool" || plan.kind === "recovery" ? 4 : 7);
  let durationScale = 1;
  let rpeDelta = 0;
  let focus = plan.detail || "Execute the planned session cleanly.";
  let avoid = "Avoid adding unplanned fatigue just because the session feels good.";

  if (signal === "reduce") {
    durationScale = advanced.deloadSuggested ? 0.65 : 0.78;
    rpeDelta = -1;
    focus = "Keep the session goal but trim volume and preserve clean execution.";
    avoid = "Do not chase extra sets, intervals, or failure work today.";
  } else if (signal === "recover") {
    durationScale = plan.kind === "pool" || plan.kind === "recovery" ? 0.85 : 0.5;
    rpeDelta = -3;
    focus = "Finish feeling better than you started. Treat movement as recovery work.";
    avoid = "No grinding reps, hard intervals, or PR attempts.";
  } else if (signal === "push") {
    durationScale = 1;
    rpeDelta = 0.5;
    focus = "Progress one variable only while staying inside the planned session structure.";
    avoid = "Do not turn a green light into an all-out test.";
  }

  if (advanced.plannedMuscleOverlap != null && advanced.plannedMuscleOverlap >= 80 && plan.kind === "lift") durationScale = Math.min(durationScale, 0.75);
  if ((advanced.intensityDrift ?? 0) >= 1) rpeDelta = Math.min(rpeDelta, -0.5);
  if (advanced.recoveryDebtScore >= 60) durationScale = Math.min(durationScale, 0.7);

  const coachDuration = Math.max(10, Math.round((originalDuration * durationScale) / 5) * 5);
  const coachRpe = Math.max(3, Math.min(9.5, Math.round((originalRpe + rpeDelta) * 2) / 2));
  return {
    originalDuration,
    originalRpe,
    coachDuration,
    coachRpe,
    coachLoad: Math.round(coachDuration * coachRpe),
    volumeScale: Math.max(0.45, Math.min(1, coachDuration / originalDuration)),
    focus,
    avoid,
  };
}

function latestExerciseSets(history: WorkoutHistoryItem[], exerciseId: string): PerformanceSet[] {
  for (const workout of history) {
    const exercise = workout.exercises?.find((item) => item.id === exerciseId);
    if (exercise?.sets?.length) return exercise.sets.map((set) => ({ weight: Number(set.weight || 0), reps: Number(set.reps || 0), rir: set.rir ?? null }));
  }
  const definition = getExerciseDefinition(exerciseId);
  return definition?.seedPrevious?.map((set) => ({ ...set })) ?? [];
}

export function makeLiveExercise(definition: ExerciseDefinition, history: WorkoutHistoryItem[], volumeScale = 1): LiveExercise {
  const previous = latestExerciseSets(history, definition.id);
  const plannedSets = Math.max(1, Math.round(definition.setCount * Math.max(0.45, Math.min(1, volumeScale))));
  const decision = progressionDecision(previous, definition.repMin, definition.repMax, definition.increment, definition.fallbackWeight, plannedSets);
  return {
    id: definition.id,
    name: definition.name,
    muscle: definition.muscle,
    repMin: definition.repMin,
    repMax: definition.repMax,
    increment: definition.increment,
    fallbackWeight: definition.fallbackWeight,
    sets: Array.from({ length: plannedSets }, (_, index) => ({
      id: uid(`${definition.id}-set`),
      weight: decision.suggestedWeights[index] ?? decision.suggestedWeights.at(-1) ?? definition.fallbackWeight,
      reps: null,
      rir: null,
      done: false,
    })),
  };
}

export function completedPerformance(exercise: LiveExercise): PerformanceSet[] {
  return exercise.sets
    .filter(validLiveSet)
    .map((set) => ({ weight: Number(set.weight), reps: Number(set.reps), rir: set.rir }));
}

export function nextSetRecommendation(exercise: LiveExercise, targetRpe: number) {
  const completed = completedPerformance(exercise);
  const nextIndex = exercise.sets.findIndex((set) => !set.done);
  if (nextIndex < 0) return { label: "Exercise complete", target: "Move on or finish the session.", restSeconds: 0, weight: null };
  const previous = completed.at(-1);
  const plannedWeight = Number(exercise.sets[nextIndex]?.weight ?? exercise.fallbackWeight);
  const targetRir = Math.max(0, Math.min(4, Math.round(10 - targetRpe)));
  let weight = plannedWeight;
  let cue = `${exercise.repMin}–${exercise.repMax} reps · target ${targetRir} RIR`;
  if (previous?.rir != null && previous.rir <= 1) {
    weight = Math.max(0, Math.round((previous.weight - exercise.increment) * 2) / 2);
    cue = `${exercise.repMin}–${Math.max(exercise.repMin, exercise.repMax - 2)} reps · keep ≥${Math.max(1, targetRir)} RIR`;
  } else if (previous?.rir != null && previous.rir >= 4 && previous.reps >= exercise.repMax) {
    weight = Math.max(0, Math.round((previous.weight + exercise.increment) * 2) / 2);
    cue = `${exercise.repMin}–${exercise.repMax} reps · keep the progression controlled`;
  } else if (previous) {
    weight = previous.weight;
  }
  const restSeconds = smartRestSeconds(exercise, previous?.rir ?? null);
  return { label: `Next set · ${weight} lb`, target: cue, restSeconds, weight };
}

export function smartRestSeconds(exercise: LiveExercise, rir: number | null) {
  let seconds = exercise.repMin <= 6 ? 180 : ["Quads", "Hamstrings", "Glutes", "Back", "Chest"].includes(exercise.muscle) ? 120 : 90;
  if (rir != null && rir <= 1) seconds += 30;
  if (rir != null && rir >= 4) seconds -= 15;
  return Math.max(60, Math.min(240, seconds));
}

export function substitutionOptions(exerciseId: string, custom: ExerciseDefinition[] = []) {
  const source = [...exerciseLibrary, ...custom].find((item) => item.id === exerciseId);
  if (!source) return [];
  return [...exerciseLibrary, ...custom]
    .filter((item) => item.id !== source.id && item.muscle === source.muscle)
    .map((item) => {
      const repGap = Math.abs(item.repMin - source.repMin) + Math.abs(item.repMax - source.repMax);
      const setGap = Math.abs(item.setCount - source.setCount);
      const score = Math.max(55, Math.round(98 - repGap * 2.5 - setGap * 4));
      return { definition: item, score };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, 3);
}

export function historicalBestE1rm(history: WorkoutHistoryItem[], exerciseId: string) {
  let best = 0;
  for (const workout of history) {
    const exercise = workout.exercises?.find((item) => item.id === exerciseId);
    for (const set of exercise?.sets ?? []) best = Math.max(best, estimateOneRepMax(Number(set.weight || 0), Number(set.reps || 0)));
  }
  return best;
}

export function liveDosePercent(kind: TrainingKind, elapsedSeconds: number, targetDuration: number, targetRpe: number, currentRpe: number, completedSets = 0, totalSets = 0) {
  const timeCoverage = Math.max(0, elapsedSeconds / Math.max(60, targetDuration * 60));
  const effortCoverage = Math.max(0.35, Math.min(1.4, currentRpe / Math.max(1, targetRpe)));
  if (kind === "lift" && totalSets > 0) {
    const setCoverage = completedSets / totalSets;
    return Math.round(Math.max(0, (timeCoverage * 0.45 + setCoverage * 0.55) * effortCoverage) * 100);
  }
  return Math.round(Math.max(0, timeCoverage * effortCoverage) * 100);
}

export function sessionStatus(dosePercent: number) {
  if (dosePercent < 55) return { label: "BUILDING", tone: "neutral" as const };
  if (dosePercent < 90) return { label: "ON TARGET", tone: "good" as const };
  if (dosePercent <= 110) return { label: "TARGET REACHED", tone: "good" as const };
  return { label: "ABOVE TARGET", tone: "warn" as const };
}

export function sessionQualityScore(dosePercent: number, currentRpe: number, targetRpe: number, discomfort: LiveDiscomfort | null, smartFinishReached: boolean) {
  let score = 100;
  score -= Math.min(35, Math.abs(dosePercent - 100) * 0.35);
  score -= Math.min(28, Math.abs(currentRpe - targetRpe) * 8);
  if (dosePercent > 118) score -= 8;
  if (discomfort) score -= discomfort === "joint" ? 8 : 4;
  if (smartFinishReached && dosePercent >= 90 && dosePercent <= 112) score += 3;
  return Math.max(0, Math.min(100, Math.round(score)));
}

export function recoveryEstimate(kind: TrainingKind, dosePercent: number, advanced: AdvancedIntelligenceSnapshot) {
  let low = 18;
  let high = 36;
  if (kind === "lift") { low = 36; high = 60; }
  else if (kind === "conditioning") { low = 30; high = 54; }
  else if (kind === "run") { low = 24; high = 48; }
  else if (kind === "pool" || kind === "recovery") { low = 8; high = 24; }
  if (dosePercent > 115) { low += 8; high += 12; }
  if (advanced.recoveryDebtScore >= 60) { low += 8; high += 12; }
  return { low, high, label: `${low}–${high}h` };
}

export function generatedSessionNote(params: {
  kind: TrainingKind;
  dosePercent: number;
  currentRpe: number;
  targetRpe: number;
  branch: string;
  prCount: number;
  discomfort: LiveDiscomfort | null;
}) {
  const parts: string[] = [];
  if (params.dosePercent >= 90 && params.dosePercent <= 110) parts.push("Session finished inside the intended training dose.");
  else if (params.dosePercent > 110) parts.push("Session ran above the intended training dose.");
  else parts.push("Session finished below the original target dose.");
  const drift = params.currentRpe - params.targetRpe;
  if (drift >= 1) parts.push(`Effort finished about ${drift.toFixed(1)} RPE above target.`);
  else if (drift <= -1) parts.push(`Effort finished about ${Math.abs(drift).toFixed(1)} RPE below target.`);
  else parts.push("Effort stayed close to the planned intensity.");
  if (params.branch !== "normal") parts.push(`Live branch used: ${params.branch}.`);
  if (params.prCount) parts.push(`${params.prCount} PR signal${params.prCount === 1 ? "" : "s"} recorded.`);
  if (params.discomfort) parts.push(`Discomfort was logged (${params.discomfort}); session adjustments were offered without diagnosing the cause.`);
  return parts.join(" ");
}
