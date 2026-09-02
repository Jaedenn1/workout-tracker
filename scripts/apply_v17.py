from pathlib import Path


def replace_once(path: str, old: str, new: str) -> None:
    file = Path(path)
    text = file.read_text()
    if old not in text:
        raise SystemExit(f"Expected text not found in {path}: {old[:120]!r}")
    file.write_text(text.replace(old, new, 1))


Path("src/lib/adaptiveTraining.ts").write_text(r'''import type { HybridSession } from "./hybridSessions";
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
''')

Path("src/components/AdaptiveCoach.tsx").write_text(r'''"use client";

import { useEffect, useMemo, useState } from "react";
import { buildAdaptiveWeek } from "../lib/adaptiveTraining";
import { readHybridSessions, type HybridSession } from "../lib/hybridSessions";
import { HISTORY_KEY, READINESS_KEY, safeArray, type ReadinessRecord, type WorkoutHistoryItem } from "../lib/trainingIntelligence";
import { WEEKLY_PLAN_KEY, defaultWeeklyPlan, normalizeWeeklyPlan, type WeeklyPlanDay } from "../lib/weeklyPlan";

function readPlan() {
  try { return normalizeWeeklyPlan(JSON.parse(localStorage.getItem(WEEKLY_PLAN_KEY) ?? "null")); }
  catch { return defaultWeeklyPlan; }
}

function statusLabel(state: string) {
  if (state === "complete") return "Done";
  if (state === "missed") return "Missed";
  if (state === "today") return "Today";
  if (state === "rest") return "Rest";
  return "Upcoming";
}

export default function AdaptiveCoach() {
  const [history, setHistory] = useState<WorkoutHistoryItem[]>([]);
  const [hybrid, setHybrid] = useState<HybridSession[]>([]);
  const [readiness, setReadiness] = useState<ReadinessRecord[]>([]);
  const [plan, setPlan] = useState<WeeklyPlanDay[]>(defaultWeeklyPlan);

  useEffect(() => {
    const refresh = () => {
      setHistory(safeArray<WorkoutHistoryItem>(localStorage.getItem(HISTORY_KEY)));
      setHybrid(readHybridSessions());
      setReadiness(safeArray<ReadinessRecord>(localStorage.getItem(READINESS_KEY)));
      setPlan(readPlan());
    };
    refresh();
    window.addEventListener("workout-tracker:hybrid-session", refresh);
    window.addEventListener("workout-tracker:weekly-plan", refresh);
    window.addEventListener("storage", refresh);
    return () => {
      window.removeEventListener("workout-tracker:hybrid-session", refresh);
      window.removeEventListener("workout-tracker:weekly-plan", refresh);
      window.removeEventListener("storage", refresh);
    };
  }, []);

  const snapshot = useMemo(() => buildAdaptiveWeek(history, hybrid, plan, readiness), [history, hybrid, plan, readiness]);
  const completion = snapshot.completionRate == null ? "—" : `${snapshot.completionRate}%`;

  return (
    <main className="ac-shell">
      <header className="ac-topbar">
        <div><p className="ti-eyebrow">ADAPTIVE COACH · V1.7</p><h1>Weekly Intelligence</h1><p>Recommendations are derived from what you actually did. Nothing changes your plan unless you choose to edit it.</p></div>
        <div className="ac-top-actions"><a className="ti-secondary" href="/plan">Weekly plan</a><a className="ti-secondary" href="/">Today</a></div>
      </header>

      <section className={`ac-recommend ac-${snapshot.todayRecommendation.signal}`}>
        <div><span>Today's call · {snapshot.todayRecommendation.signal}</span><h2>{snapshot.todayRecommendation.label}</h2><p>{snapshot.todayRecommendation.reason}</p></div>
        <strong>{snapshot.todayRecommendation.detail}</strong>
      </section>

      <section className="ac-kpis">
        <div><span>Plan-to-date</span><strong>{completion}</strong><small>{snapshot.completedPlannedSessions}/{snapshot.dueSessions} due sessions</small></div>
        <div><span>Training load</span><strong>{snapshot.trainingLoad.toLocaleString()}</strong><small>session-RPE points*</small></div>
        <div><span>Training time</span><strong>{snapshot.totalMinutes}</strong><small>minutes this week</small></div>
        <div><span>Sessions</span><strong>{snapshot.actualSessions}</strong><small>{snapshot.hardDays} high-load days</small></div>
      </section>

      <section className="ac-card">
        <div className="ac-heading"><div><p className="ti-eyebrow">THIS WEEK</p><h2>Plan vs. reality</h2></div><span>{snapshot.weekStart} → {snapshot.weekEnd}</span></div>
        <div className="ac-week-grid">
          {snapshot.days.map((day) => <div className={`ac-day ac-day-${day.state}`} key={day.date}><span>{day.shortDay}</span><strong>{day.title}</strong><small>{day.kind} · {statusLabel(day.state)}</small>{day.durationMinutes > 0 && <em>{day.durationMinutes} min · {day.load} load</em>}</div>)}
        </div>
      </section>

      <section className="ac-two-col">
        <article className="ac-card">
          <p className="ti-eyebrow">TOMORROW</p>
          <h2>{snapshot.tomorrowRecommendation.label}</h2>
          <p>{snapshot.tomorrowRecommendation.reason}</p>
          <strong className={`ac-pill ac-pill-${snapshot.tomorrowRecommendation.signal}`}>{snapshot.tomorrowRecommendation.signal}</strong>
          <small>{snapshot.tomorrowRecommendation.detail}</small>
        </article>
        <article className="ac-card">
          <p className="ti-eyebrow">WEEKLY RECAP</p>
          <h2>What accumulated</h2>
          <div className="ac-recap">
            <span><b>{snapshot.liftingVolume.toLocaleString()}</b> lb lifting volume</span>
            <span><b>{snapshot.runKm.toFixed(1)}</b> km running</span>
            <span><b>{Math.round(snapshot.conditioningFeet).toLocaleString()}</b> ft conditioning</span>
            <span><b>{Math.round(snapshot.poolLaps)}</b> pool laps</span>
            <span><b>{snapshot.recoveryMinutes}</b> recovery min</span>
          </div>
        </article>
      </section>

      <section className="ac-card">
        <div className="ac-heading"><div><p className="ti-eyebrow">BALANCE CHECK</p><h2>Load & structure flags</h2></div></div>
        {snapshot.balanceAlerts.length ? <div className="ac-alerts">{snapshot.balanceAlerts.map((item) => <p key={item}>⚠ {item}</p>)}</div> : <p className="ac-good">No major balance flags detected from the current week.</p>}
      </section>

      <section className="ac-card">
        <div className="ac-heading"><div><p className="ti-eyebrow">MISSED SESSIONS</p><h2>Handle them without panic-stacking</h2></div><a href="/plan">Edit week →</a></div>
        {snapshot.missedSessions.length ? <div className="ac-missed-list">{snapshot.missedSessions.map((item) => <article key={`${item.date}-${item.kind}`}><span>{item.day} · {item.kind}</span><h3>{item.title}</h3><p>{item.bestCall}</p><div>{item.options.map((option) => <small key={option}>{option}</small>)}</div></article>)}</div> : <p className="ac-good">No missed planned sessions so far this week.</p>}
      </section>

      <section className="ac-card">
        <div className="ac-heading"><div><p className="ti-eyebrow">NEXT WEEK</p><h2>Suggested adjustments</h2></div><span>Suggestions only</span></div>
        <ol className="ac-suggestions">{snapshot.nextWeekSuggestions.map((item) => <li key={item}>{item}</li>)}</ol>
        <a className="ti-primary ac-edit-plan" href="/plan">Review weekly plan</a>
      </section>

      <p className="ac-footnote">* Hybrid load = session duration × reported RPE. Lifting load uses duration × an estimated session effort from average RIR when available; it is a coaching heuristic, not a medical or physiological measurement.</p>
    </main>
  );
}
''')

Path("app/coach").mkdir(parents=True, exist_ok=True)
Path("app/coach/page.tsx").write_text('''import AdaptiveCoach from "../../src/components/AdaptiveCoach";\n\nexport default function CoachPage() { return <AdaptiveCoach />; }\n''')

Path("app/v22.css").write_text(r'''.ac-shell{max-width:1180px;margin:0 auto;padding:28px 20px 120px}.ac-topbar{display:flex;justify-content:space-between;gap:24px;align-items:flex-start;margin-bottom:22px}.ac-topbar h1{margin:4px 0 8px;font-size:clamp(32px,5vw,58px);line-height:.95}.ac-topbar p{max-width:720px;color:var(--muted,#9a9a9a)}.ac-top-actions,.ti-top-actions{display:flex;gap:8px;flex-wrap:wrap}.ac-recommend{display:grid;grid-template-columns:1.25fr .75fr;gap:24px;padding:24px;border:1px solid #2b2b2b;border-radius:24px;background:linear-gradient(145deg,#171717,#0b0b0b);box-shadow:0 18px 45px rgba(0,0,0,.3);margin-bottom:18px}.ac-recommend span{text-transform:uppercase;letter-spacing:.13em;font-size:12px;color:#a7a7a7}.ac-recommend h2{font-size:clamp(28px,4vw,44px);margin:8px 0}.ac-recommend p{margin:0;color:#aaa}.ac-recommend>strong{align-self:end;font-size:16px;line-height:1.55}.ac-push{border-color:#4b4b4b}.ac-reduce,.ac-recover{border-style:dashed}.ac-kpis{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-bottom:18px}.ac-kpis>div,.ac-card{border:1px solid #262626;background:#101010;border-radius:18px;padding:18px}.ac-kpis span,.ac-kpis small{display:block;color:#8f8f8f}.ac-kpis strong{display:block;font-size:28px;margin:6px 0}.ac-heading{display:flex;justify-content:space-between;gap:18px;align-items:flex-start;margin-bottom:16px}.ac-heading h2,.ac-card h2{margin:3px 0 8px}.ac-heading>span{color:#8f8f8f;font-size:13px}.ac-week-grid{display:grid;grid-template-columns:repeat(7,1fr);gap:8px}.ac-day{min-height:128px;border:1px solid #292929;border-radius:14px;padding:13px;display:flex;flex-direction:column;gap:7px}.ac-day>span{font-size:11px;letter-spacing:.12em;color:#888}.ac-day>strong{font-size:15px}.ac-day>small{color:#999;text-transform:capitalize}.ac-day>em{margin-top:auto;font-style:normal;font-size:11px;color:#bbb}.ac-day-complete{border-color:#505050;background:#171717}.ac-day-missed{border-style:dashed;opacity:.72}.ac-day-today{outline:1px solid #777;outline-offset:2px}.ac-day-rest{opacity:.65}.ac-two-col{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin:12px 0}.ac-pill{display:inline-flex;text-transform:uppercase;letter-spacing:.1em;border:1px solid #3b3b3b;border-radius:999px;padding:7px 11px;margin:7px 0 12px;font-size:11px}.ac-card>small{display:block;color:#aaa;line-height:1.55}.ac-recap{display:grid;grid-template-columns:repeat(2,1fr);gap:8px}.ac-recap span{padding:11px;border:1px solid #252525;border-radius:12px;color:#aaa}.ac-recap b{color:#fff}.ac-alerts{display:grid;gap:8px}.ac-alerts p{margin:0;padding:12px 14px;border:1px dashed #393939;border-radius:12px}.ac-good{color:#aaa;margin:0}.ac-missed-list{display:grid;grid-template-columns:repeat(2,1fr);gap:10px}.ac-missed-list article{border:1px solid #282828;border-radius:14px;padding:15px}.ac-missed-list article>span{font-size:11px;text-transform:uppercase;letter-spacing:.1em;color:#888}.ac-missed-list h3{margin:6px 0}.ac-missed-list article>div{display:grid;gap:5px}.ac-missed-list small{padding:8px 9px;background:#151515;border-radius:8px;color:#aaa}.ac-suggestions{display:grid;gap:10px;padding-left:22px;color:#d2d2d2}.ac-edit-plan{display:inline-flex;margin-top:8px}.ac-footnote{font-size:11px;color:#777;line-height:1.5;margin-top:14px}.ti-coach-strip{display:grid;grid-template-columns:auto 1fr auto;align-items:center;gap:14px;text-decoration:none;border:1px solid #303030;border-radius:16px;padding:14px 16px;margin:12px 0;background:#111;color:inherit}.ti-coach-strip span{font-size:11px;letter-spacing:.1em;text-transform:uppercase;color:#8f8f8f}.ti-coach-strip strong{font-size:16px}.ti-coach-strip small{color:#999;text-align:right;max-width:360px}@media(max-width:800px){.ac-topbar,.ac-recommend{grid-template-columns:1fr;display:grid}.ac-kpis{grid-template-columns:repeat(2,1fr)}.ac-week-grid{grid-template-columns:repeat(2,1fr)}.ac-two-col,.ac-missed-list{grid-template-columns:1fr}.ti-coach-strip{grid-template-columns:1fr}.ti-coach-strip small{text-align:left;max-width:none}}@media(max-width:480px){.ac-shell{padding:20px 12px 105px}.ac-kpis{grid-template-columns:1fr 1fr}.ac-week-grid{grid-template-columns:1fr}.ac-recap{grid-template-columns:1fr}}
''')

replace_once("app/layout.tsx", 'import "./v21.css";\n', 'import "./v21.css";\nimport "./v22.css";\n')

replace_once(
    "src/components/TodayDashboard.tsx",
    'import { useEffect, useMemo, useState } from "react";\n',
    'import { useEffect, useMemo, useState } from "react";\nimport { buildAdaptiveWeek } from "../lib/adaptiveTraining";\nimport { readHybridSessions, type HybridSession } from "../lib/hybridSessions";\n',
)
replace_once(
    "src/components/TodayDashboard.tsx",
    '  const [weeklyPlan, setWeeklyPlan] = useState<WeeklyPlanDay[]>(defaultWeeklyPlan);\n',
    '  const [weeklyPlan, setWeeklyPlan] = useState<WeeklyPlanDay[]>(defaultWeeklyPlan);\n  const [hybridSessions, setHybridSessions] = useState<HybridSession[]>([]);\n',
)
replace_once(
    "src/components/TodayDashboard.tsx",
    '    setWeeklyPlan(readWeeklyPlan());\n\n    const onPlanChange = () => setWeeklyPlan(readWeeklyPlan());\n    window.addEventListener("workout-tracker:weekly-plan", onPlanChange);\n    return () => window.removeEventListener("workout-tracker:weekly-plan", onPlanChange);\n',
    '    setWeeklyPlan(readWeeklyPlan());\n    setHybridSessions(readHybridSessions());\n\n    const onPlanChange = () => setWeeklyPlan(readWeeklyPlan());\n    const onHybridChange = () => setHybridSessions(readHybridSessions());\n    window.addEventListener("workout-tracker:weekly-plan", onPlanChange);\n    window.addEventListener("workout-tracker:hybrid-session", onHybridChange);\n    return () => {\n      window.removeEventListener("workout-tracker:weekly-plan", onPlanChange);\n      window.removeEventListener("workout-tracker:hybrid-session", onHybridChange);\n    };\n',
)
replace_once(
    "src/components/TodayDashboard.tsx",
    '  const todayPlanAction = planAction(todayPlan);\n',
    '  const todayPlanAction = planAction(todayPlan);\n  const adaptiveWeek = useMemo(() => buildAdaptiveWeek(history, hybridSessions, weeklyPlan, readiness), [history, hybridSessions, weeklyPlan, readiness]);\n',
)
replace_once("src/components/TodayDashboard.tsx", 'TODAY · V1.6', 'TODAY · V1.7')
replace_once(
    "src/components/TodayDashboard.tsx",
    '        <a className="ti-icon-link" href="/plan">Weekly plan</a>\n',
    '        <div className="ti-top-actions"><a className="ti-icon-link" href="/coach">Coach</a><a className="ti-icon-link" href="/plan">Weekly plan</a></div>\n',
)
replace_once(
    "src/components/TodayDashboard.tsx",
    '      <section className="ti-readiness-card">\n',
    '      <a className="ti-coach-strip" href="/coach"><span>Adaptive coach · {adaptiveWeek.todayRecommendation.signal}</span><strong>{adaptiveWeek.todayRecommendation.label}</strong><small>{adaptiveWeek.todayRecommendation.reason}</small></a>\n\n      <section className="ti-readiness-card">\n',
)
replace_once(
    "src/components/TodayDashboard.tsx",
    '<a className="ti-card ti-click-card" href="/plan"><span>Weekly plan</span><strong>{todayPlan.title}</strong><small>{todayPlan.shortDay} · {todayPlan.kind} →</small></a>',
    '<a className="ti-card ti-click-card" href="/coach"><span>Adaptive coach</span><strong>{adaptiveWeek.todayRecommendation.label}</strong><small>{adaptiveWeek.completionRate == null ? "Week intelligence ready" : `${adaptiveWeek.completionRate}% plan-to-date`} →</small></a>\n        <a className="ti-card ti-click-card" href="/plan"><span>Weekly plan</span><strong>{todayPlan.title}</strong><small>{todayPlan.shortDay} · {todayPlan.kind} →</small></a>',
)
replace_once(
    "src/components/TodayDashboard.tsx",
    '<a href="/gym">⚡ Gym</a><a href="/session">◎ Track</a><a href="/plan">▦ Week</a>',
    '<a href="/gym">⚡ Gym</a><a href="/session">◎ Track</a><a href="/coach">◈ Coach</a><a href="/plan">▦ Week</a>',
)

replace_once("src/components/WeeklyPlan.tsx", 'WEEKLY PLAN · V1.6', 'WEEKLY PLAN · V1.7')
replace_once(
    "src/components/WeeklyPlan.tsx",
    '        <a className="ti-secondary" href="/">Today</a>\n',
    '        <div className="ac-top-actions"><a className="ti-secondary" href="/coach">Adaptive coach</a><a className="ti-secondary" href="/">Today</a></div>\n',
)
replace_once(
    "src/components/WeeklyPlan.tsx",
    '        <a href="/history">All training history →</a>\n',
    '        <div className="ac-top-actions"><a href="/coach">Weekly intelligence →</a><a href="/history">All training history →</a></div>\n',
)

replace_once("public/sw.js", 'const CACHE = "workout-tracker-v1.6.1-stability";', 'const CACHE = "workout-tracker-v1.7-adaptive-intelligence";')
replace_once(
    "public/sw.js",
    '"/watch", "/plan", "/session"]',
    '"/watch", "/plan", "/session", "/coach"]',
)

replace_once("package.json", '"version": "1.6.1"', '"version": "1.7.0"')
replace_once("package-lock.json", '"version": "1.6.1"', '"version": "1.7.0"')
replace_once("package-lock.json", '"version": "1.6.1"', '"version": "1.7.0"')
replace_once("src/lib/database.ts", '  appVersion: "1.6.1";', '  appVersion: "1.7.0";')
replace_once("src/lib/database.ts", '    appVersion: "1.6.1",', '    appVersion: "1.7.0",')

print("v1.7 adaptive weekly intelligence patch applied")
