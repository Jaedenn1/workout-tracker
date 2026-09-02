"use client";

import { useEffect, useMemo, useState } from "react";
import { defaultRoutines, type RoutineDefinition } from "../data/training";
import { buildAdaptiveWeek } from "../lib/adaptiveTraining";
import {
  buildAdvancedIntelligence,
  readCoachFeedback,
  refineRecommendation,
  saveCoachFeedback,
  type CoachFeedback,
  type CoachFeedbackRating,
} from "../lib/advancedTrainingIntelligence";
import { readHybridSessions, type HybridSession } from "../lib/hybridSessions";
import { HISTORY_KEY, READINESS_KEY, localDay, safeArray, type ReadinessRecord, type WorkoutHistoryItem } from "../lib/trainingIntelligence";
import { WEEKLY_PLAN_KEY, defaultWeeklyPlan, normalizeWeeklyPlan, todayPlanIndex, type WeeklyPlanDay } from "../lib/weeklyPlan";

const ROUTINES_KEY = "workout-tracker:v0.4:routines";

function readPlan() { try { return normalizeWeeklyPlan(JSON.parse(localStorage.getItem(WEEKLY_PLAN_KEY) ?? "null")); } catch { return defaultWeeklyPlan; } }
function readRoutines() { try { const parsed = JSON.parse(localStorage.getItem(ROUTINES_KEY) ?? "null"); return Array.isArray(parsed) && parsed.length ? parsed as RoutineDefinition[] : defaultRoutines; } catch { return defaultRoutines; } }
function statusLabel(state: string) { if (state === "complete") return "Done"; if (state === "partial") return "Partial"; if (state === "missed") return "Missed"; if (state === "today") return "Today"; if (state === "rest") return "Rest"; return "Upcoming"; }
function deltaLabel(value: number | null) { if (value == null) return "Calibrating"; return `${value >= 0 ? "+" : ""}${Math.round(value)}%`; }
function ratioLabel(value: number | null) { return value == null ? "—" : `${value.toFixed(2)}×`; }
function feedbackText(rating: CoachFeedbackRating) { return rating === "too_easy" ? "Too easy" : rating === "too_hard" ? "Too hard" : "About right"; }

export default function AdaptiveCoach() {
  const [history, setHistory] = useState<WorkoutHistoryItem[]>([]);
  const [hybrid, setHybrid] = useState<HybridSession[]>([]);
  const [readiness, setReadiness] = useState<ReadinessRecord[]>([]);
  const [plan, setPlan] = useState<WeeklyPlanDay[]>(defaultWeeklyPlan);
  const [routines, setRoutines] = useState<RoutineDefinition[]>(defaultRoutines);
  const [feedback, setFeedback] = useState<CoachFeedback[]>([]);

  useEffect(() => {
    const refresh = () => {
      setHistory(safeArray<WorkoutHistoryItem>(localStorage.getItem(HISTORY_KEY)));
      setHybrid(readHybridSessions());
      setReadiness(safeArray<ReadinessRecord>(localStorage.getItem(READINESS_KEY)));
      setPlan(readPlan());
      setRoutines(readRoutines());
      setFeedback(readCoachFeedback());
    };
    refresh();
    window.addEventListener("workout-tracker:hybrid-session", refresh);
    window.addEventListener("workout-tracker:weekly-plan", refresh);
    window.addEventListener("workout-tracker:coach-feedback", refresh);
    window.addEventListener("storage", refresh);
    return () => {
      window.removeEventListener("workout-tracker:hybrid-session", refresh);
      window.removeEventListener("workout-tracker:weekly-plan", refresh);
      window.removeEventListener("workout-tracker:coach-feedback", refresh);
      window.removeEventListener("storage", refresh);
    };
  }, []);

  const snapshot = useMemo(() => buildAdaptiveWeek(history, hybrid, plan, readiness), [history, hybrid, plan, readiness]);
  const advanced = useMemo(() => buildAdvancedIntelligence(history, hybrid, readiness, plan, snapshot.days, routines, feedback), [history, hybrid, readiness, plan, snapshot.days, routines, feedback]);
  const todayIndex = todayPlanIndex();
  const tomorrowIndex = Math.min(6, todayIndex + 1);
  const todayRecommendation = useMemo(() => refineRecommendation(snapshot.todayRecommendation, advanced, plan[todayIndex]?.kind ?? "rest"), [snapshot.todayRecommendation, advanced, plan, todayIndex]);
  const tomorrowRecommendation = useMemo(() => refineRecommendation(snapshot.tomorrowRecommendation, advanced, plan[tomorrowIndex]?.kind ?? "rest"), [snapshot.tomorrowRecommendation, advanced, plan, tomorrowIndex]);
  const completion = snapshot.completionRate == null ? "—" : `${snapshot.completionRate}%`;
  const todayKey = localDay(new Date());
  const todayFeedback = feedback.find((item) => item.date === todayKey) ?? null;

  function rateRecommendation(rating: CoachFeedbackRating) {
    const item: CoachFeedback = {
      id: `coach-feedback-${todayKey}`,
      createdAt: new Date().toISOString(),
      date: todayKey,
      rating,
      recommendation: todayRecommendation.label,
      signal: todayRecommendation.signal,
    };
    setFeedback(saveCoachFeedback(item));
  }

  return (
    <main className="ac-shell">
      <header className="ac-topbar"><div><p className="ti-eyebrow">ADVANCED INTELLIGENCE · V1.8</p><h1>Adaptive Coach</h1><p>7/28-day workload, modality stress, muscle fatigue, recovery trend, intensity drift, and your feedback refine the coaching call. Your plan is never rewritten automatically.</p></div><div className="ac-top-actions"><a className="ti-secondary" href="/plan">Weekly plan</a><a className="ti-secondary" href="/">Today</a></div></header>

      <section className={`ac-recommend ac-${todayRecommendation.signal}`}>
        <div><span>Today's call · {todayRecommendation.signal}</span><h2>{todayRecommendation.label}</h2><p>{todayRecommendation.reason}</p></div>
        <div className="ac-call-detail"><strong>{todayRecommendation.detail}</strong><small>Confidence: {todayRecommendation.confidence}</small></div>
      </section>
      <details className="ac-explain"><summary>Why this recommendation?</summary>{todayRecommendation.factors.map((factor, index) => <p key={`${factor}-${index}`}>{factor}</p>)}</details>

      <section className="ac-feedback">
        <div><p className="ti-eyebrow">COACH FEEDBACK</p><h2>How did this dose feel?</h2><p>Your recent ratings can nudge future recommendations more or less conservative. They never override strong fatigue signals.</p></div>
        <div className="ac-feedback-actions">
          {(["too_easy", "right", "too_hard"] as CoachFeedbackRating[]).map((rating) => <button key={rating} className={todayFeedback?.rating === rating ? "active" : ""} onClick={() => rateRecommendation(rating)}>{feedbackText(rating)}</button>)}
        </div>
        <small>{advanced.feedbackLabel} · {advanced.feedbackCount}/8 recent ratings used</small>
      </section>

      <section className="ac-kpis ac-kpis-v18">
        <div><span>7-day load</span><strong>{advanced.acuteLoad7.toLocaleString()}</strong><small>weighted coaching load</small></div>
        <div><span>28-day weekly avg</span><strong>{advanced.chronicWeeklyLoad28.toLocaleString()}</strong><small>{advanced.historyDays} days of usable history</small></div>
        <div><span>7 / 28 ratio</span><strong>{ratioLabel(advanced.loadRatio)}</strong><small>{advanced.loadTrend}</small></div>
        <div><span>Recovery debt</span><strong>{advanced.recoveryDebtScore}</strong><small>{advanced.recoveryDebtLabel} · {advanced.readinessDaysLogged}/7 check-ins</small></div>
      </section>

      {advanced.deloadSuggested && <section className="ac-deload"><div><p className="ti-eyebrow">DELOAD SIGNAL</p><h2>Consider a temporary reduction</h2></div><p>{advanced.deloadReason}</p><strong>Suggestion only — reduce stress, then reassess. The app does not modify your schedule.</strong></section>}

      <section className="ac-card">
        <div className="ac-heading"><div><p className="ti-eyebrow">MODALITY STRESS</p><h2>Not all load is the same</h2></div><span>7 days vs 28-day weekly average</span></div>
        <div className="ac-modality-grid">
          {advanced.modalityStress.map((item) => <article className={`ac-modality ac-trend-${item.trend}`} key={item.kind}><span>{item.kind}</span><strong>{item.load7.toLocaleString()}</strong><small>7d load · {item.weekly28.toLocaleString()} baseline</small><em>{ratioLabel(item.ratio)} · {item.trend}</em></article>)}
        </div>
      </section>

      <section className="ac-two-col">
        <article className="ac-card">
          <div className="ac-heading"><div><p className="ti-eyebrow">MUSCLE FATIGUE</p><h2>Recent lifting overlap</h2></div><span>{advanced.plannedMuscleOverlap == null ? "No routine target" : `${advanced.plannedMuscleOverlap}/100 overlap`}</span></div>
          {advanced.muscleFatigue.length ? <div className="ac-muscle-list">{advanced.muscleFatigue.slice(0, 7).map((item) => <div className="ac-muscle" key={item.muscle}><span><b>{item.muscle}</b><small>{item.rawLoad} weighted load</small></span><div className="ac-meter"><i style={{ width: `${item.score}%` }} /></div><strong>{item.score}</strong></div>)}</div> : <p className="ac-good">Log lifting sessions to build a muscle-fatigue map.</p>}
          {advanced.overlapMuscles.length > 0 && <p className="ac-overlap">High planned overlap: {advanced.overlapMuscles.join(", ")}</p>}
        </article>

        <article className="ac-card">
          <p className="ti-eyebrow">INTENSITY DRIFT</p><h2>Did training land as planned?</h2>
          <div className="ac-intensity-number"><strong>{advanced.intensityDrift == null ? "—" : `${advanced.intensityDrift >= 0 ? "+" : ""}${advanced.intensityDrift.toFixed(1)}`}</strong><span>average RPE vs plan</span></div>
          <div className="ac-recap"><span><b>{advanced.unexpectedlyHardSessions}</b> unexpectedly hard</span><span><b>{advanced.unexpectedlyEasySessions}</b> unexpectedly easy</span><span><b>{advanced.lowReadinessStreak}</b> low-readiness streak</span></div>
        </article>
      </section>

      <section className="ac-card">
        <div className="ac-heading"><div><p className="ti-eyebrow">SESSION MIX</p><h2>What kind of stress accumulated</h2></div><span>last 7 days</span></div>
        {advanced.sessionClasses.length ? <div className="ac-class-tags">{advanced.sessionClasses.map((item) => <span key={item.label}>{item.label}<b>×{item.count}</b></span>)}</div> : <p className="ac-good">No classified sessions in the last seven days yet.</p>}
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

      <section className="ac-kpis">
        <div><span>Dose completion</span><strong>{completion}</strong><small>{snapshot.completedPlannedSessions}/{snapshot.dueSessions} sessions ≥80%</small></div>
        <div><span>This-week load</span><strong>{snapshot.trainingLoad.toLocaleString()}</strong><small>raw session-RPE points*</small></div>
        <div><span>Same-point baseline</span><strong>{snapshot.baselineLoad?.toLocaleString() ?? "—"}</strong><small>{snapshot.calibrationWeeks}/4 prior weeks</small></div>
        <div><span>Vs same-point</span><strong>{deltaLabel(snapshot.loadDeltaPct)}</strong><small>{snapshot.confidence} confidence</small></div>
      </section>

      <section className="ac-two-col">
        <article className="ac-card"><p className="ti-eyebrow">TOMORROW</p><h2>{tomorrowRecommendation.label}</h2><p>{tomorrowRecommendation.reason}</p><strong className={`ac-pill ac-pill-${tomorrowRecommendation.signal}`}>{tomorrowRecommendation.signal}</strong><small>{tomorrowRecommendation.detail}</small><small className="ac-confidence">Confidence: {tomorrowRecommendation.confidence}</small></article>
        <article className="ac-card"><p className="ti-eyebrow">WEEKLY RECAP</p><h2>What accumulated</h2><div className="ac-recap"><span><b>{snapshot.totalMinutes}</b> total minutes</span><span><b>{snapshot.liftingVolume.toLocaleString()}</b> lb lifting volume</span><span><b>{snapshot.runKm.toFixed(1)}</b> km running</span><span><b>{Math.round(snapshot.conditioningFeet).toLocaleString()}</b> ft conditioning</span><span><b>{Math.round(snapshot.poolLaps)}</b> pool laps</span><span><b>{snapshot.recoveryMinutes}</b> recovery min</span></div></article>
      </section>

      <section className="ac-card"><div className="ac-heading"><div><p className="ti-eyebrow">BALANCE CHECK</p><h2>Load & structure flags</h2></div></div>{snapshot.balanceAlerts.length ? <div className="ac-alerts">{snapshot.balanceAlerts.map((item) => <p key={item}>⚠ {item}</p>)}</div> : <p className="ac-good">No major balance flags detected from the current week.</p>}</section>
      <section className="ac-card"><div className="ac-heading"><div><p className="ti-eyebrow">MISSED SESSIONS</p><h2>Handle them without panic-stacking</h2></div><a href="/plan">Edit week →</a></div>{snapshot.missedSessions.length ? <div className="ac-missed-list">{snapshot.missedSessions.map((item) => <article key={`${item.date}-${item.kind}`}><span>{item.day} · {item.kind}</span><h3>{item.title}</h3><p>{item.bestCall}</p><div>{item.options.map((option) => <small key={option}>{option}</small>)}</div></article>)}</div> : <p className="ac-good">No fully missed planned sessions so far this week.</p>}</section>
      <section className="ac-card"><div className="ac-heading"><div><p className="ti-eyebrow">NEXT WEEK</p><h2>Suggested adjustments</h2></div><span>Suggestions only</span></div><ol className="ac-suggestions">{snapshot.nextWeekSuggestions.map((item) => <li key={item}>{item}</li>)}</ol><a className="ti-primary ac-edit-plan" href="/plan">Review weekly plan</a></section>
      <p className="ac-footnote">* v1.8 uses coaching heuristics, not medical measurements. The 7/28 model compares weighted seven-day training load with one quarter of the previous 28-day load. Pool and recovery work are down-weighted so they do not count like hard lifting, running, or conditioning. Muscle fatigue uses recency-weighted lifting exposure; recovery debt uses your logged sleep, energy, and soreness.</p>
    </main>
  );
}
