import type { HybridSession } from "./hybridSessions";
import { localDay, type ReadinessRecord, type WorkoutHistoryItem } from "./trainingIntelligence";
import type { TrainingKind, WeeklyPlanDay } from "./weeklyPlan";

export type AdaptiveSignal = "push" | "maintain" | "reduce" | "recover";
export type AdaptiveDayState = "complete" | "missed" | "today" | "upcoming" | "rest";

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
};

export type AdaptiveRecommendation = {
  signal: AdaptiveSignal;
  label: string;
  reason: string;
  detail: string;
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

function recommendation(
  plan: WeeklyPlanDay,
  readiness: ReadinessRecord | null,
  trainingLoad: number,
  trailingHardDays: number,
  isTomorrow = false,
): AdaptiveRecommendation {
  if (plan.kind === "rest" || plan.kind === "recovery" || plan.kind === "pool") {
    return {
      signal: "recover",
      label: plan.kind === "rest" ? "Protect the recovery day" : "Keep it restorative",
      reason: `${plan.title} is already a low-stress slot in the plan.`,
      detail: "Keep the session easy enough that you finish feeling better than you started.",
    };
  }

  const score = readinessScore(readiness);
  if (!isTomorrow && score != null && score >= 5) {
    return {
      signal: "recover",
      label: "Convert today to recovery",
      reason: "Readiness is showing multiple strong fatigue signals.",
      detail: "Skip the hard target today. Use easy movement, pool work, mobility, or full rest and reassess tomorrow.",
    };
  }
  if ((!isTomorrow && score != null && score >= 3) || trailingHardDays >= 2 || trainingLoad >= 2800) {
    return {
      signal: "reduce",
      label: "Reduce the dose",
      reason: trailingHardDays >= 2 ? "Hard days are stacking together." : trainingLoad >= 2800 ? "Current-week load is already high." : "Readiness is below your normal training baseline.",
      detail: "Keep the session type, but cut volume about 20–30% and avoid adding extra intensity.",
    };
  }
  if (!isTomorrow && score != null && score <= 0 && trailingHardDays === 0 && trainingLoad < 2200) {
    return {
      signal: "push",
      label: "Green light to progress",
      reason: "Readiness is strong and recent hard-day stacking is low.",
      detail: "Progress one variable only: load, reps, pace, or interval quality. Do not turn it into an all-out test.",
    };
  }
  return {
    signal: "maintain",
    label: "Run the plan as written",
    reason: isTomorrow ? "No strong reason to change tomorrow's planned dose yet." : "Readiness and current-week load do not demand a change.",
    detail: isTomorrow ? "Use tomorrow's readiness check before deciding whether to push harder." : "Hit the planned target and leave unnecessary extra work out.",
  };
}

function maxConsecutiveHardDays(hardDates: Set<string>, weekStart: Date, throughIndex: number) {
  let current = 0;
  let best = 0;
  for (let index = 0; index <= throughIndex; index += 1) {
    if (hardDates.has(localDay(addDays(weekStart, index)))) {
      current += 1;
      best = Math.max(best, current);
    } else current = 0;
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
  if (day.kind === "conditioning") {
    return { date: day.date, day: day.day, kind: day.kind, title: day.title, bestCall: "Usually skip rather than stacking missed conditioning beside another hard day.", options: common };
  }
  if (day.kind === "lift") {
    return { date: day.date, day: day.day, kind: day.kind, title: day.title, bestCall: "Reschedule only if it does not create back-to-back hard sessions; otherwise continue forward.", options: common };
  }
  if (day.kind === "run") {
    return { date: day.date, day: day.day, kind: day.kind, title: day.title, bestCall: "If moved, keep the replacement aerobic/easy unless the next day is genuinely clear.", options: common };
  }
  return { date: day.date, day: day.day, kind: day.kind, title: day.title, bestCall: "Recovery work is flexible: shorten it and place it where it helps instead of forcing the original slot.", options: common };
}

export function buildAdaptiveWeek(
  history: WorkoutHistoryItem[],
  hybrid: HybridSession[],
  plan: WeeklyPlanDay[],
  readiness: ReadinessRecord[],
  now = new Date(),
): AdaptiveWeekSnapshot {
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
  for (const item of lifting) {
    const date = localDay(item.completedAt);
    liftingByDate.set(date, [...(liftingByDate.get(date) ?? []), item]);
  }
  for (const item of hybridWeek) {
    const date = localDay(item.completedAt);
    hybridByDate.set(date, [...(hybridByDate.get(date) ?? []), item]);
  }

  const hardDates = new Set<string>();
  for (const item of lifting) {
    const date = localDay(item.completedAt);
    if (liftingLoad(item) >= 400 || (typeof item.averageRir === "number" && item.averageRir <= 2)) hardDates.add(date);
  }
  for (const item of hybridWeek) {
    const date = localDay(item.completedAt);
    if (hybridLoad(item) >= 400 || item.effort >= 8) hardDates.add(date);
  }

  const days: AdaptiveDay[] = plan.map((item, index) => {
    const date = dates[index];
    const liftItems = liftingByDate.get(date) ?? [];
    const hybridItems = hybridByDate.get(date) ?? [];
    const completed = item.kind === "lift" ? liftItems.length > 0 : item.kind === "rest" ? false : hybridItems.some((session) => session.kind === item.kind);
    const durationMinutes = liftItems.reduce((sum, session) => sum + liftingMinutes(session), 0) + hybridItems.reduce((sum, session) => sum + Number(session.durationMinutes || 0), 0);
    const load = liftItems.reduce((sum, session) => sum + liftingLoad(session), 0) + hybridItems.reduce((sum, session) => sum + hybridLoad(session), 0);
    let state: AdaptiveDayState;
    if (item.kind === "rest") state = "rest";
    else if (completed) state = "complete";
    else if (index < todayIndex) state = "missed";
    else if (date === today) state = "today";
    else state = "upcoming";
    return { index, date, day: item.day, shortDay: item.shortDay, kind: item.kind, title: item.title, state, durationMinutes, load: Math.round(load) };
  });

  const plannedSessions = plan.filter((item) => item.kind !== "rest").length;
  const dueDays = days.filter((item) => item.kind !== "rest" && (item.index < todayIndex || item.state === "complete"));
  const completedDue = dueDays.filter((item) => item.state === "complete").length;
  const completionRate = dueDays.length ? Math.round((completedDue / dueDays.length) * 100) : null;
  const totalMinutes = lifting.reduce((sum, item) => sum + liftingMinutes(item), 0) + hybridWeek.reduce((sum, item) => sum + Number(item.durationMinutes || 0), 0);
  const trainingLoad = Math.round(lifting.reduce((sum, item) => sum + liftingLoad(item), 0) + hybridWeek.reduce((sum, item) => sum + hybridLoad(item), 0));
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
  const todayRecommendation = recommendation(todayPlan, currentReadiness, trainingLoad, trailingHard);
  const tomorrowRecommendation = todayIndex === 6
    ? { signal: "maintain" as const, label: "Set next week deliberately", reason: "This is the final day of the current training week.", detail: "Use the recap below to shape next week's plan instead of auto-copying fatigue forward." }
    : recommendation(tomorrowPlan, null, trainingLoad, trailingHard, true);

  const counts = plan.reduce<Record<TrainingKind, number>>((acc, item) => ({ ...acc, [item.kind]: acc[item.kind] + 1 }), { lift: 0, run: 0, conditioning: 0, pool: 0, recovery: 0, rest: 0 });
  const hardDayStreak = maxConsecutiveHardDays(hardDates, weekStartDate, todayIndex);
  const balanceAlerts: string[] = [];
  if (hardDates.size >= 3) balanceAlerts.push("Three or more high-load days are already logged this week.");
  if (hardDayStreak >= 2) balanceAlerts.push("High-load days are stacked back-to-back. Separate the next hard exposure if possible.");
  if (counts.lift >= 4 && counts.run + counts.conditioning === 0) balanceAlerts.push("The plan is strength-heavy with no dedicated run or conditioning exposure.");
  if (counts.run + counts.conditioning >= 4 && counts.lift < 2) balanceAlerts.push("The plan is cardio-heavy with fewer than two strength exposures.");
  if (plannedSessions >= 6 && counts.rest + counts.recovery + counts.pool <= 1) balanceAlerts.push("The planned week is dense: six or more active sessions with very little recovery space.");
  if (completionRate != null && dueDays.length >= 3 && completionRate < 60) balanceAlerts.push("Plan adherence is below 60% so far. The schedule may be asking for more than the week can realistically hold.");
  if (actualSessions >= 4 && recoveryMinutes < 20) balanceAlerts.push("Training volume is accumulating without much logged recovery work.");

  const nextWeekSuggestions: string[] = [];
  if (completionRate != null && dueDays.length >= 3 && completionRate < 70) nextWeekSuggestions.push("Plan one fewer required session next week and earn extra work only if recovery stays good.");
  if (hardDates.size >= 3 || hardDayStreak >= 2) nextWeekSuggestions.push("Separate high-intensity days with easy aerobic, pool/recovery, or rest work.");
  if (!hybridWeek.some((item) => item.kind === "run") && counts.run > 0 && todayIndex >= 4) nextWeekSuggestions.push("Protect one easy aerobic run early enough in the week that it cannot keep getting squeezed out.");
  if (lifting.length < 2 && counts.lift >= 2 && todayIndex >= 4) nextWeekSuggestions.push("Keep at least two strength exposures, but reduce exercise count before dropping strength days entirely.");
  if (actualSessions >= 4 && recoveryMinutes < 30) nextWeekSuggestions.push("Schedule 30–45 minutes of explicit recovery work instead of relying on leftover time.");
  if (!nextWeekSuggestions.length) nextWeekSuggestions.push("Repeat the structure next week and progress only one training variable at a time.");

  return {
    weekStart: localDay(weekStartDate),
    weekEnd: localDay(weekEndDate),
    days,
    plannedSessions,
    dueSessions: dueDays.length,
    completedPlannedSessions: completedDue,
    completionRate,
    actualSessions,
    totalMinutes: Math.round(totalMinutes),
    trainingLoad,
    liftingVolume,
    runKm,
    conditioningFeet,
    poolLaps,
    recoveryMinutes: Math.round(recoveryMinutes),
    hardDays: hardDates.size,
    todayRecommendation,
    tomorrowRecommendation,
    balanceAlerts,
    missedSessions: days.filter((item) => item.state === "missed").map(missedAdvice),
    nextWeekSuggestions,
  };
}
