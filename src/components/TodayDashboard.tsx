"use client";

import { useEffect, useMemo, useState } from "react";
import { buildAdaptiveWeek } from "../lib/adaptiveTraining";
import { readHybridSessions, type HybridSession } from "../lib/hybridSessions";
import { defaultRoutines, ensureCurrentRoutineTemplates, getExerciseDefinition, type RoutineDefinition } from "../data/training";
import {
  BODYWEIGHT_KEY,
  HISTORY_KEY,
  READINESS_KEY,
  allExerciseSummaries,
  formatDuration,
  formatShortDate,
  localDay,
  safeArray,
  type BodyweightEntry,
  type ReadinessRecord,
  type WorkoutHistoryItem,
} from "../lib/trainingIntelligence";
import {
  WEEKLY_PLAN_KEY,
  defaultWeeklyPlan,
  normalizeWeeklyPlan,
  todayPlanIndex,
  type WeeklyPlanDay,
} from "../lib/weeklyPlan";
import {
  Badge,
  Button,
  Card,
  PageHeader,
  PageShell,
  SectionHeader,
  SegmentedControl,
  Stat,
  StatGrid,
} from "../ui";

const ROUTINES_KEY = "workout-tracker:v0.4:routines";
const ACTIVE_ROUTINE_KEY = "workout-tracker:v0.4:active-routine";
const DRAFTS_KEY = "workout-tracker:v0.7:drafts";

type Draft = { startedAt?: string | null; sessionActive?: boolean };

function readRoutines() {
  try {
    const parsed = JSON.parse(localStorage.getItem(ROUTINES_KEY) ?? "null");
    return ensureCurrentRoutineTemplates(Array.isArray(parsed) && parsed.length ? (parsed as RoutineDefinition[]) : defaultRoutines);
  } catch {
    return defaultRoutines;
  }
}

function readWeeklyPlan() {
  try {
    return normalizeWeeklyPlan(JSON.parse(localStorage.getItem(WEEKLY_PLAN_KEY) ?? "null"));
  } catch {
    return defaultWeeklyPlan;
  }
}

function activeDraft(draft?: Draft) {
  if (!draft?.sessionActive || !draft.startedAt) return false;
  const started = new Date(draft.startedAt).getTime();
  const age = Date.now() - started;
  return Number.isFinite(started) && age >= 0 && age <= 6 * 60 * 60 * 1000;
}

function readinessLabel(record: ReadinessRecord | null) {
  if (!record) return "Not checked yet";
  return `${record.sleep} sleep · ${record.energy} energy · ${record.soreness} soreness`;
}

function planAction(item: WeeklyPlanDay) {
  if (item.kind === "rest") return { href: "/plan", label: "Recovery day" };
  const routine = item.routineId ? `&routine=${encodeURIComponent(item.routineId)}` : "";
  return { href: `/live?kind=${encodeURIComponent(item.kind)}&title=${encodeURIComponent(item.title)}${routine}`, label: item.kind === "lift" ? "Start Live Training" : "Start live session" };
}

export default function TodayDashboard() {
  const [history, setHistory] = useState<WorkoutHistoryItem[]>([]);
  const [routines, setRoutines] = useState<RoutineDefinition[]>(defaultRoutines);
  const [activeRoutineId, setActiveRoutineId] = useState("legs");
  const [draftRunning, setDraftRunning] = useState(false);
  const [bodyweight, setBodyweight] = useState<BodyweightEntry[]>([]);
  const [readiness, setReadiness] = useState<ReadinessRecord[]>([]);
  const [weeklyPlan, setWeeklyPlan] = useState<WeeklyPlanDay[]>(defaultWeeklyPlan);
  const [hybridSessions, setHybridSessions] = useState<HybridSession[]>([]);
  const today = localDay(new Date());

  useEffect(() => {
    const nextHistory = safeArray<WorkoutHistoryItem>(localStorage.getItem(HISTORY_KEY));
    const nextRoutines = readRoutines();
    let active = localStorage.getItem(ACTIVE_ROUTINE_KEY) ?? nextRoutines[0]?.id ?? "legs";
    if (!nextRoutines.some((routine) => routine.id === active)) active = nextRoutines[0]?.id ?? "legs";
    let drafts: Record<string, Draft> = {};
    try { drafts = JSON.parse(localStorage.getItem(DRAFTS_KEY) ?? "{}") as Record<string, Draft>; } catch { drafts = {}; }
    setHistory(nextHistory);
    setRoutines(nextRoutines);
    setActiveRoutineId(active);
    setDraftRunning(activeDraft(drafts[active]));
    setBodyweight(safeArray<BodyweightEntry>(localStorage.getItem(BODYWEIGHT_KEY)));
    setReadiness(safeArray<ReadinessRecord>(localStorage.getItem(READINESS_KEY)));
    setWeeklyPlan(readWeeklyPlan());
    setHybridSessions(readHybridSessions());

    const onPlanChange = () => setWeeklyPlan(readWeeklyPlan());
    const onHybridChange = () => setHybridSessions(readHybridSessions());
    window.addEventListener("workout-tracker:weekly-plan", onPlanChange);
    window.addEventListener("workout-tracker:hybrid-session", onHybridChange);
    return () => {
      window.removeEventListener("workout-tracker:weekly-plan", onPlanChange);
      window.removeEventListener("workout-tracker:hybrid-session", onHybridChange);
    };
  }, []);

  const activeRoutine = routines.find((routine) => routine.id === activeRoutineId) ?? routines[0] ?? defaultRoutines[0];
  const latestWeight = [...bodyweight].sort((a, b) => String(b.recordedAt).localeCompare(String(a.recordedAt)))[0];
  const todayReadiness = readiness.find((item) => item.date === today) ?? null;
  const todayPlan = weeklyPlan[todayPlanIndex()] ?? defaultWeeklyPlan[todayPlanIndex()];
  const todayPlanAction = planAction(todayPlan);
  const adaptiveWeek = useMemo(() => buildAdaptiveWeek(history, hybridSessions, weeklyPlan, readiness), [history, hybridSessions, weeklyPlan, readiness]);
  const summaries = useMemo(() => allExerciseSummaries(history), [history]);
  const summaryMap = useMemo(() => new Map(summaries.map((item) => [item.id, item])), [summaries]);
  const progressionReady = activeRoutine.exerciseIds.filter((id) => summaryMap.get(id)?.progression?.action === "increase").length;
  const plannedSets = activeRoutine.exerciseIds.reduce((sum, id) => sum + (activeRoutine.setCountOverrides?.[id] ?? getExerciseDefinition(id)?.setCount ?? 3), 0);
  const lastSameRoutine = history.find((workout) => workout.routineId === activeRoutine.id || workout.name === activeRoutine.name);
  const latestPr = history.flatMap((workout) => (workout.prs ?? []).map((pr) => ({ pr, completedAt: workout.completedAt })))[0];
  const firstTarget = activeRoutine.exerciseIds.map((id) => summaryMap.get(id)).find((item) => item?.progression)?.progression;

  function setReadinessField<K extends "sleep" | "energy" | "soreness">(field: K, value: ReadinessRecord[K]) {
    const base: ReadinessRecord = todayReadiness ?? {
      date: today,
      sleep: "ok",
      energy: "normal",
      soreness: "some",
      updatedAt: new Date().toISOString(),
    };
    const nextRecord = { ...base, [field]: value, updatedAt: new Date().toISOString() } as ReadinessRecord;
    const next = [nextRecord, ...readiness.filter((item) => item.date !== today)].slice(0, 90);
    setReadiness(next);
    localStorage.setItem(READINESS_KEY, JSON.stringify(next));
  }

  const go = (href: string) => { window.location.href = href; };
  const dateLabel = new Date().toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" });
  const primaryLabel = todayPlan.kind === "lift" && draftRunning ? "Resume workout" : todayPlanAction.label;

  return (
    <PageShell>
      <div className="ds-rise">
        <PageHeader
          eyebrow={dateLabel}
          eyebrowVolt
          title={<>Training <span className="ds-accent">Console</span></>}
          action={<Button variant="ghost" size="sm" onClick={() => go("/history")}>History</Button>}
        />
      </div>

      <Card glow className="ds-rise ds-rise--1">
        <div className="ds-stack">
          <div className="ds-cluster" style={{ justifyContent: "space-between" }}>
            <Badge tone="volt" dot>{todayPlan.kind === "rest" ? "Recovery" : todayPlan.kind}</Badge>
            <span className="ds-muted" style={{ fontSize: "0.78rem" }}>{todayPlan.kind === "lift" ? activeRoutine.name : "Live session"}</span>
          </div>
          <div>
            <h2 className="ds-section-title" style={{ fontSize: "1.6rem" }}>{todayPlan.title}</h2>
            <p className="ds-muted" style={{ margin: "6px 0 0" }}>
              {todayPlan.detail || "No extra goal set."}
              {todayPlan.kind === "lift" ? ` · ${activeRoutine.exerciseIds.length} exercises · ~${plannedSets} sets` : ""}
              {progressionReady > 0 ? ` · ${progressionReady} ready to progress` : ""}
            </p>
          </div>
          <StatGrid cols={2}>
            <Stat
              label={todayPlan.kind === "lift" ? "Last comparable" : "Session"}
              value={todayPlan.kind === "lift" ? (lastSameRoutine ? formatShortDate(lastSameRoutine.completedAt) : "First") : "Ready"}
              sub={todayPlan.kind === "lift"
                ? (lastSameRoutine ? `${formatDuration(lastSameRoutine.durationSeconds)} · ${Math.round(lastSameRoutine.totalVolume).toLocaleString()} lb` : "No baseline yet — let's build one")
                : "Live tracking saves to history"}
            />
            <Stat
              label="Coach signal"
              value={adaptiveWeek.todayRecommendation.signal.toUpperCase()}
              tone="volt"
              sub={adaptiveWeek.todayRecommendation.label}
            />
          </StatGrid>
          <div className="ds-grid-2">
            <Button variant="primary" size="lg" block onClick={() => go(todayPlanAction.href)}>{primaryLabel}</Button>
            <Button variant="secondary" size="lg" block onClick={() => go("/plan")}>Adjust plan</Button>
          </div>
        </div>
      </Card>

      <Card pressable onClick={() => go("/coach")} className="ds-rise ds-rise--2">
        <div className="ds-cluster" style={{ justifyContent: "space-between" }}>
          <Badge tone="blue">Coach</Badge>
          <span className="ds-muted" style={{ fontSize: "0.78rem" }}>{adaptiveWeek.todayRecommendation.signal}</span>
        </div>
        <h3 className="ds-section-title" style={{ marginTop: 10 }}>{adaptiveWeek.todayRecommendation.label}</h3>
        <p className="ds-muted" style={{ margin: "6px 0 0" }}>{adaptiveWeek.todayRecommendation.reason}</p>
      </Card>

      <div className="ds-rise ds-rise--3">
        <SectionHeader eyebrow="Readiness" title="Quick check" action={<span className="ds-muted" style={{ fontSize: "0.78rem" }}>{readinessLabel(todayReadiness)}</span>} />
        <div style={{ marginTop: 12 }}>
          <Card tight>
            <div className="ds-stack">
              <div>
                <div className="ds-field__label" style={{ marginBottom: 6 }}>Sleep</div>
                <SegmentedControl
                  label="Sleep quality"
                  options={[{ value: "poor", label: "Poor" }, { value: "ok", label: "OK" }, { value: "good", label: "Good" }] as const}
                  value={todayReadiness?.sleep ?? "ok"}
                  onChange={(v) => setReadinessField("sleep", v)}
                />
              </div>
              <div>
                <div className="ds-field__label" style={{ marginBottom: 6 }}>Energy</div>
                <SegmentedControl
                  label="Energy"
                  options={[{ value: "low", label: "Low" }, { value: "normal", label: "Normal" }, { value: "high", label: "High" }] as const}
                  value={todayReadiness?.energy ?? "normal"}
                  onChange={(v) => setReadinessField("energy", v)}
                />
              </div>
              <div>
                <div className="ds-field__label" style={{ marginBottom: 6 }}>Soreness</div>
                <SegmentedControl
                  label="Soreness"
                  options={[{ value: "none", label: "None" }, { value: "some", label: "Some" }, { value: "high", label: "High" }] as const}
                  value={todayReadiness?.soreness ?? "some"}
                  onChange={(v) => setReadinessField("soreness", v)}
                />
              </div>
            </div>
          </Card>
        </div>
      </div>

      <div className="ds-rise ds-rise--4">
        <SectionHeader eyebrow="Overview" title="Your training" action={<Button variant="ghost" size="sm" onClick={() => go("/progress")}>View progress</Button>} />
        <div style={{ marginTop: 12 }}>
          <StatGrid cols={2}>
            <Card tight pressable onClick={() => go("/progress")}>
              <div className="ds-stat__label">Next target</div>
              <div className="ds-stat__value" style={{ fontSize: "1.15rem" }}>{firstTarget?.target ?? "Build baseline"}</div>
              <div className="ds-stat__sub">{firstTarget?.label ?? "Progression appears after logging"}</div>
            </Card>
            <Card tight pressable onClick={() => go("/bodyweight")}>
              <div className="ds-stat__label">Bodyweight</div>
              <div className="ds-stat__value ds-tnum" style={{ fontSize: "1.15rem" }}>{latestWeight ? `${Number(latestWeight.value).toFixed(1)} lb` : "Add weight"}</div>
              <div className="ds-stat__sub">View and edit</div>
            </Card>
            <Card tight pressable onClick={() => go("/prs")}>
              <div className="ds-stat__label">Latest PR</div>
              <div className="ds-stat__value ds-stat__value--amber" style={{ fontSize: "1.15rem" }}>{latestPr?.pr ?? "No PR yet"}</div>
              <div className="ds-stat__sub">{latestPr ? formatShortDate(latestPr.completedAt) : "Record board ready"}</div>
            </Card>
            <Card tight pressable onClick={() => go("/history")}>
              <div className="ds-stat__label">Last session</div>
              <div className="ds-stat__value" style={{ fontSize: "1.15rem" }}>{history[0]?.name ?? "No sessions yet"}</div>
              <div className="ds-stat__sub">{history[0] ? formatShortDate(history[0].completedAt) : "Open training history"}</div>
            </Card>
          </StatGrid>
        </div>
      </div>
    </PageShell>
  );
}
