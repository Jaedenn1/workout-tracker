from pathlib import Path

weekly_plan = r'''export const WEEKLY_PLAN_KEY = "workout-tracker:v1.5:weekly-plan";

export type TrainingKind = "lift" | "run" | "conditioning" | "pool" | "recovery" | "rest";

export type WeeklyPlanDay = {
  day: string;
  shortDay: string;
  kind: TrainingKind;
  title: string;
  detail: string;
  targetDurationMinutes?: number | null;
  targetRpe?: number | null;
  routineId?: string | null;
};

export const trainingKinds: Array<{ value: TrainingKind; label: string }> = [
  { value: "lift", label: "Lift" },
  { value: "run", label: "Run" },
  { value: "conditioning", label: "Conditioning" },
  { value: "pool", label: "Pool" },
  { value: "recovery", label: "Recovery" },
  { value: "rest", label: "Rest" },
];

export const defaultWeeklyPlan: WeeklyPlanDay[] = [
  { day: "Monday", shortDay: "MON", kind: "lift", title: "Push Day", detail: "Primary strength session", targetDurationMinutes: 55, targetRpe: 7, routineId: "push" },
  { day: "Tuesday", shortDay: "TUE", kind: "run", title: "Easy Run", detail: "Easy aerobic work", targetDurationMinutes: 35, targetRpe: 5, routineId: null },
  { day: "Wednesday", shortDay: "WED", kind: "lift", title: "Pull Day", detail: "Primary strength session", targetDurationMinutes: 55, targetRpe: 7, routineId: "pull" },
  { day: "Thursday", shortDay: "THU", kind: "conditioning", title: "Conditioning", detail: "Intervals or Jacob's Ladder", targetDurationMinutes: 20, targetRpe: 8, routineId: null },
  { day: "Friday", shortDay: "FRI", kind: "lift", title: "Leg Day", detail: "Primary strength session", targetDurationMinutes: 60, targetRpe: 8, routineId: "legs" },
  { day: "Saturday", shortDay: "SAT", kind: "pool", title: "Pool + Recovery", detail: "Easy swim and recovery work", targetDurationMinutes: 30, targetRpe: 4, routineId: null },
  { day: "Sunday", shortDay: "SUN", kind: "rest", title: "Rest", detail: "Full recovery or easy walk", targetDurationMinutes: null, targetRpe: null, routineId: null },
];

function finiteTarget(value: unknown, min: number, max: number) {
  const number = Number(value);
  if (!Number.isFinite(number)) return null;
  return Math.min(max, Math.max(min, number));
}

export function normalizeWeeklyPlan(value: unknown): WeeklyPlanDay[] {
  if (!Array.isArray(value) || value.length !== 7) return defaultWeeklyPlan;
  return defaultWeeklyPlan.map((fallback, index) => {
    const candidate = value[index] as Partial<WeeklyPlanDay> | undefined;
    const validKind = trainingKinds.some((kind) => kind.value === candidate?.kind);
    const kind = validKind ? (candidate?.kind as TrainingKind) : fallback.kind;
    const targetDurationMinutes = kind === "rest"
      ? null
      : finiteTarget(candidate?.targetDurationMinutes, 5, 300) ?? (kind === fallback.kind ? fallback.targetDurationMinutes ?? null : 45);
    const targetRpe = kind === "rest"
      ? null
      : finiteTarget(candidate?.targetRpe, 1, 10) ?? (kind === fallback.kind ? fallback.targetRpe ?? null : kind === "recovery" || kind === "pool" ? 4 : 7);
    const routineId = kind === "lift"
      ? typeof candidate?.routineId === "string" && candidate.routineId.trim()
        ? candidate.routineId.trim()
        : fallback.kind === "lift" ? fallback.routineId ?? null : null
      : null;
    return {
      day: fallback.day,
      shortDay: fallback.shortDay,
      kind,
      title: typeof candidate?.title === "string" && candidate.title.trim() ? candidate.title.trim() : fallback.title,
      detail: typeof candidate?.detail === "string" ? candidate.detail.trim() : fallback.detail,
      targetDurationMinutes,
      targetRpe,
      routineId,
    };
  });
}

export function todayPlanIndex(date = new Date()) {
  const jsDay = date.getDay();
  return jsDay === 0 ? 6 : jsDay - 1;
}
'''

adaptive = r'''import type { HybridSession } from "./hybridSessions";
import { localDay, type ReadinessRecord, type WorkoutHistoryItem } from "./trainingIntelligence";
import type { TrainingKind, WeeklyPlanDay } from "./weeklyPlan";

export type AdaptiveSignal = "push" | "maintain" | "reduce" | "recover";
export type AdaptiveDayState = "complete" | "partial" | "missed" | "today" | "upcoming" | "rest";
export type RecommendationConfidence = "low" | "medium" | "high";

export type AdaptiveDay = {
  index: number;
  date: string;
  day: string;
  shortDay: string;
  kind: TrainingKind;
  title: string;
  state: AdaptiveDayState;
  durationMinutes: number;
  load: number;
  targetDurationMinutes: number | null;
  targetRpe: number | null;
  actualRpe: number | null;
  routineId: string | null;
  completionScore: number;
  doseRatio: number | null;
  matchLabel: string;
};

export type AdaptiveRecommendation = {
  signal: AdaptiveSignal;
  label: string;
  reason: string;
  detail: string;
  confidence: RecommendationConfidence;
  factors: string[];
};

export type MissedSessionAdvice = {
  date: string;
  day: string;
  kind: TrainingKind;
  title: string;
  bestCall: string;
  options: string[];
};

export type AdaptiveWeekSnapshot = {
  weekStart: string;
  weekEnd: string;
  days: AdaptiveDay[];
  plannedSessions: number;
  dueSessions: number;
  completedPlannedSessions: number;
  completionRate: number | null;
  actualSessions: number;
  totalMinutes: number;
  trainingLoad: number;
  baselineLoad: number | null;
  loadDeltaPct: number | null;
  calibrationWeeks: number;
  confidence: RecommendationConfidence;
  liftingVolume: number;
  runKm: number;
  conditioningFeet: number;
  poolLaps: number;
  recoveryMinutes: number;
  hardDays: number;
  todayRecommendation: AdaptiveRecommendation;
  tomorrowRecommendation: AdaptiveRecommendation;
  balanceAlerts: string[];
  missedSessions: MissedSessionAdvice[];
  nextWeekSuggestions: string[];
};

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function atNoon(value: Date) {
  const date = new Date(value);
  date.setHours(12, 0, 0, 0);
  return date;
}

function mondayOfWeek(value: Date) {
  const date = atNoon(value);
  const day = date.getDay();
  date.setDate(date.getDate() + (day === 0 ? -6 : 1 - day));
  return date;
}

function addDays(value: Date, days: number) {
  const date = atNoon(value);
  date.setDate(date.getDate() + days);
  return date;
}

function liftingMinutes(item: WorkoutHistoryItem) {
  return Math.max(1, Math.round(Number(item.durationSeconds || 0) / 60));
}

function liftingEffort(item: WorkoutHistoryItem) {
  const rir = typeof item.averageRir === "number" && Number.isFinite(item.averageRir) ? item.averageRir : null;
  return rir == null ? 7.5 : clamp(10 - rir, 6, 10);
}

function liftingLoad(item: WorkoutHistoryItem) {
  return liftingMinutes(item) * liftingEffort(item);
}

function hybridLoad(item: HybridSession) {
  return Math.max(1, Number(item.durationMinutes || 0)) * clamp(Number(item.effort || 5), 1, 10);
}

function weightedAverage(values: Array<{ value: number; weight: number }>) {
  const valid = values.filter((item) => Number.isFinite(item.value) && Number.isFinite(item.weight) && item.weight > 0);
  const weight = valid.reduce((sum, item) => sum + item.weight, 0);
  return weight ? valid.reduce((sum, item) => sum + item.value * item.weight, 0) / weight : null;
}

function readinessScore(record: ReadinessRecord | null) {
  if (!record) return null;
  let score = 0;
  if (record.sleep === "poor") score += 2;
  else if (record.sleep === "ok") score += 1;
  if (record.energy === "low") score += 2;
  else if (record.energy === "high") score -= 1;
  if (record.soreness === "high") score += 3;
  else if (record.soreness === "some") score += 1;
  return score;
}

function confidenceForWeeks(weeks: number): RecommendationConfidence {
  if (weeks >= 4) return "high";
  if (weeks >= 2) return "medium";
  return "low";
}

function recommendation(
  plan: WeeklyPlanDay,
  readiness: ReadinessRecord | null,
  loadDeltaPct: number | null,
  calibrationWeeks: number,
  trailingHardDays: number,
  isTomorrow = false,
): AdaptiveRecommendation {
  const confidence = confidenceForWeeks(calibrationWeeks);
  const factors: string[] = [];
  const score = readinessScore(readiness);
  if (score != null) factors.push(score >= 5 ? "readiness: strongly fatigued" : score >= 3 ? "readiness: below baseline" : score <= 0 ? "readiness: strong" : "readiness: neutral");
  if (loadDeltaPct != null) factors.push(`load: ${loadDeltaPct >= 0 ? "+" : ""}${Math.round(loadDeltaPct)}% vs your same-point baseline`);
  else factors.push("load: not enough prior weeks for a personal baseline");
  if (trailingHardDays > 0) factors.push(`recent intensity: ${trailingHardDays} hard day${trailingHardDays === 1 ? "" : "s"} in a row`);

  if (plan.kind === "rest" || plan.kind === "recovery" || plan.kind === "pool") {
    return {
      signal: "recover",
      label: plan.kind === "rest" ? "Protect the recovery day" : "Keep it restorative",
      reason: `${plan.title} is already a low-stress slot in the plan.`,
      detail: "Keep the session easy enough that you finish feeling better than you started.",
      confidence,
      factors,
    };
  }

  if (!isTomorrow && score != null && score >= 5) {
    return { signal: "recover", label: "Convert today to recovery", reason: "Your readiness check is showing multiple strong fatigue signals.", detail: "Skip the hard target today. Use easy movement, pool work, mobility, or full rest and reassess tomorrow.", confidence, factors };
  }
  if ((!isTomorrow && score != null && score >= 3) || trailingHardDays >= 2 || (calibrationWeeks >= 2 && loadDeltaPct != null && loadDeltaPct >= 35)) {
    const reason = trailingHardDays >= 2
      ? "Hard days are stacking together."
      : calibrationWeeks >= 2 && loadDeltaPct != null && loadDeltaPct >= 35
        ? "Your week-to-date load is materially above your own recent baseline."
        : "Readiness is below your normal training baseline.";
    return { signal: "reduce", label: "Reduce the dose", reason, detail: "Keep the session type, but cut volume about 20–30% and avoid adding extra intensity.", confidence, factors };
  }
  if (!isTomorrow && score != null && score <= 0 && trailingHardDays === 0 && (loadDeltaPct == null || loadDeltaPct < 15)) {
    return { signal: "push", label: "Green light to progress", reason: "Readiness is strong and your recent workload is not running hot versus baseline.", detail: "Progress one variable only: load, reps, pace, or interval quality. Do not turn it into an all-out test.", confidence, factors };
  }
  return {
    signal: "maintain",
    label: "Run the plan as written",
    reason: isTomorrow ? "Nothing in the current load pattern strongly argues for changing tomorrow yet." : "Readiness and your personal workload trend do not demand a change.",
    detail: isTomorrow ? "Use tomorrow's readiness check before deciding whether to push harder." : "Hit the planned target and leave unnecessary extra work out.",
    confidence,
    factors,
  };
}

function maxConsecutiveHardDays(hardDates: Set<string>, weekStart: Date, throughIndex: number) {
  let current = 0;
  let best = 0;
  for (let index = 0; index <= throughIndex; index += 1) {
    if (hardDates.has(localDay(addDays(weekStart, index)))) { current += 1; best = Math.max(best, current); }
    else current = 0;
  }
  return best;
}

function trailingHardDays(hardDates: Set<string>, weekStart: Date, throughIndex: number) {
  let total = 0;
  for (let index = throughIndex; index >= 0; index -= 1) {
    if (!hardDates.has(localDay(addDays(weekStart, index)))) break;
    total += 1;
  }
  return total;
}

function missedAdvice(day: AdaptiveDay): MissedSessionAdvice {
  const common = ["Reschedule to the next genuinely open day", "Reduce the next related session instead of stacking full volume", "Convert the next hard slot to recovery if fatigue is high", "Leave it skipped and continue the plan"];
  if (day.kind === "conditioning") return { date: day.date, day: day.day, kind: day.kind, title: day.title, bestCall: "Usually skip rather than stacking missed conditioning beside another hard day.", options: common };
  if (day.kind === "lift") return { date: day.date, day: day.day, kind: day.kind, title: day.title, bestCall: "Reschedule only if it does not create back-to-back hard sessions; otherwise continue forward.", options: common };
  if (day.kind === "run") return { date: day.date, day: day.day, kind: day.kind, title: day.title, bestCall: "If moved, keep the replacement aerobic/easy unless the next day is genuinely clear.", options: common };
  return { date: day.date, day: day.day, kind: day.kind, title: day.title, bestCall: "Recovery work is flexible: shorten it and place it where it helps instead of forcing the original slot.", options: common };
}

function rangeLoad(history: WorkoutHistoryItem[], hybrid: HybridSession[], start: Date, end: Date) {
  const startKey = localDay(start);
  const endKey = localDay(end);
  const lifts = history.filter((item) => { const day = localDay(item.completedAt); return day >= startKey && day <= endKey; });
  const hybrids = hybrid.filter((item) => { const day = localDay(item.completedAt); return day >= startKey && day <= endKey; });
  return {
    sessions: lifts.length + hybrids.length,
    load: lifts.reduce((sum, item) => sum + liftingLoad(item), 0) + hybrids.reduce((sum, item) => sum + hybridLoad(item), 0),
  };
}

function completionForDay(plan: WeeklyPlanDay, lifts: WorkoutHistoryItem[], hybrids: HybridSession[]) {
  const targetDuration = Number(plan.targetDurationMinutes || 0) > 0 ? Number(plan.targetDurationMinutes) : null;
  const targetRpe = Number(plan.targetRpe || 0) > 0 ? Number(plan.targetRpe) : null;
  let durationMinutes = 0;
  let actualRpe: number | null = null;
  let load = 0;
  let matched = false;
  let substitute = false;
  let matchLabel = "No matching session";

  if (plan.kind === "lift") {
    const exact = plan.routineId ? lifts.filter((item) => item.routineId === plan.routineId) : lifts;
    const used = exact.length ? exact : plan.routineId && lifts.length ? lifts : [];
    matched = exact.length > 0 || (!plan.routineId && lifts.length > 0);
    substitute = !matched && used.length > 0;
    durationMinutes = used.reduce((sum, item) => sum + liftingMinutes(item), 0);
    load = used.reduce((sum, item) => sum + liftingLoad(item), 0);
    actualRpe = weightedAverage(used.map((item) => ({ value: liftingEffort(item), weight: liftingMinutes(item) })));
    matchLabel = matched ? (plan.routineId ? "Planned routine matched" : "Lift matched") : substitute ? "Different lifting routine" : "No lift logged";
  } else if (plan.kind !== "rest") {
    const used = hybrids.filter((item) => item.kind === plan.kind);
    matched = used.length > 0;
    durationMinutes = used.reduce((sum, item) => sum + Number(item.durationMinutes || 0), 0);
    load = used.reduce((sum, item) => sum + hybridLoad(item), 0);
    actualRpe = weightedAverage(used.map((item) => ({ value: Number(item.effort || 0), weight: Number(item.durationMinutes || 0) })));
    matchLabel = matched ? `${plan.kind} matched` : `No ${plan.kind} logged`;
  }

  if (plan.kind === "rest") return { durationMinutes: 0, actualRpe: null, load: 0, completionScore: 100, doseRatio: null, matchLabel: "Recovery day", matched: true };
  if (!matched && !substitute) return { durationMinutes, actualRpe, load, completionScore: 0, doseRatio: null, matchLabel, matched: false };

  const durationCoverage = targetDuration ? clamp(durationMinutes / targetDuration, 0, 1) : 1;
  const effortCoverage = targetRpe && actualRpe ? clamp(actualRpe / targetRpe, 0, 1) : 1;
  let completionScore = Math.round((durationCoverage * 0.8 + effortCoverage * 0.2) * 100);
  if (substitute) completionScore = Math.round(completionScore * 0.5);
  const targetDose = targetDuration && targetRpe ? targetDuration * targetRpe : null;
  const actualDose = actualRpe ? durationMinutes * actualRpe : null;
  const doseRatio = targetDose && actualDose != null ? actualDose / targetDose : null;
  return { durationMinutes, actualRpe, load, completionScore: clamp(completionScore, 0, 100), doseRatio, matchLabel, matched };
}

export function buildAdaptiveWeek(history: WorkoutHistoryItem[], hybrid: HybridSession[], plan: WeeklyPlanDay[], readiness: ReadinessRecord[], now = new Date()): AdaptiveWeekSnapshot {
  const weekStartDate = mondayOfWeek(now);
  const weekEndDate = addDays(weekStartDate, 6);
  const today = localDay(now);
  const todayIndex = clamp(Math.round((atNoon(now).getTime() - weekStartDate.getTime()) / 86400000), 0, 6);
  const dates = plan.map((_, index) => localDay(addDays(weekStartDate, index)));
  const dateSet = new Set(dates);
  const lifting = history.filter((item) => dateSet.has(localDay(item.completedAt)));
  const hybridWeek = hybrid.filter((item) => dateSet.has(localDay(item.completedAt)));
  const liftingByDate = new Map<string, WorkoutHistoryItem[]>();
  const hybridByDate = new Map<string, HybridSession[]>();
  for (const item of lifting) { const date = localDay(item.completedAt); liftingByDate.set(date, [...(liftingByDate.get(date) ?? []), item]); }
  for (const item of hybridWeek) { const date = localDay(item.completedAt); hybridByDate.set(date, [...(hybridByDate.get(date) ?? []), item]); }

  const hardDates = new Set<string>();
  for (const item of lifting) if (liftingLoad(item) >= 400 || (typeof item.averageRir === "number" && item.averageRir <= 2)) hardDates.add(localDay(item.completedAt));
  for (const item of hybridWeek) if (hybridLoad(item) >= 400 || item.effort >= 8) hardDates.add(localDay(item.completedAt));

  const days: AdaptiveDay[] = plan.map((item, index) => {
    const date = dates[index];
    const result = completionForDay(item, liftingByDate.get(date) ?? [], hybridByDate.get(date) ?? []);
    let state: AdaptiveDayState;
    if (item.kind === "rest") state = "rest";
    else if (result.completionScore >= 80) state = "complete";
    else if (result.completionScore > 0) state = "partial";
    else if (index < todayIndex) state = "missed";
    else if (date === today) state = "today";
    else state = "upcoming";
    return {
      index, date, day: item.day, shortDay: item.shortDay, kind: item.kind, title: item.title, state,
      durationMinutes: result.durationMinutes, load: Math.round(result.load), targetDurationMinutes: item.targetDurationMinutes ?? null,
      targetRpe: item.targetRpe ?? null, actualRpe: result.actualRpe, routineId: item.routineId ?? null,
      completionScore: result.completionScore, doseRatio: result.doseRatio, matchLabel: result.matchLabel,
    };
  });

  const plannedSessions = plan.filter((item) => item.kind !== "rest").length;
  const dueDays = days.filter((item) => item.kind !== "rest" && (item.index < todayIndex || (item.index === todayIndex && item.completionScore > 0)));
  const completedDue = dueDays.filter((item) => item.completionScore >= 80).length;
  const completionRate = dueDays.length ? Math.round(dueDays.reduce((sum, item) => sum + item.completionScore, 0) / dueDays.length) : null;
  const totalMinutes = lifting.reduce((sum, item) => sum + liftingMinutes(item), 0) + hybridWeek.reduce((sum, item) => sum + Number(item.durationMinutes || 0), 0);
  const trainingLoad = Math.round(lifting.reduce((sum, item) => sum + liftingLoad(item), 0) + hybridWeek.reduce((sum, item) => sum + hybridLoad(item), 0));

  const baselineSamples: number[] = [];
  for (let offset = 1; offset <= 4; offset += 1) {
    const start = addDays(weekStartDate, -7 * offset);
    const end = addDays(start, todayIndex);
    const sample = rangeLoad(history, hybrid, start, end);
    if (sample.sessions > 0) baselineSamples.push(sample.load);
  }
  const baselineLoad = baselineSamples.length ? Math.round(baselineSamples.reduce((sum, value) => sum + value, 0) / baselineSamples.length) : null;
  const loadDeltaPct = baselineLoad && baselineLoad > 0 ? ((trainingLoad - baselineLoad) / baselineLoad) * 100 : null;
  const calibrationWeeks = baselineSamples.length;
  const confidence = confidenceForWeeks(calibrationWeeks);

  const liftingVolume = Math.round(lifting.reduce((sum, item) => sum + Number(item.totalVolume || 0), 0));
  const runKm = hybridWeek.filter((item) => item.kind === "run").reduce((sum, item) => sum + Number(item.distanceKm || 0), 0);
  const conditioningFeet = hybridWeek.filter((item) => item.kind === "conditioning").reduce((sum, item) => sum + Number(item.elevationFeet || 0), 0);
  const poolLaps = hybridWeek.filter((item) => item.kind === "pool").reduce((sum, item) => sum + Number(item.laps || 0), 0);
  const recoveryMinutes = hybridWeek.filter((item) => item.kind === "pool" || item.kind === "recovery").reduce((sum, item) => sum + Number(item.durationMinutes || 0), 0);
  const actualSessions = lifting.length + hybridWeek.length;
  const currentReadiness = readiness.find((item) => item.date === today) ?? null;
  const trailingHard = trailingHardDays(hardDates, weekStartDate, todayIndex);
  const todayPlan = plan[todayIndex];
  const tomorrowIndex = Math.min(6, todayIndex + 1);
  const tomorrowPlan = plan[tomorrowIndex];
  const todayRecommendation = recommendation(todayPlan, currentReadiness, loadDeltaPct, calibrationWeeks, trailingHard);
  const tomorrowRecommendation = todayIndex === 6
    ? { signal: "maintain" as const, label: "Set next week deliberately", reason: "This is the final day of the current training week.", detail: "Use the recap below to shape next week's plan instead of auto-copying fatigue forward.", confidence, factors: loadDeltaPct == null ? ["personal baseline still calibrating"] : [`week load: ${Math.round(loadDeltaPct)}% vs baseline`] }
    : recommendation(tomorrowPlan, null, loadDeltaPct, calibrationWeeks, trailingHard, true);

  const counts = plan.reduce<Record<TrainingKind, number>>((acc, item) => ({ ...acc, [item.kind]: acc[item.kind] + 1 }), { lift: 0, run: 0, conditioning: 0, pool: 0, recovery: 0, rest: 0 });
  const hardDayStreak = maxConsecutiveHardDays(hardDates, weekStartDate, todayIndex);
  const balanceAlerts: string[] = [];
  if (calibrationWeeks >= 2 && loadDeltaPct != null && loadDeltaPct >= 35) balanceAlerts.push(`Week-to-date training load is ${Math.round(loadDeltaPct)}% above your personal same-point baseline.`);
  if (hardDates.size >= 3) balanceAlerts.push("Three or more high-load days are already logged this week.");
  if (hardDayStreak >= 2) balanceAlerts.push("High-load days are stacked back-to-back. Separate the next hard exposure if possible.");
  if (counts.lift >= 4 && counts.run + counts.conditioning === 0) balanceAlerts.push("The plan is strength-heavy with no dedicated run or conditioning exposure.");
  if (counts.run + counts.conditioning >= 4 && counts.lift < 2) balanceAlerts.push("The plan is cardio-heavy with fewer than two strength exposures.");
  if (plannedSessions >= 6 && counts.rest + counts.recovery + counts.pool <= 1) balanceAlerts.push("The planned week is dense: six or more active sessions with very little recovery space.");
  if (completionRate != null && dueDays.length >= 3 && completionRate < 60) balanceAlerts.push("Plan dose completion is below 60% so far. The schedule may be asking for more than the week can realistically hold.");
  if (actualSessions >= 4 && recoveryMinutes < 20) balanceAlerts.push("Training volume is accumulating without much logged recovery work.");

  const nextWeekSuggestions: string[] = [];
  if (completionRate != null && dueDays.length >= 3 && completionRate < 70) nextWeekSuggestions.push("Reduce one required session or lower a target duration next week; your plan-vs-actual dose suggests the current week is too ambitious.");
  if (calibrationWeeks >= 2 && loadDeltaPct != null && loadDeltaPct >= 25) nextWeekSuggestions.push("Start next week closer to your recent personal load baseline instead of carrying this week's elevated dose forward.");
  if (hardDates.size >= 3 || hardDayStreak >= 2) nextWeekSuggestions.push("Separate high-intensity days with easy aerobic, pool/recovery, or rest work.");
  if (!hybridWeek.some((item) => item.kind === "run") && counts.run > 0 && todayIndex >= 4) nextWeekSuggestions.push("Protect one easy aerobic run early enough in the week that it cannot keep getting squeezed out.");
  if (!nextWeekSuggestions.length) nextWeekSuggestions.push("Keep the current structure. Change only one variable next week if performance and readiness stay stable.");

  return {
    weekStart: localDay(weekStartDate), weekEnd: localDay(weekEndDate), days, plannedSessions, dueSessions: dueDays.length,
    completedPlannedSessions: completedDue, completionRate, actualSessions, totalMinutes, trainingLoad, baselineLoad,
    loadDeltaPct, calibrationWeeks, confidence, liftingVolume, runKm, conditioningFeet, poolLaps, recoveryMinutes,
    hardDays: hardDates.size, todayRecommendation, tomorrowRecommendation, balanceAlerts,
    missedSessions: days.filter((item) => item.state === "missed").map(missedAdvice), nextWeekSuggestions,
  };
}
'''

weekly_component = r'''"use client";

import { useEffect, useMemo, useState } from "react";
import { defaultRoutines, type RoutineDefinition } from "../data/training";
import { WEEKLY_PLAN_KEY, defaultWeeklyPlan, normalizeWeeklyPlan, todayPlanIndex, trainingKinds, type TrainingKind, type WeeklyPlanDay } from "../lib/weeklyPlan";

const ROUTINES_KEY = "workout-tracker:v0.4:routines";
const ACTIVE_ROUTINE_KEY = "workout-tracker:v0.4:active-routine";

function kindIcon(kind: TrainingKind) {
  if (kind === "lift") return "🏋️";
  if (kind === "run") return "🏃";
  if (kind === "conditioning") return "⚡";
  if (kind === "pool") return "🏊";
  if (kind === "recovery") return "♨️";
  return "○";
}

function sessionHref(item: WeeklyPlanDay) {
  if (item.kind === "lift") return "/gym";
  if (item.kind === "rest") return null;
  return `/session?kind=${encodeURIComponent(item.kind)}&title=${encodeURIComponent(item.title)}`;
}

function readRoutines() {
  try {
    const parsed = JSON.parse(localStorage.getItem(ROUTINES_KEY) ?? "null");
    return Array.isArray(parsed) && parsed.length ? parsed as RoutineDefinition[] : defaultRoutines;
  } catch { return defaultRoutines; }
}

export default function WeeklyPlan() {
  const [plan, setPlan] = useState<WeeklyPlanDay[]>(defaultWeeklyPlan);
  const [routines, setRoutines] = useState<RoutineDefinition[]>(defaultRoutines);
  const [hydrated, setHydrated] = useState(false);
  const today = todayPlanIndex();

  useEffect(() => {
    try { setPlan(normalizeWeeklyPlan(JSON.parse(localStorage.getItem(WEEKLY_PLAN_KEY) ?? "null"))); }
    catch { setPlan(defaultWeeklyPlan); }
    setRoutines(readRoutines());
    setHydrated(true);
  }, []);

  function save(next: WeeklyPlanDay[]) {
    setPlan(next);
    localStorage.setItem(WEEKLY_PLAN_KEY, JSON.stringify(next));
    window.dispatchEvent(new CustomEvent("workout-tracker:weekly-plan"));
  }

  function update(index: number, patch: Partial<WeeklyPlanDay>) {
    save(plan.map((item, itemIndex) => (itemIndex === index ? { ...item, ...patch } : item)));
  }

  function reset() { save(defaultWeeklyPlan); }

  const counts = useMemo(() => plan.reduce<Record<TrainingKind, number>>((acc, item) => ({ ...acc, [item.kind]: acc[item.kind] + 1 }), { lift: 0, run: 0, conditioning: 0, pool: 0, recovery: 0, rest: 0 }), [plan]);

  return (
    <main className="wp-shell">
      <header className="wp-topbar">
        <div><p className="ti-eyebrow">WEEKLY PLAN · V1.7.2</p><h1>Hybrid Week</h1><p>Give each session a target dose. The coach compares the plan against what you actually complete.</p></div>
        <div className="ac-top-actions"><a className="ti-secondary" href="/coach">Adaptive coach</a><a className="ti-secondary" href="/">Today</a></div>
      </header>

      <section className="wp-summary">
        <div><span>Lift</span><strong>{counts.lift}</strong></div><div><span>Run</span><strong>{counts.run}</strong></div><div><span>Conditioning</span><strong>{counts.conditioning}</strong></div><div><span>Recovery</span><strong>{counts.pool + counts.recovery + counts.rest}</strong></div>
      </section>

      <section className="wp-list" aria-busy={!hydrated}>
        {plan.map((item, index) => {
          const href = sessionHref(item);
          const routine = routines.find((value) => value.id === item.routineId);
          return <article className={`wp-day ${index === today ? "is-today" : ""}`} key={item.day}>
            <div className="wp-day-head"><div className="wp-day-label"><span>{item.shortDay}</span><strong>{index === today ? "Today" : item.day}</strong></div><span className="wp-kind-icon" aria-hidden="true">{kindIcon(item.kind)}</span></div>
            <label className="wp-field"><span>Session type</span><select value={item.kind} onChange={(event) => update(index, { kind: event.target.value as TrainingKind, routineId: event.target.value === "lift" ? item.routineId ?? null : null })}>{trainingKinds.map((kind) => <option key={kind.value} value={kind.value}>{kind.label}</option>)}</select></label>
            <label className="wp-field"><span>Session</span><input value={item.title} onChange={(event) => update(index, { title: event.target.value })} placeholder="Session name" /></label>
            <label className="wp-field"><span>Goal</span><input value={item.detail} onChange={(event) => update(index, { detail: event.target.value })} placeholder="Short goal or focus" /></label>
            {item.kind === "lift" && <label className="wp-field"><span>Planned routine</span><select value={item.routineId ?? ""} onChange={(event) => update(index, { routineId: event.target.value || null })}><option value="">Any lifting routine</option>{routines.map((value) => <option key={value.id} value={value.id}>{value.name}</option>)}</select></label>}
            {item.kind !== "rest" && <div className="wp-target-grid">
              <label className="wp-field"><span>Target minutes</span><input type="number" inputMode="numeric" min="5" max="300" step="5" value={item.targetDurationMinutes ?? 45} onChange={(event) => update(index, { targetDurationMinutes: Math.max(5, Math.min(300, Number(event.target.value) || 45)) })} /></label>
              <label className="wp-field"><span>Target RPE</span><input type="number" inputMode="decimal" min="1" max="10" step="0.5" value={item.targetRpe ?? 7} onChange={(event) => update(index, { targetRpe: Math.max(1, Math.min(10, Number(event.target.value) || 7)) })} /></label>
            </div>}
            {href && <a className="wp-action" href={href} onClick={() => { if (item.kind === "lift" && item.routineId) localStorage.setItem(ACTIVE_ROUTINE_KEY, item.routineId); }}>{item.kind === "lift" ? `Open ${routine?.name ?? "gym logger"}` : "Track this session"} →</a>}
            {item.kind === "rest" && <span className="wp-rest-label">Recovery day · no logger needed</span>}
          </article>;
        })}
      </section>
      <footer className="wp-footer"><button type="button" onClick={reset}>Reset starter week</button><div className="ac-top-actions"><a href="/coach">Weekly intelligence →</a><a href="/history">All training history →</a></div></footer>
    </main>
  );
}
'''

coach_component = r'''"use client";

import { useEffect, useMemo, useState } from "react";
import { buildAdaptiveWeek } from "../lib/adaptiveTraining";
import { readHybridSessions, type HybridSession } from "../lib/hybridSessions";
import { HISTORY_KEY, READINESS_KEY, safeArray, type ReadinessRecord, type WorkoutHistoryItem } from "../lib/trainingIntelligence";
import { WEEKLY_PLAN_KEY, defaultWeeklyPlan, normalizeWeeklyPlan, type WeeklyPlanDay } from "../lib/weeklyPlan";

function readPlan() { try { return normalizeWeeklyPlan(JSON.parse(localStorage.getItem(WEEKLY_PLAN_KEY) ?? "null")); } catch { return defaultWeeklyPlan; } }
function statusLabel(state: string) { if (state === "complete") return "Done"; if (state === "partial") return "Partial"; if (state === "missed") return "Missed"; if (state === "today") return "Today"; if (state === "rest") return "Rest"; return "Upcoming"; }
function deltaLabel(value: number | null) { if (value == null) return "Calibrating"; return `${value >= 0 ? "+" : ""}${Math.round(value)}%`; }

export default function AdaptiveCoach() {
  const [history, setHistory] = useState<WorkoutHistoryItem[]>([]);
  const [hybrid, setHybrid] = useState<HybridSession[]>([]);
  const [readiness, setReadiness] = useState<ReadinessRecord[]>([]);
  const [plan, setPlan] = useState<WeeklyPlanDay[]>(defaultWeeklyPlan);

  useEffect(() => {
    const refresh = () => { setHistory(safeArray<WorkoutHistoryItem>(localStorage.getItem(HISTORY_KEY))); setHybrid(readHybridSessions()); setReadiness(safeArray<ReadinessRecord>(localStorage.getItem(READINESS_KEY))); setPlan(readPlan()); };
    refresh();
    window.addEventListener("workout-tracker:hybrid-session", refresh); window.addEventListener("workout-tracker:weekly-plan", refresh); window.addEventListener("storage", refresh);
    return () => { window.removeEventListener("workout-tracker:hybrid-session", refresh); window.removeEventListener("workout-tracker:weekly-plan", refresh); window.removeEventListener("storage", refresh); };
  }, []);

  const snapshot = useMemo(() => buildAdaptiveWeek(history, hybrid, plan, readiness), [history, hybrid, plan, readiness]);
  const completion = snapshot.completionRate == null ? "—" : `${snapshot.completionRate}%`;

  return (
    <main className="ac-shell">
      <header className="ac-topbar"><div><p className="ti-eyebrow">ADAPTIVE COACH · V1.7.2</p><h1>Weekly Intelligence</h1><p>Personal baseline + plan-vs-actual dose. Recommendations stay explainable and never edit your week automatically.</p></div><div className="ac-top-actions"><a className="ti-secondary" href="/plan">Weekly plan</a><a className="ti-secondary" href="/">Today</a></div></header>

      <section className={`ac-recommend ac-${snapshot.todayRecommendation.signal}`}>
        <div><span>Today's call · {snapshot.todayRecommendation.signal}</span><h2>{snapshot.todayRecommendation.label}</h2><p>{snapshot.todayRecommendation.reason}</p></div>
        <div className="ac-call-detail"><strong>{snapshot.todayRecommendation.detail}</strong><small>Confidence: {snapshot.todayRecommendation.confidence}</small></div>
      </section>
      <details className="ac-explain"><summary>Why this recommendation?</summary>{snapshot.todayRecommendation.factors.map((factor) => <p key={factor}>{factor}</p>)}</details>

      <section className="ac-kpis">
        <div><span>Dose completion</span><strong>{completion}</strong><small>{snapshot.completedPlannedSessions}/{snapshot.dueSessions} sessions ≥80%</small></div>
        <div><span>Training load</span><strong>{snapshot.trainingLoad.toLocaleString()}</strong><small>session-RPE points*</small></div>
        <div><span>Personal baseline</span><strong>{snapshot.baselineLoad?.toLocaleString() ?? "—"}</strong><small>{snapshot.calibrationWeeks}/4 prior weeks</small></div>
        <div><span>Vs baseline</span><strong>{deltaLabel(snapshot.loadDeltaPct)}</strong><small>{snapshot.confidence} confidence</small></div>
      </section>

      <section className="ac-card">
        <div className="ac-heading"><div><p className="ti-eyebrow">THIS WEEK</p><h2>Plan vs. actual dose</h2></div><span>{snapshot.weekStart} → {snapshot.weekEnd}</span></div>
        <div className="ac-week-grid">
          {snapshot.days.map((day) => <div className={`ac-day ac-day-${day.state}`} key={day.date}>
            <span>{day.shortDay}</span><strong>{day.title}</strong><small>{day.kind} · {statusLabel(day.state)}</small>
            {day.kind !== "rest" && <><em>{day.completionScore}% planned dose</em><small>{day.matchLabel}</small><small>{day.durationMinutes || 0}/{day.targetDurationMinutes ?? "—"} min · RPE {day.actualRpe?.toFixed(1) ?? "—"}/{day.targetRpe ?? "—"}</small>{day.doseRatio != null && <small>{Math.round(day.doseRatio * 100)}% actual/target load</small>}</>}
          </div>)}
        </div>
      </section>

      <section className="ac-two-col">
        <article className="ac-card"><p className="ti-eyebrow">TOMORROW</p><h2>{snapshot.tomorrowRecommendation.label}</h2><p>{snapshot.tomorrowRecommendation.reason}</p><strong className={`ac-pill ac-pill-${snapshot.tomorrowRecommendation.signal}`}>{snapshot.tomorrowRecommendation.signal}</strong><small>{snapshot.tomorrowRecommendation.detail}</small><small className="ac-confidence">Confidence: {snapshot.tomorrowRecommendation.confidence}</small></article>
        <article className="ac-card"><p className="ti-eyebrow">WEEKLY RECAP</p><h2>What accumulated</h2><div className="ac-recap"><span><b>{snapshot.totalMinutes}</b> total minutes</span><span><b>{snapshot.liftingVolume.toLocaleString()}</b> lb lifting volume</span><span><b>{snapshot.runKm.toFixed(1)}</b> km running</span><span><b>{Math.round(snapshot.conditioningFeet).toLocaleString()}</b> ft conditioning</span><span><b>{Math.round(snapshot.poolLaps)}</b> pool laps</span><span><b>{snapshot.recoveryMinutes}</b> recovery min</span></div></article>
      </section>

      <section className="ac-card"><div className="ac-heading"><div><p className="ti-eyebrow">CALIBRATION</p><h2>Your baseline, not a generic threshold</h2></div><span>{snapshot.confidence} confidence</span></div><p>{snapshot.calibrationWeeks >= 2 ? `Current week-to-date load is ${deltaLabel(snapshot.loadDeltaPct)} versus the average load at this same point across ${snapshot.calibrationWeeks} recent week${snapshot.calibrationWeeks === 1 ? "" : "s"}.` : "Keep logging sessions. Two prior comparable weeks unlock personalized load comparisons; four weeks gives the coach high-confidence calibration."}</p></section>

      <section className="ac-card"><div className="ac-heading"><div><p className="ti-eyebrow">BALANCE CHECK</p><h2>Load & structure flags</h2></div></div>{snapshot.balanceAlerts.length ? <div className="ac-alerts">{snapshot.balanceAlerts.map((item) => <p key={item}>⚠ {item}</p>)}</div> : <p className="ac-good">No major balance flags detected from the current week.</p>}</section>

      <section className="ac-card"><div className="ac-heading"><div><p className="ti-eyebrow">MISSED SESSIONS</p><h2>Handle them without panic-stacking</h2></div><a href="/plan">Edit week →</a></div>{snapshot.missedSessions.length ? <div className="ac-missed-list">{snapshot.missedSessions.map((item) => <article key={`${item.date}-${item.kind}`}><span>{item.day} · {item.kind}</span><h3>{item.title}</h3><p>{item.bestCall}</p><div>{item.options.map((option) => <small key={option}>{option}</small>)}</div></article>)}</div> : <p className="ac-good">No fully missed planned sessions so far this week.</p>}</section>

      <section className="ac-card"><div className="ac-heading"><div><p className="ti-eyebrow">NEXT WEEK</p><h2>Suggested adjustments</h2></div><span>Suggestions only</span></div><ol className="ac-suggestions">{snapshot.nextWeekSuggestions.map((item) => <li key={item}>{item}</li>)}</ol><a className="ti-primary ac-edit-plan" href="/plan">Review weekly plan</a></section>
      <p className="ac-footnote">* Hybrid load = duration × reported RPE. Lifting load uses duration × estimated effort from average RIR. Personal baseline compares the current week to the same weekday point in up to four recent weeks. These are coaching heuristics, not medical measurements.</p>
    </main>
  );
}
'''

Path("src/lib/weeklyPlan.ts").write_text(weekly_plan)
Path("src/lib/adaptiveTraining.ts").write_text(adaptive)
Path("src/components/WeeklyPlan.tsx").write_text(weekly_component)
Path("src/components/AdaptiveCoach.tsx").write_text(coach_component)

css = Path("app/v22.css")
text = css.read_text()
addition = r'''

/* v1.7.2 calibration + plan-vs-actual precision */
.wp-target-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px}.ac-call-detail{display:flex;flex-direction:column;gap:8px;align-items:flex-end;text-align:right}.ac-call-detail small,.ac-confidence{font-size:11px;letter-spacing:.08em;text-transform:uppercase;opacity:.7}.ac-explain{margin:-4px 0 16px;padding:12px 14px;border:1px solid rgba(255,255,255,.08);border-radius:16px;background:rgba(255,255,255,.025)}.ac-explain summary{cursor:pointer;font-weight:800}.ac-explain p{margin:8px 0 0;font-size:12px;opacity:.75}.ac-day-partial{border-color:rgba(255,184,77,.32)!important;background:linear-gradient(145deg,rgba(255,184,77,.08),rgba(255,255,255,.02))!important}.ac-day em{font-style:normal;font-weight:800;color:#fff}.ac-day small+small{margin-top:2px}@media(max-width:720px){.wp-target-grid{grid-template-columns:1fr 1fr}.ac-call-detail{align-items:flex-start;text-align:left}}
'''
if "v1.7.2 calibration + plan-vs-actual precision" not in text:
    css.write_text(text + addition)

layout = Path("app/layout.tsx")
text = layout.read_text().replace("Hybrid training tracker for lifting, running, conditioning, pool, and recovery", "Adaptive hybrid training tracker with personalized load calibration and plan-vs-actual coaching")
layout.write_text(text)

sw = Path("public/sw.js")
text = sw.read_text().replace('workout-tracker-v1.7-adaptive-intelligence', 'workout-tracker-v1.7.2-calibrated-coach')
sw.write_text(text)

for path in ["package.json", "package-lock.json"]:
    file = Path(path)
    file.write_text(file.read_text().replace('"version": "1.7.0"', '"version": "1.7.2"'))

db = Path("src/lib/database.ts")
text = db.read_text().replace('appVersion: "1.7.0"', 'appVersion: "1.7.2"').replace('appVersion: "1.6.1"', 'appVersion: "1.7.2"')
db.write_text(text)

print("v1.7.2 personalized calibration + plan-vs-actual precision applied")
