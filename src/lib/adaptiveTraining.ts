import type { HybridSession } from "./hybridSessions";
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
