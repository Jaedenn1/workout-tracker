import { getExerciseDefinition, type RoutineDefinition } from "../data/training";
import type { HybridSession } from "./hybridSessions";
import type { AdaptiveDay, AdaptiveRecommendation } from "./adaptiveTraining";
import { localDay, type ReadinessRecord, type WorkoutHistoryItem } from "./trainingIntelligence";
import type { TrainingKind, WeeklyPlanDay } from "./weeklyPlan";

export const COACH_FEEDBACK_KEY = "workout-tracker:v1.8:coach-feedback";

export type CoachFeedbackRating = "too_easy" | "right" | "too_hard";
export type CoachFeedback = {
  id: string;
  createdAt: string;
  date: string;
  rating: CoachFeedbackRating;
  recommendation: string;
  signal: AdaptiveRecommendation["signal"];
};

export type LoadTrend = "calibrating" | "low" | "steady" | "elevated" | "spike";
export type ModalityStress = {
  kind: Exclude<TrainingKind, "rest">;
  load7: number;
  weekly28: number;
  ratio: number | null;
  trend: LoadTrend;
};
export type MuscleFatigue = { muscle: string; score: number; rawLoad: number };
export type SessionClassSummary = { label: string; count: number };

export type AdvancedIntelligenceSnapshot = {
  acuteLoad7: number;
  chronicWeeklyLoad28: number;
  loadRatio: number | null;
  loadTrend: LoadTrend;
  historyDays: number;
  modalityStress: ModalityStress[];
  muscleFatigue: MuscleFatigue[];
  plannedMuscleOverlap: number | null;
  overlapMuscles: string[];
  intensityDrift: number | null;
  unexpectedlyHardSessions: number;
  unexpectedlyEasySessions: number;
  recoveryDebtScore: number;
  recoveryDebtLabel: "low" | "moderate" | "high";
  readinessDaysLogged: number;
  lowReadinessStreak: number;
  deloadSuggested: boolean;
  deloadReason: string | null;
  feedbackCount: number;
  feedbackBias: number;
  feedbackLabel: string;
  sessionClasses: SessionClassSummary[];
  factors: string[];
};

const modalityKinds: Array<Exclude<TrainingKind, "rest">> = ["lift", "run", "conditioning", "pool", "recovery"];

function clamp(value: number, min: number, max: number) { return Math.min(max, Math.max(min, value)); }
function atNoon(value: Date) { const date = new Date(value); date.setHours(12, 0, 0, 0); return date; }
function dayAge(value: string | Date, now: Date) {
  const date = typeof value === "string" ? new Date(value) : value;
  return Math.floor((atNoon(now).getTime() - atNoon(date).getTime()) / 86400000);
}
function liftingMinutes(item: WorkoutHistoryItem) { return Math.max(1, Math.round(Number(item.durationSeconds || 0) / 60)); }
function liftingEffort(item: WorkoutHistoryItem) {
  const rir = typeof item.averageRir === "number" && Number.isFinite(item.averageRir) ? item.averageRir : null;
  return rir == null ? 7.5 : clamp(10 - rir, 6, 10);
}
function liftingLoad(item: WorkoutHistoryItem) { return liftingMinutes(item) * liftingEffort(item); }
function hybridLoad(item: HybridSession) { return Math.max(1, Number(item.durationMinutes || 0)) * clamp(Number(item.effort || 5), 1, 10); }
function modalityFactor(kind: Exclude<TrainingKind, "rest">) {
  if (kind === "pool") return 0.55;
  if (kind === "recovery") return 0.3;
  return 1;
}
function trendForRatio(ratio: number | null): LoadTrend {
  if (ratio == null) return "calibrating";
  if (ratio < 0.68) return "low";
  if (ratio <= 1.15) return "steady";
  if (ratio <= 1.35) return "elevated";
  return "spike";
}
function readinessFatigue(record: ReadinessRecord) {
  let score = 0;
  if (record.sleep === "poor") score += 2; else if (record.sleep === "ok") score += 1;
  if (record.energy === "low") score += 2; else if (record.energy === "high") score -= 1;
  if (record.soreness === "high") score += 3; else if (record.soreness === "some") score += 1;
  return clamp(score, 0, 7);
}
function classifyHybrid(item: HybridSession) {
  const title = item.title.toLowerCase();
  if (item.kind === "run") {
    if (/interval|sprint|repeat|hill/.test(title)) return "Run · intervals";
    if (/tempo|threshold/.test(title)) return "Run · tempo";
    if (/long/.test(title)) return "Run · long";
    if (/easy|aerobic|recovery/.test(title)) return "Run · easy";
    return "Run · general";
  }
  if (item.kind === "conditioning") {
    if (/jacob|ladder/.test(title)) return "Conditioning · Jacob's Ladder";
    if (/sled/.test(title)) return "Conditioning · sled";
    if (/sprint/.test(title)) return "Conditioning · sprint";
    if (/circuit/.test(title)) return "Conditioning · circuit";
    if (/bike/.test(title)) return "Conditioning · bike";
    if (/row/.test(title)) return "Conditioning · row";
    return "Conditioning · general";
  }
  if (item.kind === "pool") return /recover|easy/.test(title) ? "Pool · recovery" : "Pool · swim";
  return "Recovery";
}
function feedbackValue(rating: CoachFeedbackRating) { return rating === "too_hard" ? 1 : rating === "too_easy" ? -1 : 0; }

export function readCoachFeedback(): CoachFeedback[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(COACH_FEEDBACK_KEY) ?? "[]");
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item): item is CoachFeedback => Boolean(item && typeof item === "object" && typeof item.id === "string" && (item.rating === "too_easy" || item.rating === "right" || item.rating === "too_hard"))).slice(0, 100);
  } catch { return []; }
}

export function saveCoachFeedback(feedback: CoachFeedback) {
  const next = [feedback, ...readCoachFeedback().filter((item) => item.id !== feedback.id)].slice(0, 100);
  localStorage.setItem(COACH_FEEDBACK_KEY, JSON.stringify(next));
  window.dispatchEvent(new CustomEvent("workout-tracker:coach-feedback"));
  return next;
}

export function buildAdvancedIntelligence(
  history: WorkoutHistoryItem[],
  hybrid: HybridSession[],
  readiness: ReadinessRecord[],
  plan: WeeklyPlanDay[],
  adaptiveDays: AdaptiveDay[],
  routines: RoutineDefinition[],
  feedback: CoachFeedback[],
  now = new Date(),
): AdvancedIntelligenceSnapshot {
  const liftEntries = history.map((item) => ({ date: item.completedAt, kind: "lift" as const, load: liftingLoad(item), weighted: liftingLoad(item), title: item.name }));
  const hybridEntries = hybrid.map((item) => ({ date: item.completedAt, kind: item.kind, load: hybridLoad(item), weighted: hybridLoad(item) * modalityFactor(item.kind), title: item.title }));
  const entries = [...liftEntries, ...hybridEntries].filter((item) => { const age = dayAge(item.date, now); return age >= 0 && age <= 27; });
  const acuteEntries = entries.filter((item) => dayAge(item.date, now) <= 6);
  const acuteLoad7 = Math.round(acuteEntries.reduce((sum, item) => sum + item.weighted, 0));
  const chronicTotal = entries.reduce((sum, item) => sum + item.weighted, 0);
  const chronicWeeklyLoad28 = Math.round(chronicTotal / 4);
  const oldestAge = entries.length ? Math.max(...entries.map((item) => dayAge(item.date, now))) : 0;
  const historyDays = entries.length ? oldestAge + 1 : 0;
  const loadRatio = historyDays >= 14 && chronicWeeklyLoad28 > 0 ? acuteLoad7 / chronicWeeklyLoad28 : null;
  const loadTrend = trendForRatio(loadRatio);

  const modalityStress = modalityKinds.map((kind) => {
    const relevant = entries.filter((item) => item.kind === kind);
    const acute = relevant.filter((item) => dayAge(item.date, now) <= 6).reduce((sum, item) => sum + item.weighted, 0);
    const weekly28 = relevant.reduce((sum, item) => sum + item.weighted, 0) / 4;
    const ratio = historyDays >= 14 && weekly28 > 0 ? acute / weekly28 : null;
    return { kind, load7: Math.round(acute), weekly28: Math.round(weekly28), ratio, trend: trendForRatio(ratio) };
  });

  const fatigueRaw = new Map<string, number>();
  const decay = [1, 0.88, 0.74, 0.6, 0.48, 0.36, 0.25];
  for (const item of history) {
    const age = dayAge(item.completedAt, now);
    if (age < 0 || age > 6) continue;
    const setsByMuscle = new Map<string, number>();
    let totalSets = 0;
    for (const exercise of item.exercises ?? []) {
      const workingSets = (exercise.sets ?? []).filter((set) => Number(set.reps || 0) > 0).length;
      if (!workingSets) continue;
      const muscle = getExerciseDefinition(exercise.id)?.muscle ?? "Other";
      setsByMuscle.set(muscle, (setsByMuscle.get(muscle) ?? 0) + workingSets);
      totalSets += workingSets;
    }
    if (!totalSets) continue;
    const sessionLoad = liftingLoad(item) * decay[age];
    for (const [muscle, sets] of setsByMuscle) fatigueRaw.set(muscle, (fatigueRaw.get(muscle) ?? 0) + sessionLoad * (sets / totalSets));
  }
  const maxMuscleLoad = Math.max(...fatigueRaw.values(), 0);
  const muscleFatigue = [...fatigueRaw.entries()]
    .map(([muscle, rawLoad]) => ({ muscle, rawLoad: Math.round(rawLoad), score: maxMuscleLoad ? Math.round((rawLoad / maxMuscleLoad) * 100) : 0 }))
    .sort((a, b) => b.score - a.score);

  const todayIndex = now.getDay() === 0 ? 6 : now.getDay() - 1;
  const todayPlan = plan[todayIndex];
  const routine = todayPlan?.routineId ? routines.find((item) => item.id === todayPlan.routineId) : null;
  const targetMuscles = routine ? [...new Set(routine.exerciseIds.map((id) => getExerciseDefinition(id)?.muscle).filter((value): value is NonNullable<typeof value> => Boolean(value)))] : [];
  const fatigueByMuscle = new Map(muscleFatigue.map((item) => [item.muscle, item.score]));
  const overlapValues = targetMuscles.map((muscle) => fatigueByMuscle.get(muscle) ?? 0);
  const plannedMuscleOverlap = overlapValues.length ? Math.round(overlapValues.reduce((sum, value) => sum + value, 0) / overlapValues.length) : null;
  const overlapMuscles = targetMuscles.filter((muscle) => (fatigueByMuscle.get(muscle) ?? 0) >= 60);

  const doseDays = adaptiveDays.filter((day) => day.actualRpe != null && day.targetRpe != null && (day.state === "complete" || day.state === "partial"));
  const drifts = doseDays.map((day) => Number(day.actualRpe) - Number(day.targetRpe));
  const intensityDrift = drifts.length ? drifts.reduce((sum, value) => sum + value, 0) / drifts.length : null;
  const unexpectedlyHardSessions = drifts.filter((value) => value >= 1.5).length;
  const unexpectedlyEasySessions = drifts.filter((value) => value <= -1.5).length;

  const readinessRecent = readiness
    .filter((item) => { const age = dayAge(`${item.date}T12:00:00`, now); return age >= 0 && age <= 6; })
    .sort((a, b) => b.date.localeCompare(a.date));
  const readinessWeights = [1, 0.9, 0.78, 0.66, 0.55, 0.46, 0.38];
  const debtNumerator = readinessRecent.reduce((sum, item) => sum + readinessFatigue(item) * (readinessWeights[dayAge(`${item.date}T12:00:00`, now)] ?? 0.35), 0);
  const debtDenominator = readinessRecent.reduce((sum, item) => sum + 7 * (readinessWeights[dayAge(`${item.date}T12:00:00`, now)] ?? 0.35), 0);
  const recoveryDebtScore = debtDenominator ? Math.round((debtNumerator / debtDenominator) * 100) : 0;
  const recoveryDebtLabel = recoveryDebtScore >= 60 ? "high" : recoveryDebtScore >= 32 ? "moderate" : "low";
  let lowReadinessStreak = 0;
  for (let offset = 0; offset <= 6; offset += 1) {
    const date = new Date(now); date.setDate(date.getDate() - offset);
    const record = readinessRecent.find((item) => item.date === localDay(date));
    if (!record || readinessFatigue(record) < 3) break;
    lowReadinessStreak += 1;
  }

  const recentFeedback = feedback.slice(0, 8);
  const feedbackBias = recentFeedback.length ? recentFeedback.reduce((sum, item) => sum + feedbackValue(item.rating), 0) / recentFeedback.length : 0;
  const feedbackLabel = recentFeedback.length < 3 ? "Learning your response" : feedbackBias >= 0.35 ? "Biasing more conservative" : feedbackBias <= -0.35 ? "Biasing less conservative" : "Feedback calibration neutral";

  const classes = new Map<string, number>();
  for (const item of hybrid.filter((session) => { const age = dayAge(session.completedAt, now); return age >= 0 && age <= 6; })) {
    const label = classifyHybrid(item); classes.set(label, (classes.get(label) ?? 0) + 1);
  }
  for (const item of history.filter((session) => { const age = dayAge(session.completedAt, now); return age >= 0 && age <= 6; })) {
    const label = `Lift · ${item.name || item.routineId || "general"}`; classes.set(label, (classes.get(label) ?? 0) + 1);
  }
  const sessionClasses = [...classes.entries()].map(([label, count]) => ({ label, count })).sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));

  let deloadSuggested = false;
  let deloadReason: string | null = null;
  if (recoveryDebtScore >= 60 && loadRatio != null && loadRatio >= 1.15) {
    deloadSuggested = true; deloadReason = "Recovery trend is poor while 7-day load is above your 28-day weekly baseline.";
  } else if (lowReadinessStreak >= 3) {
    deloadSuggested = true; deloadReason = "Three consecutive low-readiness days suggest accumulated fatigue is not clearing normally.";
  } else if (recoveryDebtScore >= 50 && unexpectedlyHardSessions >= 2) {
    deloadSuggested = true; deloadReason = "Multiple sessions landed harder than planned while recovery signals are trending down.";
  }

  const factors: string[] = [];
  factors.push(loadRatio == null ? "7/28 load: calibrating" : `7/28 load: ${loadRatio.toFixed(2)}× (${loadTrend})`);
  factors.push(`recovery debt: ${recoveryDebtScore}/100 (${recoveryDebtLabel})`);
  if (plannedMuscleOverlap != null) factors.push(`planned muscle overlap: ${plannedMuscleOverlap}/100${overlapMuscles.length ? ` · ${overlapMuscles.join(", ")}` : ""}`);
  if (intensityDrift != null) factors.push(`intensity drift: ${intensityDrift >= 0 ? "+" : ""}${intensityDrift.toFixed(1)} RPE vs plan`);
  if (recentFeedback.length) factors.push(`coach feedback: ${feedbackLabel.toLowerCase()} from ${recentFeedback.length} recent rating${recentFeedback.length === 1 ? "" : "s"}`);

  return {
    acuteLoad7, chronicWeeklyLoad28, loadRatio, loadTrend, historyDays, modalityStress, muscleFatigue,
    plannedMuscleOverlap, overlapMuscles, intensityDrift, unexpectedlyHardSessions, unexpectedlyEasySessions,
    recoveryDebtScore, recoveryDebtLabel, readinessDaysLogged: readinessRecent.length, lowReadinessStreak,
    deloadSuggested, deloadReason, feedbackCount: recentFeedback.length, feedbackBias, feedbackLabel, sessionClasses, factors,
  };
}

function moveOneStep(signal: AdaptiveRecommendation["signal"], direction: "harder" | "easier") {
  const order: AdaptiveRecommendation["signal"][] = ["recover", "reduce", "maintain", "push"];
  const index = order.indexOf(signal);
  return order[clamp(index + (direction === "harder" ? 1 : -1), 0, order.length - 1)];
}

export function refineRecommendation(base: AdaptiveRecommendation, advanced: AdvancedIntelligenceSnapshot, plannedKind: TrainingKind): AdaptiveRecommendation {
  let signal = base.signal;
  let label = base.label;
  let reason = base.reason;
  let detail = base.detail;
  const factors = [...base.factors, ...advanced.factors];

  if (advanced.deloadSuggested && plannedKind !== "rest" && plannedKind !== "recovery" && plannedKind !== "pool") {
    signal = advanced.recoveryDebtScore >= 70 ? "recover" : "reduce";
    label = advanced.recoveryDebtScore >= 70 ? "Deload signal: recover" : "Deload signal: reduce stress";
    reason = advanced.deloadReason ?? "Multiple fatigue signals are elevated together.";
    detail = "Treat this as a temporary reduction signal, not an automatic plan rewrite. Reduce volume/intensity and reassess after recovery improves.";
  } else if (advanced.loadTrend === "spike" && (signal === "push" || signal === "maintain")) {
    signal = "reduce"; label = "Reduce the workload spike"; reason = "Your 7-day weighted load is materially above your recent 28-day weekly baseline.";
  } else if (plannedKind === "lift" && (advanced.plannedMuscleOverlap ?? 0) >= 85 && signal === "maintain") {
    signal = "reduce"; label = "Reduce overlapping muscle stress"; reason = "The muscles targeted today still carry a high share of your recent lifting fatigue.";
  } else if (plannedKind === "lift" && (advanced.plannedMuscleOverlap ?? 0) >= 70 && signal === "push") {
    signal = "maintain"; label = "Hold progression today"; reason = "The planned muscles are still carrying meaningful recent fatigue.";
  } else if ((advanced.intensityDrift ?? 0) >= 1.25 && signal === "maintain") {
    signal = "reduce"; label = "Bring intensity back to plan"; reason = "Recent sessions have been landing meaningfully harder than their planned RPE.";
  }

  if (advanced.feedbackCount >= 3) {
    if (advanced.feedbackBias >= 0.5 && signal !== "recover") {
      const adjusted = moveOneStep(signal, "easier");
      if (adjusted !== signal) { signal = adjusted; factors.push("feedback adjustment: recent advice has tended to feel too hard"); }
    } else if (advanced.feedbackBias <= -0.5 && signal === "reduce" && !advanced.deloadSuggested && advanced.loadTrend !== "spike") {
      signal = moveOneStep(signal, "harder"); factors.push("feedback adjustment: recent advice has tended to feel too easy");
    }
  }

  return { ...base, signal, label, reason, detail, factors };
}
