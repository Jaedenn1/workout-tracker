"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { defaultRoutines, exerciseLibrary, type ExerciseDefinition, type RoutineDefinition } from "../data/training";
import { buildAdaptiveWeek } from "../lib/adaptiveTraining";
import {
  buildAdvancedIntelligence,
  readCoachFeedback,
  refineRecommendation,
  type CoachFeedback,
} from "../lib/advancedTrainingIntelligence";
import { readHybridSessions, saveHybridSession, type HybridSession, type HybridSessionKind } from "../lib/hybridSessions";
import {
  LIVE_SESSION_KEY,
  buildLivePrescription,
  clampLiveDuration,
  clampLiveRpe,
  completedLiveSetCount,
  completedPerformance,
  formatClock,
  generatedSessionNote,
  historicalBestE1rm,
  intervalPaceSignal,
  liveDosePercent,
  makeLiveExercise,
  nextSetRecommendation,
  plannedLiveSetCount,
  recoveryEstimate,
  sessionQualityScore,
  sessionStatus,
  smartRestSeconds,
  substitutionOptions,
  uid,
  type LiveDiscomfort,
  type LiveExercise,
  type LiveOverrideMode,
  type LiveTimelineEvent,
  type LiveTimelineTone,
} from "../lib/liveTraining";
import { estimateOneRepMax } from "../lib/progression";
import {
  HISTORY_KEY,
  READINESS_KEY,
  localDay,
  safeArray,
  type ReadinessRecord,
  type WorkoutHistoryItem,
} from "../lib/trainingIntelligence";
import {
  WEEKLY_PLAN_KEY,
  defaultWeeklyPlan,
  normalizeWeeklyPlan,
  todayPlanIndex,
  type TrainingKind,
  type WeeklyPlanDay,
} from "../lib/weeklyPlan";

const ROUTINES_KEY = "workout-tracker:v0.4:routines";
const ACTIVE_ROUTINE_KEY = "workout-tracker:v0.4:active-routine";
const CUSTOM_KEY = "workout-tracker:v0.7:custom-exercises";

type CustomExercise = ExerciseDefinition & { equipment?: string };
type ReadinessDrift = "better" | "same" | "worse";
type BranchMode = "normal" | "reduced accessories" | "recovery finish";
type FinishedSummary = { quality: number; note: string; recovery: string; prs: string[] };
type WakeSentinel = { release(): Promise<void> };

type LiveDraft = {
  sessionId: string;
  startedAt: string;
  pausedAt: string | null;
  totalPausedSeconds: number;
  kind: TrainingKind;
  title: string;
  routineId: string | null;
  overrideMode: LiveOverrideMode;
  originalDuration: number;
  originalRpe: number;
  targetDuration: number;
  targetRpe: number;
  exercises: LiveExercise[];
  effort: number;
  distanceKm: number;
  elevationFeet: number;
  laps: number;
  poolMeters: number;
  rounds: number;
  subtype: string;
  intervalTarget: number;
  intervalDistance: number;
  intervalSplits: number[];
  recoveryModalities: string[];
  timeline: LiveTimelineEvent[];
  branch: BranchMode;
  discomfort: LiveDiscomfort | null;
  discomfortAdjusted: boolean;
  readinessDrift: ReadinessDrift;
  restRemaining: number;
  restSavedAt: string;
};

const runSubtypes = ["Easy aerobic", "Tempo", "Intervals", "Long run", "Recovery run"];
const conditioningSubtypes = ["Jacob's Ladder", "Sled", "Sprints", "Circuit", "Bike", "Rower"];
const poolSubtypes = ["Easy swim", "Technique", "Pool recovery"];
const recoverySubtypes = ["Mobility", "Walk", "Mixed recovery"];
const recoveryOptions = ["Pool", "Hot tub", "Sauna", "Steam", "Mobility", "Walk"];

function readPlan() {
  try { return normalizeWeeklyPlan(JSON.parse(localStorage.getItem(WEEKLY_PLAN_KEY) ?? "null")); }
  catch { return defaultWeeklyPlan; }
}
function readRoutines() {
  try {
    const parsed = JSON.parse(localStorage.getItem(ROUTINES_KEY) ?? "null");
    return Array.isArray(parsed) && parsed.length ? parsed as RoutineDefinition[] : defaultRoutines;
  } catch { return defaultRoutines; }
}
function readCustom() {
  try {
    const parsed = JSON.parse(localStorage.getItem(CUSTOM_KEY) ?? "[]");
    return Array.isArray(parsed) ? parsed as CustomExercise[] : [];
  } catch { return []; }
}
function validKind(value: string | null): TrainingKind | null {
  return value === "lift" || value === "run" || value === "conditioning" || value === "pool" || value === "recovery" || value === "rest" ? value : null;
}
function definitionFor(id: string, custom: CustomExercise[]) {
  return exerciseLibrary.find((item) => item.id === id) ?? custom.find((item) => item.id === id) ?? null;
}
function elapsedSeconds(startedAt: string | null, pausedAt: string | null, pausedSeconds: number) {
  if (!startedAt) return 0;
  const start = new Date(startedAt).getTime();
  const end = pausedAt ? new Date(pausedAt).getTime() : Date.now();
  return Number.isFinite(start) && Number.isFinite(end) ? Math.max(0, Math.floor((end - start) / 1000) - pausedSeconds) : 0;
}
function subtypeOptions(kind: TrainingKind) {
  if (kind === "run") return runSubtypes;
  if (kind === "conditioning") return conditioningSubtypes;
  if (kind === "pool") return poolSubtypes;
  if (kind === "recovery") return recoverySubtypes;
  return [];
}
function defaultSubtype(kind: TrainingKind, title: string) {
  const lower = title.toLowerCase();
  const options = subtypeOptions(kind);
  return options.find((item) => lower.includes(item.toLowerCase().split(" ")[0])) ?? options[0] ?? "General";
}
function paceLabel(distanceKm: number, elapsed: number) {
  if (distanceKm <= 0 || elapsed <= 0) return "—";
  const sec = Math.round(elapsed / distanceKm);
  return `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, "0")}/km`;
}
function average(values: number[]) { return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null; }
function defaultTargets(kind: TrainingKind, planToday: WeeklyPlanDay) {
  if (kind === planToday.kind) {
    return {
      duration: clampLiveDuration(planToday.targetDurationMinutes, kind === "conditioning" ? 20 : 45),
      rpe: clampLiveRpe(planToday.targetRpe, kind === "pool" || kind === "recovery" ? 4 : 7),
    };
  }
  const duration = kind === "lift" ? 55 : kind === "run" ? 35 : kind === "conditioning" ? 20 : kind === "pool" || kind === "recovery" ? 30 : 30;
  const rpe = kind === "lift" ? 7 : kind === "run" ? 5 : kind === "conditioning" ? 8 : kind === "pool" ? 4 : kind === "recovery" ? 3 : 2;
  return { duration, rpe };
}
function timelineTone(value: unknown): LiveTimelineTone {
  return value === "good" || value === "warn" || value === "stop" ? value : "neutral";
}
function sanitizeTimeline(value: unknown): LiveTimelineEvent[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) return [];
    const item = entry as Partial<LiveTimelineEvent>;
    if (typeof item.label !== "string" || typeof item.detail !== "string") return [];
    return [{
      id: typeof item.id === "string" && item.id ? item.id : uid("event"),
      elapsedSeconds: Math.max(0, Math.floor(Number(item.elapsedSeconds) || 0)),
      label: item.label.slice(0, 120),
      detail: item.detail.slice(0, 500),
      tone: timelineTone(item.tone),
    }];
  }).slice(-250);
}
function sanitizeExercises(value: unknown): LiveExercise[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) return [];
    const item = entry as Partial<LiveExercise>;
    if (typeof item.id !== "string" || typeof item.name !== "string" || !Array.isArray(item.sets)) return [];
    const definition = definitionFor(item.id, []);
    const muscle = (typeof item.muscle === "string" ? item.muscle : definition?.muscle) as LiveExercise["muscle"] | undefined;
    if (!muscle) return [];
    const repMin = Math.max(1, Math.round(Number(item.repMin) || definition?.repMin || 1));
    const repMax = Math.max(repMin, Math.round(Number(item.repMax) || definition?.repMax || repMin));
    const increment = Math.max(0, Number(item.increment) || definition?.increment || 0);
    const fallbackWeight = Math.max(0, Number(item.fallbackWeight) || definition?.fallbackWeight || 0);
    const sets = item.sets.flatMap((setValue) => {
      if (!setValue || typeof setValue !== "object" || Array.isArray(setValue)) return [];
      const set = setValue as Partial<LiveExercise["sets"][number]>;
      const weight = set.weight == null || !Number.isFinite(Number(set.weight)) ? null : Math.max(0, Number(set.weight));
      const reps = set.reps == null || !Number.isFinite(Number(set.reps)) ? null : Math.max(0, Math.round(Number(set.reps)));
      const rir = set.rir == null || !Number.isFinite(Number(set.rir)) ? null : Math.max(0, Math.min(6, Number(set.rir)));
      const done = Boolean(set.done && weight != null && reps != null && reps > 0);
      return [{ id: typeof set.id === "string" && set.id ? set.id : uid(`${item.id}-set`), weight, reps, rir, done }];
    }).slice(0, 20);
    return [{ id: item.id, name: item.name, muscle, repMin, repMax, increment, fallbackWeight, skipped: Boolean(item.skipped), sets }];
  }).slice(0, 30);
}
function sanitizeDraft(value: unknown, fallbackKind: TrainingKind, fallbackTitle: string, fallbackRoutine: string | null, fallbackDuration: number, fallbackRpe: number): LiveDraft | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const item = value as Partial<LiveDraft>;
  if (typeof item.startedAt !== "string") return null;
  const started = new Date(item.startedAt).getTime();
  const age = Date.now() - started;
  if (!Number.isFinite(started) || age < 0 || age > 12 * 60 * 60 * 1000) return null;
  const kind = validKind(typeof item.kind === "string" ? item.kind : null) ?? fallbackKind;
  const pausedAt = typeof item.pausedAt === "string" && Number.isFinite(new Date(item.pausedAt).getTime()) ? item.pausedAt : null;
  const timeline = sanitizeTimeline(item.timeline);
  const branch: BranchMode = item.branch === "reduced accessories" || item.branch === "recovery finish" ? item.branch : "normal";
  const discomfort: LiveDiscomfort | null = item.discomfort === "joint" || item.discomfort === "muscle" || item.discomfort === "cramp" || item.discomfort === "technique" || item.discomfort === "other" ? item.discomfort : null;
  const readinessDrift: ReadinessDrift = item.readinessDrift === "better" || item.readinessDrift === "worse" ? item.readinessDrift : "same";
  const overrideMode: LiveOverrideMode = item.overrideMode === "original" || item.overrideMode === "custom" ? item.overrideMode : "coach";
  const restSavedAt = typeof item.restSavedAt === "string" && Number.isFinite(new Date(item.restSavedAt).getTime()) ? item.restSavedAt : new Date().toISOString();
  let restRemaining = Math.max(0, Math.min(900, Math.round(Number(item.restRemaining) || 0)));
  if (!pausedAt && restRemaining > 0) {
    const wallElapsed = Math.max(0, Math.floor((Date.now() - new Date(restSavedAt).getTime()) / 1000));
    restRemaining = Math.max(0, restRemaining - wallElapsed);
  }
  return {
    sessionId: typeof item.sessionId === "string" && item.sessionId ? item.sessionId : uid("live"),
    startedAt: item.startedAt,
    pausedAt,
    totalPausedSeconds: Math.max(0, Math.floor(Number(item.totalPausedSeconds) || 0)),
    kind,
    title: typeof item.title === "string" && item.title.trim() ? item.title.trim().slice(0, 120) : fallbackTitle,
    routineId: typeof item.routineId === "string" ? item.routineId : fallbackRoutine,
    overrideMode,
    originalDuration: clampLiveDuration(item.originalDuration, fallbackDuration),
    originalRpe: clampLiveRpe(item.originalRpe, fallbackRpe),
    targetDuration: clampLiveDuration(item.targetDuration, fallbackDuration),
    targetRpe: clampLiveRpe(item.targetRpe, fallbackRpe),
    exercises: sanitizeExercises(item.exercises),
    effort: clampLiveRpe(item.effort, fallbackRpe),
    distanceKm: Math.max(0, Number(item.distanceKm) || 0),
    elevationFeet: Math.max(0, Number(item.elevationFeet) || 0),
    laps: Math.max(0, Math.round(Number(item.laps) || 0)),
    poolMeters: Math.max(0, Number(item.poolMeters) || 0),
    rounds: Math.max(0, Math.round(Number(item.rounds) || 0)),
    subtype: typeof item.subtype === "string" && item.subtype.trim() ? item.subtype.trim().slice(0, 80) : defaultSubtype(kind, fallbackTitle),
    intervalTarget: Math.max(1, Math.min(30, Math.round(Number(item.intervalTarget) || 6))),
    intervalDistance: Math.max(50, Math.min(5000, Math.round(Number(item.intervalDistance) || 400))),
    intervalSplits: Array.isArray(item.intervalSplits) ? item.intervalSplits.map(Number).filter((value) => Number.isFinite(value) && value > 0).slice(-50) : [],
    recoveryModalities: Array.isArray(item.recoveryModalities) ? item.recoveryModalities.filter((value): value is string => typeof value === "string" && recoveryOptions.includes(value)).slice(0, recoveryOptions.length) : [],
    timeline,
    branch,
    discomfort,
    discomfortAdjusted: Boolean(item.discomfortAdjusted),
    readinessDrift,
    restRemaining,
    restSavedAt,
  };
}

export default function LiveTrainingOS() {
  const [hydrated, setHydrated] = useState(false);
  const [history, setHistory] = useState<WorkoutHistoryItem[]>([]);
  const [hybrid, setHybrid] = useState<HybridSession[]>([]);
  const [readiness, setReadiness] = useState<ReadinessRecord[]>([]);
  const [plan, setPlan] = useState<WeeklyPlanDay[]>(defaultWeeklyPlan);
  const [routines, setRoutines] = useState<RoutineDefinition[]>(defaultRoutines);
  const [customExercises, setCustomExercises] = useState<CustomExercise[]>([]);
  const [feedback, setFeedback] = useState<CoachFeedback[]>([]);
  const [kind, setKind] = useState<TrainingKind>("lift");
  const [title, setTitle] = useState("Live training");
  const [routineId, setRoutineId] = useState<string | null>("legs");
  const [overrideMode, setOverrideMode] = useState<LiveOverrideMode>("coach");
  const [originalDuration, setOriginalDuration] = useState(45);
  const [originalRpe, setOriginalRpe] = useState(7);
  const [targetDuration, setTargetDuration] = useState(45);
  const [targetRpe, setTargetRpe] = useState(7);
  const [exercises, setExercises] = useState<LiveExercise[]>([]);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [startedAt, setStartedAt] = useState<string | null>(null);
  const [pausedAt, setPausedAt] = useState<string | null>(null);
  const [totalPausedSeconds, setTotalPausedSeconds] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const [restRemaining, setRestRemaining] = useState(0);
  const [timeline, setTimeline] = useState<LiveTimelineEvent[]>([]);
  const [branch, setBranch] = useState<BranchMode>("normal");
  const [discomfort, setDiscomfort] = useState<LiveDiscomfort | null>(null);
  const [discomfortAdjusted, setDiscomfortAdjusted] = useState(false);
  const [readinessDrift, setReadinessDrift] = useState<ReadinessDrift>("same");
  const [effort, setEffort] = useState(6);
  const [distanceKm, setDistanceKm] = useState(0);
  const [elevationFeet, setElevationFeet] = useState(0);
  const [laps, setLaps] = useState(0);
  const [poolMeters, setPoolMeters] = useState(0);
  const [rounds, setRounds] = useState(0);
  const [subtype, setSubtype] = useState("General");
  const [intervalTarget, setIntervalTarget] = useState(6);
  const [intervalDistance, setIntervalDistance] = useState(400);
  const [intervalSplitInput, setIntervalSplitInput] = useState(105);
  const [intervalSplits, setIntervalSplits] = useState<number[]>([]);
  const [recoveryModalities, setRecoveryModalities] = useState<string[]>([]);
  const [notice, setNotice] = useState("");
  const [finished, setFinished] = useState<FinishedSummary | null>(null);
  const [discardArmed, setDiscardArmed] = useState(false);
  const [wakeLockActive, setWakeLockActive] = useState(false);
  const targetReachedRef = useRef(false);
  const overTargetRef = useRef(false);
  const wakeLockRef = useRef<WakeSentinel | null>(null);
  const finishingRef = useRef(false);
  const branchRef = useRef<BranchMode>("normal");
  const readinessDriftRef = useRef<ReadinessDrift>("same");
  const discomfortAdjustedRef = useRef(false);

  const todayIndex = todayPlanIndex();
  const basePlan = plan[todayIndex] ?? defaultWeeklyPlan[todayIndex];
  const effectivePlan = useMemo<WeeklyPlanDay>(() => ({
    ...basePlan,
    kind,
    title: title || basePlan.title,
    routineId: kind === "lift" ? routineId : null,
    targetDurationMinutes: originalDuration,
    targetRpe: originalRpe,
  }), [basePlan, kind, title, routineId, originalDuration, originalRpe]);

  const adaptive = useMemo(() => buildAdaptiveWeek(history, hybrid, plan, readiness), [history, hybrid, plan, readiness]);
  const advanced = useMemo(() => buildAdvancedIntelligence(history, hybrid, readiness, plan, adaptive.days, routines, feedback), [history, hybrid, readiness, plan, adaptive.days, routines, feedback]);
  const refined = useMemo(() => refineRecommendation(adaptive.todayRecommendation, advanced, kind), [adaptive.todayRecommendation, advanced, kind]);
  const prescription = useMemo(() => buildLivePrescription(effectivePlan, refined.signal, advanced), [effectivePlan, refined.signal, advanced]);
  const activeRoutine = routines.find((item) => item.id === routineId) ?? routines[0] ?? defaultRoutines[0];

  useEffect(() => {
    const nextHistory = safeArray<WorkoutHistoryItem>(localStorage.getItem(HISTORY_KEY));
    const nextHybrid = readHybridSessions();
    const nextReadiness = safeArray<ReadinessRecord>(localStorage.getItem(READINESS_KEY));
    const nextPlan = readPlan();
    const nextRoutines = readRoutines();
    const nextCustom = readCustom();
    const nextFeedback = readCoachFeedback();
    const params = new URLSearchParams(window.location.search);
    const planToday = nextPlan[todayPlanIndex()] ?? defaultWeeklyPlan[todayPlanIndex()];
    const queryKind = validKind(params.get("kind"));
    const chosenKind = queryKind ?? planToday.kind;
    const chosenTitle = params.get("title")?.trim() || (chosenKind === planToday.kind ? planToday.title : chosenKind === "lift" ? "Strength session" : chosenKind);
    const queryRoutine = params.get("routine")?.trim();
    const storedRoutine = localStorage.getItem(ACTIVE_ROUTINE_KEY);
    const requestedRoutine = queryRoutine || (chosenKind === planToday.kind ? planToday.routineId : null) || storedRoutine || nextRoutines[0]?.id || "legs";
    const chosenRoutine = chosenKind === "lift" ? (nextRoutines.some((routine) => routine.id === requestedRoutine) ? requestedRoutine : nextRoutines[0]?.id || "legs") : null;
    const fallbackTargets = defaultTargets(chosenKind, planToday);

    setHistory(nextHistory); setHybrid(nextHybrid); setReadiness(nextReadiness); setPlan(nextPlan); setRoutines(nextRoutines); setCustomExercises(nextCustom); setFeedback(nextFeedback);
    setKind(chosenKind); setTitle(chosenTitle); setRoutineId(chosenRoutine); setSubtype(defaultSubtype(chosenKind, chosenTitle));

    let rawDraft: unknown = null;
    try { rawDraft = JSON.parse(localStorage.getItem(LIVE_SESSION_KEY) ?? "null"); } catch { rawDraft = null; }
    const draft = sanitizeDraft(rawDraft, chosenKind, chosenTitle, chosenRoutine, fallbackTargets.duration, fallbackTargets.rpe);
    if (draft) {
      const safeRoutine = draft.kind === "lift" && draft.routineId && nextRoutines.some((routine) => routine.id === draft.routineId) ? draft.routineId : draft.kind === "lift" ? nextRoutines[0]?.id || "legs" : null;
      setSessionId(draft.sessionId); setStartedAt(draft.startedAt); setPausedAt(draft.pausedAt); setTotalPausedSeconds(draft.totalPausedSeconds);
      setKind(draft.kind); setTitle(draft.title); setRoutineId(safeRoutine); setOverrideMode(draft.overrideMode); setOriginalDuration(draft.originalDuration); setOriginalRpe(draft.originalRpe); setTargetDuration(draft.targetDuration); setTargetRpe(draft.targetRpe);
      setExercises(draft.exercises); setEffort(draft.effort); setDistanceKm(draft.distanceKm); setElevationFeet(draft.elevationFeet); setLaps(draft.laps); setPoolMeters(draft.poolMeters); setRounds(draft.rounds); setRestRemaining(draft.restRemaining);
      setSubtype(draft.subtype); setIntervalTarget(draft.intervalTarget); setIntervalDistance(draft.intervalDistance); setIntervalSplits(draft.intervalSplits); setRecoveryModalities(draft.recoveryModalities); setTimeline(draft.timeline); setBranch(draft.branch); setDiscomfort(draft.discomfort); setDiscomfortAdjusted(draft.discomfortAdjusted); setReadinessDrift(draft.readinessDrift);
      branchRef.current = draft.branch; readinessDriftRef.current = draft.readinessDrift; discomfortAdjustedRef.current = draft.discomfortAdjusted;
      targetReachedRef.current = draft.timeline.some((event) => event.label === "Productive dose reached"); overTargetRef.current = draft.timeline.some((event) => event.label === "Dose above target");
      setNotice("Resumed your saved live session.");
    } else {
      setOriginalDuration(fallbackTargets.duration); setOriginalRpe(fallbackTargets.rpe); setTargetDuration(fallbackTargets.duration); setTargetRpe(fallbackTargets.rpe); setEffort(fallbackTargets.rpe);
      localStorage.removeItem(LIVE_SESSION_KEY);
    }
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated || startedAt) return;
    if (overrideMode === "coach") { setTargetDuration(prescription.coachDuration); setTargetRpe(prescription.coachRpe); setEffort(prescription.coachRpe); }
    else if (overrideMode === "original") { setTargetDuration(prescription.originalDuration); setTargetRpe(prescription.originalRpe); setEffort(prescription.originalRpe); }
  }, [hydrated, startedAt, overrideMode, prescription.coachDuration, prescription.coachRpe, prescription.originalDuration, prescription.originalRpe]);

  useEffect(() => {
    if (!startedAt) { setElapsed(0); return; }
    const tick = () => setElapsed(elapsedSeconds(startedAt, pausedAt, totalPausedSeconds));
    tick();
    const timer = window.setInterval(tick, 1000);
    return () => window.clearInterval(timer);
  }, [startedAt, pausedAt, totalPausedSeconds]);

  useEffect(() => {
    if (!startedAt || pausedAt || restRemaining <= 0) return;
    const timer = window.setInterval(() => setRestRemaining((value) => Math.max(0, value - 1)), 1000);
    return () => window.clearInterval(timer);
  }, [startedAt, pausedAt, restRemaining]);

  useEffect(() => {
    if (!hydrated || !startedAt || !sessionId || finished) return;
    const draft: LiveDraft = { sessionId, startedAt, pausedAt, totalPausedSeconds, kind, title, routineId, overrideMode, originalDuration, originalRpe, targetDuration, targetRpe, exercises, effort, distanceKm, elevationFeet, laps, poolMeters, rounds, subtype, intervalTarget, intervalDistance, intervalSplits, recoveryModalities, timeline, branch, discomfort, discomfortAdjusted, readinessDrift, restRemaining, restSavedAt: new Date().toISOString() };
    localStorage.setItem(LIVE_SESSION_KEY, JSON.stringify(draft));
  }, [hydrated, sessionId, startedAt, pausedAt, totalPausedSeconds, kind, title, routineId, overrideMode, originalDuration, originalRpe, targetDuration, targetRpe, exercises, effort, distanceKm, elevationFeet, laps, poolMeters, rounds, subtype, intervalTarget, intervalDistance, intervalSplits, recoveryModalities, timeline, branch, discomfort, discomfortAdjusted, readinessDrift, restRemaining, finished]);

  useEffect(() => {
    if (!hydrated) return;
    const nav = navigator as Navigator & { wakeLock?: { request(type: "screen"): Promise<WakeSentinel> } };
    async function release() {
      const lock = wakeLockRef.current; wakeLockRef.current = null; setWakeLockActive(false);
      if (lock) try { await lock.release(); } catch { /* best effort */ }
    }
    async function acquire() {
      if (!startedAt || finished || pausedAt || document.visibilityState !== "visible" || !nav.wakeLock?.request || wakeLockRef.current) return;
      try { wakeLockRef.current = await nav.wakeLock.request("screen"); setWakeLockActive(true); } catch { setWakeLockActive(false); }
    }
    void (!startedAt || finished || pausedAt ? release() : acquire());
    const onVisibility = () => void (document.visibilityState === "visible" && startedAt && !finished && !pausedAt ? acquire() : release());
    document.addEventListener("visibilitychange", onVisibility);
    return () => { document.removeEventListener("visibilitychange", onVisibility); void release(); };
  }, [hydrated, startedAt, pausedAt, finished]);

  const doneSets = useMemo(() => completedLiveSetCount(exercises), [exercises]);
  const totalSets = useMemo(() => plannedLiveSetCount(exercises), [exercises]);
  const liftRpe = useMemo(() => {
    const values = exercises.flatMap((exercise) => completedPerformance(exercise).map((set) => set.rir == null ? null : Math.max(1, Math.min(10, 10 - Number(set.rir))))).filter((value): value is number => value != null);
    return average(values) ?? targetRpe;
  }, [exercises, targetRpe]);
  const currentRpe = kind === "lift" ? liftRpe : effort;
  const dosePercent = liveDosePercent(kind, elapsed, targetDuration, targetRpe, currentRpe, doneSets, totalSets);
  const liveStatus = sessionStatus(dosePercent);
  const currentLoad = Math.round((elapsed / 60) * currentRpe);
  const targetLoad = Math.round(targetDuration * targetRpe);
  const smartFinish = Boolean(startedAt && (dosePercent >= 92 || (kind === "lift" && totalSets > 0 && doneSets >= totalSets)));
  const quality = sessionQualityScore(dosePercent, currentRpe, targetRpe, discomfort, smartFinish);
  const recovery = recoveryEstimate(kind, dosePercent, advanced);
  const recoveryExposure = kind === "recovery" || kind === "pool" ? Math.min(100, Math.round((elapsed / Math.max(60, targetDuration * 60)) * 70 + recoveryModalities.length * 8)) : 0;

  useEffect(() => {
    if (!startedAt || dosePercent < 90 || targetReachedRef.current) return;
    targetReachedRef.current = true;
    setTimeline((current) => [...current, { id: uid("event"), elapsedSeconds: elapsed, label: "Productive dose reached", detail: "You are inside the planned training-dose window. Finishing here is a valid high-quality outcome.", tone: "good" }]);
  }, [startedAt, dosePercent, elapsed]);
  useEffect(() => {
    if (!startedAt || dosePercent < 112 || overTargetRef.current) return;
    overTargetRef.current = true;
    setTimeline((current) => [...current, { id: uid("event"), elapsedSeconds: elapsed, label: "Dose above target", detail: "More work is now adding fatigue faster than it adds adherence to today's plan.", tone: "warn" }]);
  }, [startedAt, dosePercent, elapsed]);

  function logEvent(label: string, detail: string, tone: LiveTimelineEvent["tone"] = "neutral") {
    setTimeline((current) => [...current, { id: uid("event"), elapsedSeconds: elapsed, label, detail, tone }]);
  }
  function makeExercises(scale: number) {
    const routine = routines.find((item) => item.id === routineId) ?? routines[0] ?? defaultRoutines[0];
    return routine.exerciseIds.map((id) => definitionFor(id, customExercises)).filter((item): item is ExerciseDefinition => Boolean(item)).map((definition) => makeLiveExercise(definition, history, scale));
  }
  function startSession() {
    if (kind === "rest") return;
    const now = new Date().toISOString();
    const safeDuration = clampLiveDuration(targetDuration, originalDuration);
    const safeRpe = clampLiveRpe(targetRpe, originalRpe);
    if (kind === "lift" && !exercises.length) {
      const scale = overrideMode === "coach" ? prescription.volumeScale : 1;
      setExercises(makeExercises(scale));
      if (routineId) localStorage.setItem(ACTIVE_ROUTINE_KEY, routineId);
    }
    const nextSessionId = uid("live");
    setSessionId(nextSessionId); setTargetDuration(safeDuration); setTargetRpe(safeRpe); setStartedAt(now); setPausedAt(null); setTotalPausedSeconds(0); setElapsed(0); setRestRemaining(0); setFinished(null); setDiscardArmed(false);
    setBranch("normal"); branchRef.current = "normal"; setDiscomfort(null); setDiscomfortAdjusted(false); discomfortAdjustedRef.current = false; setReadinessDrift("same"); readinessDriftRef.current = "same";
    finishingRef.current = false; targetReachedRef.current = false; overTargetRef.current = false;
    const modeLabel = overrideMode === "coach" ? "Coach prescription" : overrideMode === "original" ? "Original plan" : "Custom target";
    setTimeline([{ id: uid("event"), elapsedSeconds: 0, label: "Session started", detail: `${modeLabel} · ${safeDuration} min · RPE ${safeRpe}`, tone: "good" }]);
    setNotice("Live Training OS is running.");
  }
  function togglePause() {
    if (!startedAt) return;
    if (pausedAt) {
      const added = Math.max(0, Math.floor((Date.now() - new Date(pausedAt).getTime()) / 1000));
      setTotalPausedSeconds((value) => value + added); setPausedAt(null); logEvent("Session resumed", "Live dose and rest timers resumed.");
    } else { setPausedAt(new Date().toISOString()); logEvent("Session paused", "Workout and rest timers are frozen."); }
  }
  function cancelSession() {
    if (!discardArmed) { setDiscardArmed(true); setNotice("Tap Discard again to permanently remove this unsaved live session."); return; }
    localStorage.removeItem(LIVE_SESSION_KEY); setSessionId(null); setStartedAt(null); setPausedAt(null); setTotalPausedSeconds(0); setElapsed(0); setRestRemaining(0); setTimeline([]); setExercises([]); setFinished(null); setDiscardArmed(false); finishingRef.current = false; setNotice("Live session discarded. No history entry was created.");
  }
  function updateSet(exerciseId: string, setId: string, field: "weight" | "reps" | "rir", value: string) {
    setExercises((current) => current.map((exercise) => exercise.id !== exerciseId ? exercise : { ...exercise, sets: exercise.sets.map((set) => set.id !== setId ? set : { ...set, [field]: value === "" ? null : Number(value) }) }));
  }
  function toggleSet(exerciseIndex: number, setId: string) {
    const exercise = exercises[exerciseIndex]; const target = exercise?.sets.find((set) => set.id === setId); if (!exercise || !target) return;
    const completing = !target.done;
    if (completing && (target.weight == null || !Number.isFinite(Number(target.weight)) || Number(target.weight) < 0 || target.reps == null || !Number.isFinite(Number(target.reps)) || Number(target.reps) <= 0 || (target.rir != null && (!Number.isFinite(Number(target.rir)) || Number(target.rir) < 0 || Number(target.rir) > 6)))) {
      setNotice("Enter a valid weight and at least 1 rep before completing the set. RIR must be 0–6 when entered.");
      return;
    }
    setExercises((current) => current.map((item, index) => index !== exerciseIndex ? item : { ...item, sets: item.sets.map((set) => set.id === setId ? { ...set, done: !set.done } : set) }));
    if (completing) {
      setNotice("");
      const effortRir = target.rir;
      const rest = smartRestSeconds(exercise, effortRir);
      setRestRemaining(rest);
      logEvent(`${exercise.name} set completed`, `${target.weight ?? "—"} lb × ${target.reps ?? "—"}${target.rir == null ? "" : ` · ${target.rir} RIR`} · ${Math.round(rest / 15) * 15}s rest`, target.rir != null && target.rir <= 1 ? "warn" : "neutral");
    }
  }
  function applyNextSet(exerciseIndex: number) {
    const exercise = exercises[exerciseIndex]; if (!exercise) return;
    const cue = nextSetRecommendation(exercise, targetRpe);
    if (cue.weight == null) return;
    const weight = cue.weight; const next = exercise.sets.find((set) => !set.done); if (!next) return;
    setExercises((current) => current.map((item, index) => index !== exerciseIndex ? item : { ...item, sets: item.sets.map((set) => set.id === next.id ? { ...set, weight } : set) }));
    setRestRemaining(cue.restSeconds);
  }
  function skipExercise(index: number) {
    const exercise = exercises[index]; if (!exercise) return;
    setExercises((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, skipped: true } : item));
    logEvent("Exercise skipped", `${exercise.name} removed from today's remaining dose.`, "warn");
  }
  function substitute(index: number, definition: ExerciseDefinition) {
    const old = exercises[index]; if (!old) return;
    const completedCount = completedPerformance(old).length;
    const remainingCount = Math.max(0, old.sets.length - completedCount);
    if (!remainingCount) { setNotice(`${old.name} is already complete; there is no remaining work to substitute.`); return; }
    const replacement = makeLiveExercise(definition, history, 1);
    const desiredSets = Array.from({ length: remainingCount }, (_, setIndex) => replacement.sets[setIndex] ?? { id: uid(`${definition.id}-set`), weight: replacement.sets.at(-1)?.weight ?? definition.fallbackWeight, reps: null, rir: null, done: false });
    const resized = { ...replacement, sets: desiredSets };
    setExercises((current) => {
      if (!completedCount) return current.map((item, itemIndex) => itemIndex === index ? resized : item);
      const next = [...current];
      next[index] = { ...old, skipped: true };
      next.splice(index + 1, 0, resized);
      return next;
    });
    logEvent("Exercise substituted", completedCount ? `${old.name} completed work preserved; remaining sets moved to ${definition.name}.` : `${old.name} → ${definition.name}. Same-muscle replacement used to preserve the session goal.`);
  }
  function applyBranch(next: BranchMode) {
    if (branchRef.current === next) { setNotice(`The ${next} branch is already active.`); return; }
    branchRef.current = next; setBranch(next);
    if (next === "normal") { logEvent("Branch selected", "Continue the live session without additional reductions."); return; }
    if (next === "reduced accessories") {
      setTargetDuration((value) => Math.max(10, Math.round(value * 0.82)));
      setTargetRpe((value) => Math.max(4, value - 0.5));
      setExercises((current) => {
        const cutoff = Math.max(1, Math.ceil(current.length * 0.7));
        return current.map((item, index) => index >= cutoff && !item.sets.some((set) => set.done) ? { ...item, skipped: true } : item);
      });
      logEvent("Volume branch applied", "Accessory volume reduced while preserving the main work.", "warn");
    } else {
      const elapsedMin = Math.ceil(elapsed / 60);
      setTargetDuration(Math.max(10, elapsedMin + 10)); setTargetRpe((value) => Math.min(4.5, value));
      setExercises((current) => {
        let kept = false;
        return current.map((item) => {
          if (item.sets.some((set) => set.done)) return item;
          if (!kept) { kept = true; return item; }
          return { ...item, skipped: true };
        });
      });
      logEvent("Recovery finish selected", "Remaining work compressed to a low-stress finish.", "warn");
    }
  }
  function logDiscomfort(value: LiveDiscomfort) {
    if (discomfort === value) return;
    setDiscomfort(value); setDiscomfortAdjusted(false); discomfortAdjustedRef.current = false; logEvent("Discomfort logged", `${value} discomfort noted. The app will offer training modifications only; it is not diagnosing an injury.`, value === "joint" ? "stop" : "warn");
  }
  function discomfortReduce() {
    if (discomfortAdjustedRef.current) { setNotice("The discomfort reduction is already applied."); return; }
    discomfortAdjustedRef.current = true; setDiscomfortAdjusted(true);
    setTargetDuration((value) => Math.max(10, Math.round(value * 0.8))); setTargetRpe((value) => Math.max(3, value - 1)); logEvent("Discomfort adjustment", "Remaining duration and intensity target reduced once for this discomfort flag.", "warn");
  }
  function discomfortSkipNext() {
    const index = exercises.findIndex((exercise) => !exercise.skipped && !exercise.sets.every((set) => set.done)); if (index >= 0) skipExercise(index);
  }
  function changeReadinessDrift(value: ReadinessDrift) {
    if (readinessDriftRef.current === value) return;
    readinessDriftRef.current = value; setReadinessDrift(value);
    if (value === "worse") {
      const elapsedMin = Math.ceil(elapsed / 60); setTargetRpe((current) => Math.max(3, current - 0.5)); setTargetDuration((current) => Math.max(elapsedMin + 8, Math.round(current * 0.9)));
      logEvent("Readiness drifted down", "Remaining prescription reduced slightly because the session feels worse than it did at the start.", "warn");
    } else if (value === "better") logEvent("Readiness improved", "You feel better than at session start. Targets stay controlled; no automatic intensity jump was added.", "good");
    else logEvent("Readiness stable", "In-session readiness is tracking as expected.");
  }
  function addInterval() {
    const split = Math.max(1, Number(intervalSplitInput || 0));
    const pace = intervalPaceSignal(split, intervalSplits);
    setIntervalSplits((current) => [...current, split]);
    logEvent(`Interval ${intervalSplits.length + 1}/${intervalTarget}`, `${intervalDistance} m · ${formatClock(split)}. ${pace.detail}`, pace.tone);
  }
  function toggleRecoveryModality(value: string) {
    setRecoveryModalities((current) => current.includes(value) ? current.filter((item) => item !== value) : [...current, value]);
  }

  function finishSession() {
    if (!startedAt || !sessionId || finishingRef.current || finished) return;
    if (kind === "lift" && !doneSets) { setNotice("Complete at least one valid lifting set before finishing."); return; }
    finishingRef.current = true;
    const durationSeconds = Math.max(60, elapsedSeconds(startedAt, pausedAt, totalPausedSeconds));
    const prs: string[] = [];
    try {
      if (kind === "lift") {
        for (const exercise of exercises) {
          const completed = completedPerformance(exercise); if (!completed.length) continue;
          const currentBest = Math.max(...completed.map((set) => estimateOneRepMax(set.weight, set.reps)), 0);
          const priorBest = historicalBestE1rm(history, exercise.id);
          if (priorBest > 0 && currentBest > priorBest + 0.5) prs.push(`${exercise.name}: e1RM ${Math.round(currentBest)} lb`);
        }
        const note = generatedSessionNote({ kind, dosePercent, currentRpe, targetRpe, branch, prCount: prs.length, discomfort });
        const completedRirs = exercises.flatMap((exercise) => completedPerformance(exercise).map((set) => set.rir).filter((value): value is number => value != null));
        const item: WorkoutHistoryItem = {
          id: `workout-${sessionId}`, routineId: activeRoutine.id, name: activeRoutine.name, completedAt: new Date().toISOString(), durationSeconds,
          totalVolume: Math.round(exercises.reduce((sum, exercise) => sum + completedPerformance(exercise).reduce((sub, set) => sub + set.weight * set.reps, 0), 0)),
          completedSets: doneSets, averageRir: average(completedRirs), prs,
          exercises: exercises.map((exercise) => ({ id: exercise.id, name: exercise.name, repMin: exercise.repMin, repMax: exercise.repMax, increment: exercise.increment, sets: completedPerformance(exercise).map((set) => ({ weight: set.weight, reps: set.reps, rir: set.rir, estimated1RM: estimateOneRepMax(set.weight, set.reps) })) })).filter((exercise) => exercise.sets.length),
          sessionNote: `${note} Live Training OS quality ${quality}/100. Coach target ${targetDuration} min @ RPE ${targetRpe}.`,
        };
        const next = [item, ...history.filter((existing) => existing.id !== item.id)].slice(0, 150); localStorage.setItem(HISTORY_KEY, JSON.stringify(next)); setHistory(next);
        const summary = item.sessionNote ?? note; setFinished({ quality, note: summary, recovery: recovery.label, prs });
      } else if (kind !== "rest") {
        const hybridKind = kind as HybridSessionKind;
        const note = generatedSessionNote({ kind, dosePercent, currentRpe, targetRpe, branch, prCount: 0, discomfort });
        const intervalText = intervalSplits.length ? ` Intervals: ${intervalSplits.map((split) => formatClock(split)).join(", ")}.` : "";
        const recoveryText = recoveryModalities.length ? ` Recovery modalities: ${recoveryModalities.join(", ")}.` : "";
        saveHybridSession({ id: `hybrid-${sessionId}`, kind: hybridKind, title: `${title} · ${subtype}`, completedAt: new Date().toISOString(), durationMinutes: Math.max(1, Math.round(durationSeconds / 60)), effort: Math.max(1, Math.min(10, Math.round(effort))), notes: `${note}${intervalText}${recoveryText} Live Training OS quality ${quality}/100.`, distanceKm: kind === "run" ? distanceKm : null, elevationFeet: kind === "conditioning" ? elevationFeet : null, laps: kind === "pool" ? laps : null, poolMeters: kind === "pool" ? poolMeters : null, rounds: kind === "conditioning" ? rounds : null });
        setHybrid(readHybridSessions()); setFinished({ quality, note: `${note}${intervalText}${recoveryText}`, recovery: recovery.label, prs: [] });
      }
      localStorage.removeItem(LIVE_SESSION_KEY);
      setStartedAt(null); setPausedAt(null); setRestRemaining(0); setDiscardArmed(false);
    } catch (error) {
      finishingRef.current = false;
      setNotice(error instanceof Error ? `Could not save the session: ${error.message}` : "Could not save the session safely.");
    }
  }

  if (!hydrated) return <main className="live-shell"><p className="live-loading">Loading Live Training OS…</p></main>;

  if (kind === "rest" && !startedAt) return <main className="live-shell"><header className="live-topbar"><div><p className="ti-eyebrow">LIVE TRAINING OS · V1.9.5</p><h1>Recovery day</h1><p>The weekly plan marks today as rest. There is no training dose to chase.</p></div><a className="ti-secondary" href="/">Today</a></header><section className="live-card"><h2>Protect the recovery slot</h2><p>If you want active recovery instead, change today to Pool or Recovery in the weekly plan, or open a recovery session manually.</p><div className="live-actions"><a className="ti-primary" href="/plan">Edit weekly plan</a><a className="ti-secondary" href="/live?kind=recovery&title=Recovery">Start recovery session</a></div></section></main>;

  return (
    <main className={`live-shell ${startedAt ? "is-live" : ""} ${pausedAt ? "is-paused" : ""}`}>
      <header className="live-topbar">
        <div><p className="ti-eyebrow">LIVE TRAINING OS · V1.9.5</p><h1>{title}</h1><p>{startedAt ? "The coach is tracking dose, fatigue, execution, and live adjustments." : "Plan → intelligence → prescription → live execution → outcome."}</p></div>
        <div className="live-top-actions"><a className="ti-secondary" href="/coach">Coach</a><a className="ti-secondary" href="/">Today</a></div>
      </header>

      {!startedAt && !finished && <>
        <section className={`live-prescription live-signal-${refined.signal}`}>
          <div><span>PRE-WORKOUT CALL · {refined.signal.toUpperCase()}</span><h2>{refined.label}</h2><p>{refined.reason}</p></div>
          <div className="live-prescription-target"><strong>{prescription.coachDuration} min · RPE {prescription.coachRpe}</strong><small>Original: {prescription.originalDuration} min · RPE {prescription.originalRpe}</small></div>
        </section>
        <section className="live-pre-grid">
          <article className="live-card"><p className="ti-eyebrow">TODAY'S JOB</p><h2>{prescription.focus}</h2><p><strong>Avoid:</strong> {prescription.avoid}</p><div className="live-signal-list">{refined.factors.slice(-6).map((factor) => <span key={factor}>{factor}</span>)}</div></article>
          <article className="live-card"><p className="ti-eyebrow">EXECUTION MODE</p><h2>You control the final call</h2><div className="live-mode-buttons">{(["coach", "original", "custom"] as LiveOverrideMode[]).map((mode) => <button className={overrideMode === mode ? "active" : ""} key={mode} onClick={() => setOverrideMode(mode)}>{mode === "coach" ? "Follow Coach Plan" : mode === "original" ? "Use Original Plan" : "Custom Adjust"}</button>)}</div>{overrideMode === "custom" && <div className="live-target-edit"><label>Minutes<input type="number" min="5" max="300" value={targetDuration} onChange={(event) => setTargetDuration(Number(event.target.value))}/></label><label>RPE<input type="number" min="1" max="10" step="0.5" value={targetRpe} onChange={(event) => setTargetRpe(Number(event.target.value))}/></label></div>}</article>
        </section>
        <section className="live-card live-session-setup"><div><p className="ti-eyebrow">SESSION SETUP</p><h2>{kind === "lift" ? activeRoutine.name : subtype}</h2></div>{kind === "lift" ? <label>Routine<select value={routineId ?? ""} onChange={(event) => setRoutineId(event.target.value)}>{routines.map((routine) => <option key={routine.id} value={routine.id}>{routine.name}</option>)}</select></label> : <label>Session style<select value={subtype} onChange={(event) => setSubtype(event.target.value)}>{subtypeOptions(kind).map((item) => <option key={item}>{item}</option>)}</select></label>}<button className="ti-primary live-start" onClick={startSession}>▶ Start Live Training</button></section>
      </>}

      {startedAt && !finished && <>
        <section className={`live-hud live-tone-${liveStatus.tone}`}>
          <div className="live-clock"><span>{pausedAt ? "PAUSED" : "LIVE"}</span><strong>{formatClock(elapsed)}</strong><small>{wakeLockActive ? "Screen awake · " : ""}{liveStatus.label}</small></div>
          <div className="live-dose"><div><span>Recommended dose</span><strong>{dosePercent}%</strong></div><div className="live-dose-track"><i style={{ width: `${Math.min(100, dosePercent)}%` }}/></div><small>{currentLoad}/{targetLoad} session-RPE points · RPE {currentRpe.toFixed(1)}/{targetRpe}</small></div>
          <div className="live-hud-actions"><button onClick={togglePause}>{pausedAt ? "▶ Resume" : "Ⅱ Pause"}</button><button className={smartFinish ? "finish-ready" : ""} onClick={finishSession}>{smartFinish ? "✓ Finish — dose reached" : "Finish session"}</button></div>
        </section>

        {smartFinish && <section className="live-finish-call"><div><span>SMART FINISH</span><strong>Today's productive dose has been reached.</strong><small>Stopping now can score higher than adding fatigue beyond the session goal.</small></div><div><button onClick={finishSession}>Finish workout</button><button onClick={() => logEvent("Manual continuation", "You chose to continue after the productive-dose prompt.")}>Continue manually</button></div></section>}

        <section className="live-kpis"><div><span>Quality</span><strong>{quality}/100</strong><small>More is not automatically better</small></div><div><span>Target</span><strong>{targetDuration}m · {targetRpe}</strong><small>Current live prescription</small></div><div><span>Recovery</span><strong>{recovery.label}</strong><small>Heuristic estimate</small></div><div><span>Recovery debt</span><strong>{advanced.recoveryDebtScore}/100</strong><small>{advanced.recoveryDebtLabel}</small></div></section>

        <section className="live-two-col">
          <article className="live-card"><p className="ti-eyebrow">LIVE READINESS DRIFT</p><h2>How do you feel now?</h2><div className="live-segments">{(["better", "same", "worse"] as ReadinessDrift[]).map((value) => <button className={readinessDrift === value ? "active" : ""} key={value} onClick={() => changeReadinessDrift(value)}>{value === "better" ? "↑ Better" : value === "worse" ? "↓ Worse" : "Same"}</button>)}</div></article>
          <article className="live-card"><p className="ti-eyebrow">DISCOMFORT BRANCH</p><h2>Modify, don't diagnose</h2><div className="live-discomfort">{(["joint", "muscle", "cramp", "technique", "other"] as LiveDiscomfort[]).map((value) => <button className={discomfort === value ? "active" : ""} key={value} onClick={() => logDiscomfort(value)}>{value}</button>)}</div>{discomfort && <div className="live-branch-actions"><button disabled={discomfortAdjusted} onClick={discomfortReduce}>{discomfortAdjusted ? "Dose reduction applied" : "Reduce load/dose"}</button>{kind === "lift" && <button onClick={discomfortSkipNext}>Skip next movement</button>}<button onClick={() => applyBranch("recovery finish")}>Recovery finish</button><button onClick={finishSession}>End session</button></div>}</article>
        </section>

        {kind === "lift" ? <>
          <section className="live-branch-bar"><div><span>DYNAMIC SESSION BRANCH</span><strong>{branch}</strong></div><button onClick={() => applyBranch("normal")}>Continue</button><button onClick={() => applyBranch("reduced accessories")}>Reduce accessories</button><button onClick={() => applyBranch("recovery finish")}>Recovery finish</button></section>
          <section className="live-exercise-stack">
            {exercises.map((exercise, exerciseIndex) => {
              const cue = nextSetRecommendation(exercise, targetRpe);
              const substitutions = substitutionOptions(exercise.id, customExercises);
              const priorBest = historicalBestE1rm(history, exercise.id);
              const nextSet = exercise.sets.find((set) => !set.done);
              const potential = nextSet?.weight && exercise.repMax ? estimateOneRepMax(nextSet.weight, exercise.repMax) : 0;
              const prWindow = priorBest > 0 && potential >= priorBest * 0.99 && refined.signal !== "recover" && advanced.recoveryDebtScore < 60;
              return <article className={`live-exercise ${exercise.skipped ? "is-skipped" : ""}`} key={`${exercise.id}-${exerciseIndex}`}>
                <div className="live-exercise-head"><div><span>{exercise.muscle.toUpperCase()} · {exercise.repMin}–{exercise.repMax}</span><h2>{exercise.name}</h2><small>{exercise.sets.filter((set) => set.done).length}/{exercise.sets.length} working sets</small></div><div className="live-exercise-badges">{prWindow && <b>🏆 PR WINDOW</b>}{exercise.skipped && <b>SKIPPED</b>}</div></div>
                {!exercise.skipped && <>
                  <div className="live-next-set"><span>AUTO-REGULATED NEXT SET</span><strong>{cue.label}</strong><small>{cue.target}</small><button onClick={() => applyNextSet(exerciseIndex)}>Apply recommendation</button></div>
                  <div className="live-set-table"><div className="live-set-row live-set-header"><span>Set</span><span>lb</span><span>reps</span><span>RIR</span><span>done</span></div>{exercise.sets.map((set, setIndex) => <div className={`live-set-row ${set.done ? "done" : ""}`} key={set.id}><span>{setIndex + 1}</span><input type="number" inputMode="decimal" value={set.weight ?? ""} onChange={(event) => updateSet(exercise.id, set.id, "weight", event.target.value)}/><input type="number" inputMode="numeric" value={set.reps ?? ""} onChange={(event) => updateSet(exercise.id, set.id, "reps", event.target.value)}/><input type="number" inputMode="decimal" min="0" max="6" value={set.rir ?? ""} onChange={(event) => updateSet(exercise.id, set.id, "rir", event.target.value)}/><button onClick={() => toggleSet(exerciseIndex, set.id)}>{set.done ? "✓" : "○"}</button></div>)}</div>
                  <details className="live-substitute"><summary>Replace / skip exercise</summary><div>{substitutions.map((item) => <button key={item.definition.id} onClick={() => substitute(exerciseIndex, item.definition)}><span><strong>{item.definition.name}</strong><small>{item.definition.muscle} · {item.score}% movement match</small></span><b>Use</b></button>)}<button className="live-skip" onClick={() => skipExercise(exerciseIndex)}>Skip {exercise.name} today</button></div></details>
                </>}
              </article>;
            })}
          </section>
          <section className={`live-rest ${restRemaining ? "active" : ""}`}><div><span>SMART REST</span><strong>{restRemaining ? formatClock(restRemaining) : "Ready"}</strong><small>Rest adapts to exercise type and the RIR you just logged.</small></div><div>{restRemaining > 0 && <><button onClick={() => setRestRemaining((value) => value + 30)}>+30s</button><button onClick={() => setRestRemaining(0)}>Skip</button></>}</div></section>
        </> : <section className="live-card live-hybrid-console">
          <div className="live-hybrid-head"><div><p className="ti-eyebrow">LIVE {kind.toUpperCase()}</p><h2>{subtype}</h2></div><label>Style<select value={subtype} onChange={(event) => setSubtype(event.target.value)}>{subtypeOptions(kind).map((item) => <option key={item}>{item}</option>)}</select></label></div>
          <label className="live-range">Live RPE · {effort}/10<input type="range" min="1" max="10" value={effort} onChange={(event) => setEffort(Number(event.target.value))}/></label>
          {kind === "run" && <div className="live-metric-grid"><label>Distance km<input type="number" step="0.01" inputMode="decimal" value={distanceKm || ""} onChange={(event) => setDistanceKm(Number(event.target.value || 0))}/></label><div><span>Live pace</span><strong>{paceLabel(distanceKm, elapsed)}</strong><small>Manual-distance pace</small></div>{subtype === "Intervals" && <><label>Target reps<input type="number" min="1" max="30" value={intervalTarget} onChange={(event) => setIntervalTarget(Number(event.target.value))}/></label><label>Rep distance m<input type="number" min="50" step="50" value={intervalDistance} onChange={(event) => setIntervalDistance(Number(event.target.value))}/></label><label>Latest split sec<input type="number" min="1" value={intervalSplitInput} onChange={(event) => setIntervalSplitInput(Number(event.target.value))}/></label><button className="live-interval-button" onClick={addInterval}>+ Complete interval {intervalSplits.length + 1}/{intervalTarget}</button><div className="live-splits"><span>Splits</span><strong>{intervalSplits.length ? intervalSplits.map((split) => formatClock(split)).join(" · ") : "None yet"}</strong></div></>}</div>}
          {kind === "conditioning" && <div className="live-metric-grid"><label>Climb / vertical ft<input type="number" min="0" value={elevationFeet || ""} onChange={(event) => setElevationFeet(Number(event.target.value || 0))}/></label><label>Rounds / efforts<input type="number" min="0" value={rounds || ""} onChange={(event) => setRounds(Number(event.target.value || 0))}/></label><div><span>Target status</span><strong>{dosePercent >= 90 ? "Dose reached" : `${Math.max(0, 90 - dosePercent)}% to target window`}</strong><small>{subtype === "Jacob's Ladder" ? `${elevationFeet.toLocaleString()} ft climbed` : `${rounds} efforts logged`}</small></div></div>}
          {kind === "pool" && <div className="live-metric-grid"><label>Laps<input type="number" min="0" value={laps || ""} onChange={(event) => setLaps(Number(event.target.value || 0))}/></label><label>Distance m<input type="number" min="0" step="25" value={poolMeters || ""} onChange={(event) => setPoolMeters(Number(event.target.value || 0))}/></label><div><span>Recovery exposure</span><strong>{recoveryExposure}/100</strong><small>Separate from training stress</small></div></div>}
          {(kind === "pool" || kind === "recovery") && <div className="live-recovery-options"><span>Recovery modalities</span><div>{recoveryOptions.map((item) => <button className={recoveryModalities.includes(item) ? "active" : ""} key={item} onClick={() => toggleRecoveryModality(item)}>{item}</button>)}</div><small>Recovery exposure is tracked separately; sauna/steam/hot-tub minutes do not inflate training load.</small></div>}
        </section>}

        <section className="live-card live-timeline"><div className="live-section-head"><div><p className="ti-eyebrow">COACH TIMELINE</p><h2>Why the session changed</h2></div><span>{timeline.length} events</span></div>{timeline.length ? <div>{timeline.map((event) => <article className={`tone-${event.tone}`} key={event.id}><time>{formatClock(event.elapsedSeconds)}</time><span><strong>{event.label}</strong><small>{event.detail}</small></span></article>)}</div> : <p>No live events yet.</p>}</section>
        <div className="live-bottom-actions"><button className="ti-secondary" onClick={cancelSession}>{discardArmed ? "Confirm discard" : "Discard session"}</button><button className="ti-primary" onClick={finishSession}>{smartFinish ? "Finish at productive dose" : "Complete session"}</button></div>
      </>}

      {finished && <section className="live-finished"><p className="ti-eyebrow">SESSION COMPLETE</p><h2>{finished.quality}/100 session quality</h2><p>{finished.note}</p><div className="live-finished-grid"><div><span>Estimated recovery</span><strong>{finished.recovery}</strong><small>Coaching heuristic, not a medical measurement</small></div><div><span>PR signals</span><strong>{finished.prs.length}</strong><small>{finished.prs.join(" · ") || "No PR signal required for a good session"}</small></div></div><div className="live-actions"><a className="ti-primary" href="/history">View saved session</a><a className="ti-secondary" href="/coach">See updated coach</a><a className="ti-secondary" href="/">Back to Today</a></div></section>}
      {notice && <div className="live-notice">{notice}</div>}
    </main>
  );
}
