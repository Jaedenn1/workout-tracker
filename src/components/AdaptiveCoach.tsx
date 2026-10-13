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
import {
  Badge,
  Button,
  Card,
  PageHeader,
  PageShell,
  ProgressBar,
  SectionHeader,
  SegmentedControl,
  Stat,
  StatGrid,
  type BadgeTone,
  type StatTone,
} from "../ui";

const ROUTINES_KEY = "workout-tracker:v0.4:routines";

function readPlan() { try { return normalizeWeeklyPlan(JSON.parse(localStorage.getItem(WEEKLY_PLAN_KEY) ?? "null")); } catch { return defaultWeeklyPlan; } }
function readRoutines() { try { const parsed = JSON.parse(localStorage.getItem(ROUTINES_KEY) ?? "null"); return Array.isArray(parsed) && parsed.length ? parsed as RoutineDefinition[] : defaultRoutines; } catch { return defaultRoutines; } }
function statusLabel(state: string) { if (state === "complete") return "Done"; if (state === "partial") return "Partial"; if (state === "missed") return "Missed"; if (state === "today") return "Today"; if (state === "rest") return "Rest"; return "Upcoming"; }
function deltaLabel(value: number | null) { if (value == null) return "Calibrating"; return `${value >= 0 ? "+" : ""}${Math.round(value)}%`; }
function ratioLabel(value: number | null) { return value == null ? "—" : `${value.toFixed(2)}×`; }
function signalTone(signal: string): BadgeTone {
  if (signal === "push") return "volt";
  if (signal === "maintain") return "blue";
  if (signal === "reduce") return "amber";
  if (signal === "recover") return "red";
  return "neutral";
}
function dayStateTone(state: string): BadgeTone {
  if (state === "complete") return "mint";
  if (state === "partial") return "amber";
  if (state === "missed") return "red";
  if (state === "today") return "volt";
  if (state === "rest") return "blue";
  return "neutral";
}
function trendTone(trend: string): StatTone {
  if (trend === "spike") return "red";
  if (trend === "elevated") return "amber";
  if (trend === "steady") return "blue";
  if (trend === "low") return "mint";
  return "default";
}

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

  const go = (href: string) => { window.location.href = href; };

  return (
    <PageShell>
      <div className="ds-rise">
        <PageHeader
          eyebrow="Advanced intelligence · v1.8"
          eyebrowVolt
          title={<>Adaptive <span className="ds-accent">Coach</span></>}
          lede="7/28-day workload, modality stress, muscle fatigue, recovery trend, intensity drift, and your feedback refine the coaching call. Your plan is never rewritten automatically."
          action={
            <div className="ds-cluster">
              <Button variant="ghost" size="sm" onClick={() => go("/plan")}>Weekly plan</Button>
              <Button variant="ghost" size="sm" onClick={() => go("/")}>Today</Button>
            </div>
          }
        />
      </div>

      <Card glow className="ds-rise ds-rise--1">
        <div className="ds-stack">
          <div className="ds-cluster" style={{ justifyContent: "space-between" }}>
            <Badge tone={signalTone(todayRecommendation.signal)} dot>Today's call · {todayRecommendation.signal}</Badge>
          </div>
          <div>
            <h2 className="ds-section-title" style={{ fontSize: "1.6rem" }}>{todayRecommendation.label}</h2>
            <p className="ds-muted" style={{ margin: "6px 0 0" }}>{todayRecommendation.reason}</p>
          </div>
          <div className="ds-stack" style={{ gap: 4 }}>
            <p className="ds-muted" style={{ margin: 0, color: "var(--ds-text-1)", fontWeight: 700 }}>{todayRecommendation.detail}</p>
            <span className="ds-muted" style={{ fontSize: "0.78rem" }}>Confidence: {todayRecommendation.confidence}</span>
          </div>
        </div>
      </Card>

      <Card tight className="ds-rise ds-rise--2">
        <details>
          <summary className="ds-muted" style={{ cursor: "pointer", fontWeight: 800 }}>Why this recommendation?</summary>
          <div className="ds-stack" style={{ marginTop: 10, gap: 8 }}>
            {todayRecommendation.factors.map((factor, index) => <p className="ds-muted" style={{ margin: 0 }} key={`${factor}-${index}`}>{factor}</p>)}
          </div>
        </details>
      </Card>

      <Card className="ds-rise ds-rise--2">
        <SectionHeader eyebrow="Coach feedback" title="How did this dose feel?" />
        <p className="ds-muted" style={{ margin: "8px 0 0" }}>Your recent ratings can nudge future recommendations more or less conservative. They never override strong fatigue signals.</p>
        <div style={{ marginTop: 12 }}>
          <SegmentedControl
            label="How did this dose feel?"
            options={[{ value: "too_easy", label: "Too easy" }, { value: "right", label: "About right" }, { value: "too_hard", label: "Too hard" }] as const}
            value={todayFeedback?.rating ?? "right"}
            onChange={(value) => rateRecommendation(value)}
          />
        </div>
        <p className="ds-muted" style={{ margin: "10px 0 0", fontSize: "0.8rem" }}>{advanced.feedbackLabel} · {advanced.feedbackCount}/8 recent ratings used</p>
      </Card>

      <div className="ds-rise ds-rise--3">
        <StatGrid cols={4}>
          <Stat label="7-day load" value={advanced.acuteLoad7.toLocaleString()} sub="weighted coaching load" />
          <Stat label="28-day weekly avg" value={advanced.chronicWeeklyLoad28.toLocaleString()} sub={`${advanced.historyDays} days of usable history`} />
          <Stat label="7 / 28 ratio" value={ratioLabel(advanced.loadRatio)} sub={advanced.loadTrend} />
          <Stat
            label="Recovery debt"
            value={advanced.recoveryDebtScore}
            tone={advanced.deloadSuggested ? "red" : "default"}
            sub={`${advanced.recoveryDebtLabel} · ${advanced.readinessDaysLogged}/7 check-ins`}
          />
        </StatGrid>
      </div>

      {advanced.deloadSuggested && (
        <Card glow className="ds-rise ds-rise--3">
          <div className="ds-stack">
            <Badge tone="amber">Deload signal</Badge>
            <h2 className="ds-section-title" style={{ fontSize: "1.3rem" }}>Consider a temporary reduction</h2>
            <p className="ds-muted" style={{ margin: 0 }}>{advanced.deloadReason}</p>
            <p className="ds-muted" style={{ margin: 0 }}><strong style={{ color: "var(--ds-text-1)" }}>Suggestion only — reduce stress, then reassess. The app does not modify your schedule.</strong></p>
          </div>
        </Card>
      )}

      <Card className="ds-rise ds-rise--3">
        <SectionHeader eyebrow="Modality stress" title="Not all load is the same" action={<span className="ds-muted" style={{ fontSize: "0.78rem" }}>7 days vs 28-day weekly average</span>} />
        <div style={{ marginTop: 12 }}>
          <StatGrid cols={4}>
            {advanced.modalityStress.map((item) => (
              <Stat
                key={item.kind}
                label={item.kind}
                value={item.load7.toLocaleString()}
                tone={trendTone(item.trend)}
                sub={`${item.weekly28.toLocaleString()} baseline · ${ratioLabel(item.ratio)} · ${item.trend}`}
              />
            ))}
          </StatGrid>
        </div>
      </Card>

      <div className="ds-grid-2 ds-rise ds-rise--4">
        <Card>
          <SectionHeader
            eyebrow="Muscle fatigue"
            title="Recent lifting overlap"
            action={<span className="ds-muted" style={{ fontSize: "0.78rem" }}>{advanced.plannedMuscleOverlap == null ? "No routine target" : `${advanced.plannedMuscleOverlap}/100 overlap`}</span>}
          />
          <div style={{ marginTop: 12 }}>
            {advanced.muscleFatigue.length ? (
              <div className="ds-stack">
                {advanced.muscleFatigue.slice(0, 7).map((item) => (
                  <div key={item.muscle}>
                    <div className="ds-cluster" style={{ justifyContent: "space-between", marginBottom: 6 }}>
                      <span><b>{item.muscle}</b> <span className="ds-muted" style={{ fontSize: "0.78rem" }}>{item.rawLoad} weighted load</span></span>
                      <strong className="ds-tnum">{item.score}</strong>
                    </div>
                    <ProgressBar value={item.score / 100} label={`${item.muscle} fatigue`} />
                  </div>
                ))}
              </div>
            ) : (
              <p className="ds-muted" style={{ margin: 0 }}>Log lifting sessions to build a muscle-fatigue map.</p>
            )}
            {advanced.overlapMuscles.length > 0 && (
              <div className="ds-cluster" style={{ marginTop: 12 }}>
                <Badge tone="amber">High planned overlap</Badge>
                <span className="ds-muted" style={{ fontSize: "0.8rem" }}>{advanced.overlapMuscles.join(", ")}</span>
              </div>
            )}
          </div>
        </Card>

        <Card>
          <SectionHeader eyebrow="Intensity drift" title="Did training land as planned?" />
          <div style={{ marginTop: 12 }}>
            <div className="ds-stat__label">Average RPE vs plan</div>
            <div className="ds-stat__value ds-tnum" style={{ fontSize: "2.2rem" }}>
              {advanced.intensityDrift == null ? "—" : `${advanced.intensityDrift >= 0 ? "+" : ""}${advanced.intensityDrift.toFixed(1)}`}
            </div>
            <div style={{ marginTop: 12 }}>
              <StatGrid cols={3}>
                <Stat label="Hard" value={advanced.unexpectedlyHardSessions} sub="unexpectedly hard" />
                <Stat label="Easy" value={advanced.unexpectedlyEasySessions} sub="unexpectedly easy" />
                <Stat label="Low readiness" value={advanced.lowReadinessStreak} sub="streak" />
              </StatGrid>
            </div>
          </div>
        </Card>
      </div>

      <Card className="ds-rise ds-rise--4">
        <SectionHeader eyebrow="Session mix" title="What kind of stress accumulated" action={<span className="ds-muted" style={{ fontSize: "0.78rem" }}>last 7 days</span>} />
        <div style={{ marginTop: 12 }}>
          {advanced.sessionClasses.length ? (
            <div className="ds-cluster">
              {advanced.sessionClasses.map((item) => <Badge key={item.label}>{item.label} ×{item.count}</Badge>)}
            </div>
          ) : (
            <p className="ds-muted" style={{ margin: 0 }}>No classified sessions in the last seven days yet.</p>
          )}
        </div>
      </Card>

      <Card className="ds-rise ds-rise--4">
        <SectionHeader eyebrow="This week" title="Plan vs. actual dose" action={<span className="ds-muted" style={{ fontSize: "0.78rem" }}>{snapshot.weekStart} → {snapshot.weekEnd}</span>} />
        <div style={{ display: "grid", gap: 10, gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", marginTop: 12 }}>
          {snapshot.days.map((day) => (
            <Card tight key={day.date}>
              <div className="ds-cluster" style={{ justifyContent: "space-between" }}>
                <span className="ds-stat__label" style={{ marginBottom: 0 }}>{day.shortDay}</span>
                <Badge tone={dayStateTone(day.state)} dot={day.state === "today"}>{statusLabel(day.state)}</Badge>
              </div>
              <h3 className="ds-section-title" style={{ fontSize: "1rem", marginTop: 8 }}>{day.title}</h3>
              <p className="ds-muted" style={{ margin: "4px 0 0", fontSize: "0.78rem" }}>{day.kind}</p>
              {day.kind !== "rest" && (
                <div className="ds-stack" style={{ gap: 4, marginTop: 8 }}>
                  <span className="ds-muted" style={{ fontSize: "0.78rem" }}><b className="ds-tnum">{day.completionScore}%</b> planned dose</span>
                  <span className="ds-muted" style={{ fontSize: "0.78rem" }}>{day.matchLabel}</span>
                  <span className="ds-muted ds-tnum" style={{ fontSize: "0.78rem" }}>{day.durationMinutes || 0}/{day.targetDurationMinutes ?? "—"} min · RPE {day.actualRpe?.toFixed(1) ?? "—"}/{day.targetRpe ?? "—"}</span>
                  {day.doseRatio != null && <span className="ds-muted ds-tnum" style={{ fontSize: "0.78rem" }}>{Math.round(day.doseRatio * 100)}% actual/target load</span>}
                </div>
              )}
            </Card>
          ))}
        </div>
      </Card>

      <div className="ds-rise ds-rise--4">
        <StatGrid cols={4}>
          <Stat label="Dose completion" value={completion} sub={`${snapshot.completedPlannedSessions}/${snapshot.dueSessions} sessions ≥80%`} />
          <Stat label="This-week load" value={snapshot.trainingLoad.toLocaleString()} sub="raw session-RPE points*" />
          <Stat label="Same-point baseline" value={snapshot.baselineLoad?.toLocaleString() ?? "—"} sub={`${snapshot.calibrationWeeks}/4 prior weeks`} />
          <Stat label="Vs same-point" value={deltaLabel(snapshot.loadDeltaPct)} sub={`${snapshot.confidence} confidence`} />
        </StatGrid>
      </div>

      <div className="ds-grid-2 ds-rise ds-rise--4">
        <Card>
          <SectionHeader eyebrow="Tomorrow" title={tomorrowRecommendation.label} />
          <p className="ds-muted" style={{ margin: "8px 0 0" }}>{tomorrowRecommendation.reason}</p>
          <div style={{ marginTop: 10 }} className="ds-stack">
            <div><Badge tone={signalTone(tomorrowRecommendation.signal)}>{tomorrowRecommendation.signal}</Badge></div>
            <span className="ds-muted" style={{ fontSize: "0.85rem" }}>{tomorrowRecommendation.detail}</span>
            <span className="ds-muted" style={{ fontSize: "0.78rem" }}>Confidence: {tomorrowRecommendation.confidence}</span>
          </div>
        </Card>
        <Card>
          <SectionHeader eyebrow="Weekly recap" title="What accumulated" />
          <div style={{ marginTop: 12 }}>
            <StatGrid cols={2}>
              <Stat label="Total minutes" value={snapshot.totalMinutes} />
              <Stat label="Lifting volume" value={`${snapshot.liftingVolume.toLocaleString()} lb`} />
              <Stat label="Running" value={`${snapshot.runKm.toFixed(1)} km`} />
              <Stat label="Conditioning" value={`${Math.round(snapshot.conditioningFeet).toLocaleString()} ft`} />
              <Stat label="Pool" value={`${Math.round(snapshot.poolLaps)} laps`} />
              <Stat label="Recovery" value={`${snapshot.recoveryMinutes} min`} />
            </StatGrid>
          </div>
        </Card>
      </div>

      <Card className="ds-rise ds-rise--4">
        <SectionHeader eyebrow="Balance check" title="Load & structure flags" />
        <div style={{ marginTop: 12 }}>
          {snapshot.balanceAlerts.length ? (
            <div className="ds-stack" style={{ gap: 8 }}>
              {snapshot.balanceAlerts.map((item) => <p className="ds-muted" style={{ margin: 0 }} key={item}>⚠ {item}</p>)}
            </div>
          ) : (
            <p className="ds-muted" style={{ margin: 0 }}>No major balance flags detected from the current week.</p>
          )}
        </div>
      </Card>

      <Card className="ds-rise ds-rise--4">
        <SectionHeader eyebrow="Missed sessions" title="Handle them without panic-stacking" action={<Button variant="ghost" size="sm" onClick={() => go("/plan")}>Edit week →</Button>} />
        <div style={{ marginTop: 12 }}>
          {snapshot.missedSessions.length ? (
            <div className="ds-stack">
              {snapshot.missedSessions.map((item) => (
                <Card tight key={`${item.date}-${item.kind}`}>
                  <div className="ds-field__label">{item.day} · {item.kind}</div>
                  <h3 className="ds-section-title" style={{ fontSize: "1.05rem", marginTop: 6 }}>{item.title}</h3>
                  <p className="ds-muted" style={{ margin: "6px 0 0" }}>{item.bestCall}</p>
                  <div className="ds-cluster" style={{ marginTop: 8 }}>
                    {item.options.map((option) => <Badge key={option}>{option}</Badge>)}
                  </div>
                </Card>
              ))}
            </div>
          ) : (
            <p className="ds-muted" style={{ margin: 0 }}>No fully missed planned sessions so far this week.</p>
          )}
        </div>
      </Card>

      <Card className="ds-rise ds-rise--4">
        <SectionHeader eyebrow="Next week" title="Suggested adjustments" action={<span className="ds-muted" style={{ fontSize: "0.78rem" }}>Suggestions only</span>} />
        <ol className="ds-muted" style={{ margin: "12px 0 0", paddingLeft: 20, display: "flex", flexDirection: "column", gap: 8 }}>
          {snapshot.nextWeekSuggestions.map((item) => <li key={item}>{item}</li>)}
        </ol>
        <div style={{ marginTop: 14 }}>
          <Button variant="secondary" onClick={() => go("/plan")}>Review weekly plan</Button>
        </div>
      </Card>

      <p className="ds-muted ds-rise ds-rise--4" style={{ fontSize: "0.8rem" }}>* v1.8 uses coaching heuristics, not medical measurements. The 7/28 model compares weighted seven-day training load with one quarter of the previous 28-day load. Pool and recovery work are down-weighted so they do not count like hard lifting, running, or conditioning. Muscle fatigue uses recency-weighted lifting exposure; recovery debt uses your logged sleep, energy, and soreness.</p>
    </PageShell>
  );
}
