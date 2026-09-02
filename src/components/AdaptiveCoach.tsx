"use client";

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
