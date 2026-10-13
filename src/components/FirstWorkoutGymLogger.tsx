"use client";

import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import {
  defaultRoutines,
  exerciseLibrary,
  type ExerciseDefinition,
  type MuscleGroup,
  type RoutineDefinition,
} from "../data/training";
import {
  averageRir,
  bestEstimatedOneRepMax,
  estimateOneRepMax,
  progressionDecision,
  type PerformanceSet,
  type ProgressionAction,
} from "../lib/progression";
import { READINESS_KEY, safeArray, type ReadinessRecord } from "../lib/trainingIntelligence";
import {
  Badge,
  Button,
  Card,
  Chip,
  ChipRow,
  EmptyState,
  Field,
  IconButton,
  ListRow,
  PageHeader,
  PageShell,
  ProgressBar,
  SectionHeader,
  SelectInput,
  Sheet,
  Stat,
  StatGrid,
  Stepper,
  TextAreaInput,
  TextInput,
  TimerFace,
} from "../ui";
import {
  beatLastTimeTarget,
  completedWorkoutComparison,
  liveMatchedDelta,
  nextSetCue,
  previousWorkoutForRoutine,
  readinessForToday,
  readinessGuidance,
  recentExerciseHistory,
} from "../lib/workoutFlow";

type SetType = "working" | "warmup" | "backoff" | "drop" | "failure";
type Panel = "exercise" | "custom" | "plate" | "warmup" | null;

type GymSet = {
  id: string;
  weight: number | null;
  reps: number | null;
  rir: number | null;
  completed: boolean;
  type: SetType;
};

type PreviousSet = { weight: number; reps: number; rir?: number | null };

type GymExercise = {
  id: string;
  sourceId?: string;
  name: string;
  muscle: MuscleGroup;
  repMin: number;
  repMax: number;
  increment: number;
  fallbackWeight: number;
  previous: PreviousSet[];
  suggestedWeights: number[];
  recommendation: string;
  progressionAction: ProgressionAction;
  note: string;
  restSeconds: number;
  supersetGroup?: string;
  sets: GymSet[];
};

type HistorySet = {
  weight: number;
  reps: number;
  rir?: number | null;
  estimated1RM?: number;
};

type HistoryExercise = {
  id: string;
  name: string;
  repMin: number;
  repMax: number;
  increment: number;
  sets: HistorySet[];
};

type HistoryItem = {
  id: string;
  routineId?: string;
  name: string;
  completedAt: string;
  durationSeconds: number;
  totalVolume: number;
  completedSets: number;
  averageRir?: number | null;
  prs?: string[];
  exercises: HistoryExercise[];
  v07Details?: unknown;
  sessionNote?: string;
  pausedSeconds?: number;
};

type StoredCustomExercise = ExerciseDefinition & { equipment?: string };
type NotesMap = Record<string, string>;
type RestMap = Record<string, number>;
type ExtraMap = Record<string, string[]>;

type SessionDraft = {
  exercises: GymExercise[];
  startedAt: string | null;
  sessionActive?: boolean;
  pausedAt?: string | null;
  totalPausedSeconds?: number;
  restRemaining?: number;
  sessionNote?: string;
  collapsed?: Record<string, boolean>;
};

type DraftMap = Record<string, SessionDraft>;

type UndoState = {
  label: string;
  exercises: GymExercise[];
  extras?: ExtraMap;
  restRemaining: number;
};

type WorkoutSummary = {
  name: string;
  sets: number;
  volume: number;
  duration: number;
  prs: string[];
  nextTarget?: string;
  comparison?: string[];
};

type WakeSentinel = { release(): Promise<void> };

const HISTORY_KEY = "workout-tracker:v0.2:history";
const ROUTINES_KEY = "workout-tracker:v0.4:routines";
const ACTIVE_ROUTINE_KEY = "workout-tracker:v0.4:active-routine";
const LEGACY_DRAFTS_KEY = "workout-tracker:v0.4:drafts";
const CUSTOM_KEY = "workout-tracker:v0.7:custom-exercises";
const NOTES_KEY = "workout-tracker:v0.7:exercise-notes";
const REST_KEY = "workout-tracker:v0.7:rest-seconds";
const EXTRAS_KEY = "workout-tracker:v0.7:routine-extras";
const DRAFTS_KEY = "workout-tracker:v0.7:drafts";
const REST_SOUND_KEY = "workout-tracker:v1.2:rest-sound";

const muscleOptions: MuscleGroup[] = [
  "Chest",
  "Back",
  "Shoulders",
  "Biceps",
  "Triceps",
  "Quads",
  "Hamstrings",
  "Glutes",
  "Calves",
];

const setTypes: Array<{ value: SetType; label: string }> = [
  { value: "working", label: "Work" },
  { value: "warmup", label: "Warm" },
  { value: "backoff", label: "Back" },
  { value: "drop", label: "Drop" },
  { value: "failure", label: "Fail" },
];

function readJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function uid(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

function definitionFor(id: string, custom: StoredCustomExercise[]) {
  return exerciseLibrary.find((exercise) => exercise.id === id) ?? custom.find((exercise) => exercise.id === id) ?? null;
}

function workingPerformance(sets: GymSet[]): PerformanceSet[] {
  return sets
    .filter(
      (set) =>
        set.type === "working" &&
        set.completed &&
        set.weight != null &&
        set.reps != null &&
        set.reps > 0,
    )
    .map((set) => ({ weight: set.weight as number, reps: set.reps as number, rir: set.rir }));
}

function latestSets(history: HistoryItem[], exerciseId: string): PreviousSet[] {
  for (const workout of history) {
    const exercise = workout.exercises?.find((item) => item.id === exerciseId);
    if (exercise?.sets?.length) {
      return exercise.sets.map((set) => ({
        weight: Number(set.weight),
        reps: Number(set.reps),
        rir: set.rir ?? null,
      }));
    }
  }
  return [];
}

function defaultRest(definition: ExerciseDefinition) {
  if (definition.repMin <= 6) return 180;
  if (["Quads", "Hamstrings", "Glutes", "Back", "Chest"].includes(definition.muscle)) return 120;
  return 90;
}

function makeExercise(
  definition: ExerciseDefinition,
  history: HistoryItem[],
  notes: NotesMap,
  rests: RestMap,
): GymExercise {
  const fromHistory = latestSets(history, definition.id);
  const previous = fromHistory.length ? fromHistory : definition.seedPrevious ?? [];
  const decision = progressionDecision(
    previous,
    definition.repMin,
    definition.repMax,
    definition.increment,
    definition.fallbackWeight,
    definition.setCount,
  );

  return {
    id: definition.id,
    name: definition.name,
    muscle: definition.muscle,
    repMin: definition.repMin,
    repMax: definition.repMax,
    increment: definition.increment,
    fallbackWeight: definition.fallbackWeight,
    previous,
    suggestedWeights: decision.suggestedWeights,
    recommendation: decision.reason,
    progressionAction: decision.action,
    note: notes[definition.id] ?? "",
    restSeconds: rests[definition.id] ?? defaultRest(definition),
    sets: Array.from({ length: definition.setCount }, (_, index) => ({
      id: uid(`${definition.id}-${index + 1}`),
      weight: decision.suggestedWeights[index] ?? definition.fallbackWeight ?? null,
      reps: null,
      rir: null,
      completed: false,
      type: "working" as SetType,
    })),
  };
}

function migrateExercise(
  saved: Partial<GymExercise> & { id: string; sets?: Array<Partial<GymSet>> },
  history: HistoryItem[],
  custom: StoredCustomExercise[],
  notes: NotesMap,
  rests: RestMap,
): GymExercise | null {
  const definition = definitionFor(saved.id, custom);
  if (!definition) return null;
  const fresh = makeExercise(definition, history, notes, rests);
  return {
    ...fresh,
    sourceId: saved.sourceId,
    note: saved.note ?? notes[saved.id] ?? fresh.note,
    restSeconds: saved.restSeconds ?? rests[saved.id] ?? fresh.restSeconds,
    supersetGroup: saved.supersetGroup,
    sets: saved.sets?.length
      ? saved.sets.map((set, index) => ({
          id: set.id ?? uid(`${saved.id}-${index + 1}`),
          weight: set.weight ?? null,
          reps: set.reps ?? null,
          rir: set.rir ?? null,
          completed: Boolean(set.completed),
          type: set.type ?? "working",
        }))
      : fresh.sets,
  };
}

function routineIds(routine: RoutineDefinition, extras: ExtraMap) {
  return [...new Set([...routine.exerciseIds, ...(extras[routine.id] ?? [])])];
}

function makeRoutine(
  routine: RoutineDefinition,
  history: HistoryItem[],
  custom: StoredCustomExercise[],
  notes: NotesMap,
  rests: RestMap,
  extras: ExtraMap,
) {
  return routineIds(routine, extras)
    .map((id) => definitionFor(id, custom))
    .filter((definition): definition is ExerciseDefinition => Boolean(definition))
    .map((definition) => makeExercise(definition, history, notes, rests));
}

function defaultCollapsed(items: GymExercise[]) {
  return Object.fromEntries(items.map((exercise, index) => [exercise.id, index > 0]));
}

function formatDuration(totalSeconds: number) {
  const safe = Math.max(0, Math.floor(totalSeconds));
  const hours = Math.floor(safe / 3600);
  const minutes = Math.floor((safe % 3600) / 60);
  const seconds = safe % 60;
  return hours > 0
    ? `${hours}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`
    : `${minutes}:${String(seconds).padStart(2, "0")}`;
}

function actionLabel(action: ProgressionAction) {
  if (action === "increase") return "↑ Add load";
  if (action === "hold") return "Hold";
  return "Beat reps";
}

function historicalBest(history: HistoryItem[], exerciseId: string) {
  const sets = history.flatMap((workout) => {
    const exercise = workout.exercises?.find((item) => item.id === exerciseId);
    return exercise?.sets ?? [];
  });
  return bestEstimatedOneRepMax(sets);
}

function nearestFive(value: number) {
  return Math.max(0, Math.round(value / 5) * 5);
}

function plateBreakdown(target: number, bar: number) {
  const perSide = Math.max(0, (target - bar) / 2);
  const plates = [45, 35, 25, 10, 5, 2.5];
  let remaining = perSide;
  const result: Array<{ plate: number; count: number }> = [];
  for (const plate of plates) {
    const count = Math.floor((remaining + 0.001) / plate);
    if (count > 0) {
      result.push({ plate, count });
      remaining = Math.round((remaining - count * plate) * 100) / 100;
    }
  }
  return { perSide, result, remainder: remaining };
}

function elapsedSeconds(startedAt: string | null, pausedSeconds: number, pausedAt: string | null) {
  if (!startedAt) return 0;
  const start = new Date(startedAt).getTime();
  const end = pausedAt ? new Date(pausedAt).getTime() : Date.now();
  if (!Number.isFinite(start) || !Number.isFinite(end)) return 0;
  return Math.max(0, Math.floor((end - start) / 1000) - Math.max(0, Math.floor(pausedSeconds)));
}

function draftHasMeaningfulActivity(draft: Partial<SessionDraft>) {
  return Boolean(
    draft.exercises?.some((exercise) =>
      exercise.sets?.some((set) => set.completed || set.reps != null || set.rir != null),
    ),
  );
}

function draftSessionIsActive(draft: Partial<SessionDraft>) {
  const declaredActive = draft.sessionActive ?? draftHasMeaningfulActivity(draft);
  if (!declaredActive || !draft.startedAt) return false;
  const started = new Date(draft.startedAt).getTime();
  const age = Date.now() - started;
  return Number.isFinite(started) && age >= 0 && age <= 6 * 60 * 60 * 1000;
}

function previousLabel(previous?: PreviousSet) {
  if (!previous) return "—";
  return `${previous.weight}×${previous.reps}${previous.rir == null ? "" : ` @${previous.rir}`}`;
}

function playRestTone() {
  try {
    const AudioContextCtor = window.AudioContext ?? (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextCtor) return;
    const context = new AudioContextCtor();
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.frequency.value = 740;
    gain.gain.setValueAtTime(0.0001, context.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.11, context.currentTime + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + 0.18);
    oscillator.connect(gain);
    gain.connect(context.destination);
    oscillator.start();
    oscillator.stop(context.currentTime + 0.2);
    window.setTimeout(() => void context.close(), 350);
  } catch {
    // Audio is a bonus; logging must never depend on it.
  }
}

export default function FirstWorkoutGymLogger() {
  const [hydrated, setHydrated] = useState(false);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [routines, setRoutines] = useState<RoutineDefinition[]>(defaultRoutines);
  const [activeRoutineId, setActiveRoutineId] = useState("legs");
  const [customExercises, setCustomExercises] = useState<StoredCustomExercise[]>([]);
  const [notes, setNotes] = useState<NotesMap>({});
  const [rests, setRests] = useState<RestMap>({});
  const [extras, setExtras] = useState<ExtraMap>({});
  const [exercises, setExercises] = useState<GymExercise[]>([]);
  const [startedAt, setStartedAt] = useState<string | null>(null);
  const [sessionActive, setSessionActive] = useState(false);
  const [pausedAt, setPausedAt] = useState<string | null>(null);
  const [totalPausedSeconds, setTotalPausedSeconds] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const [restRemaining, setRestRemaining] = useState(0);
  const [panel, setPanel] = useState<Panel>(null);
  const [search, setSearch] = useState("");
  const [notice, setNotice] = useState("");
  const [sessionNote, setSessionNote] = useState("");
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [editingCompleted, setEditingCompleted] = useState<Record<string, boolean>>({});
  const [undo, setUndo] = useState<UndoState | null>(null);
  const [finishOpen, setFinishOpen] = useState(false);
  const [finishHolding, setFinishHolding] = useState(false);
  const [cancelArmed, setCancelArmed] = useState(false);
  const [restSound, setRestSound] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [wakeLockActive, setWakeLockActive] = useState(false);
  const [draggingExercise, setDraggingExercise] = useState<string | null>(null);
  const [lastSummary, setLastSummary] = useState<WorkoutSummary | null>(null);
  const [todayReadiness, setTodayReadiness] = useState<ReadinessRecord | null>(null);
  const [plateTarget, setPlateTarget] = useState(225);
  const [barWeight, setBarWeight] = useState(45);
  const [warmupWeight, setWarmupWeight] = useState(225);
  const [customForm, setCustomForm] = useState({
    name: "",
    muscle: "Chest" as MuscleGroup,
    repMin: "8",
    repMax: "12",
    increment: "5",
    fallbackWeight: "0",
    setCount: "3",
    equipment: "",
  });

  const finishHoldRef = useRef<number | null>(null);
  const undoTimerRef = useRef<number | null>(null);
  const previousRestRef = useRef(0);
  const suppressRestAlertRef = useRef(false);
  const wakeLockRef = useRef<WakeSentinel | null>(null);
  const dragIndexRef = useRef<number | null>(null);

  const activeRoutine = useMemo(
    () => routines.find((routine) => routine.id === activeRoutineId) ?? routines[0] ?? defaultRoutines[2],
    [routines, activeRoutineId],
  );

  const allDefinitions = useMemo(() => [...exerciseLibrary, ...customExercises], [customExercises]);

  useEffect(() => {
    const parsedHistory = readJson<HistoryItem[]>(HISTORY_KEY, []);
    const parsedRoutines = readJson<RoutineDefinition[]>(ROUTINES_KEY, defaultRoutines);
    const parsedCustom = readJson<StoredCustomExercise[]>(CUSTOM_KEY, []);
    const parsedNotes = readJson<NotesMap>(NOTES_KEY, {});
    const parsedRests = readJson<RestMap>(REST_KEY, {});
    const parsedExtras = readJson<ExtraMap>(EXTRAS_KEY, {});
    let targetId = localStorage.getItem(ACTIVE_ROUTINE_KEY) ?? "legs";
    if (!parsedRoutines.some((routine) => routine.id === targetId)) targetId = parsedRoutines[0]?.id ?? "legs";
    const target = parsedRoutines.find((routine) => routine.id === targetId) ?? parsedRoutines[0] ?? defaultRoutines[2];
    const drafts = readJson<DraftMap>(DRAFTS_KEY, {});
    const legacyDrafts = readJson<Record<string, { exercises?: Array<Partial<GymExercise> & { id: string }>; startedAt?: string }>>(
      LEGACY_DRAFTS_KEY,
      {},
    );
    const draft = drafts[target.id] ?? legacyDrafts[target.id];

    setHistory(parsedHistory);
    setRoutines(parsedRoutines.length ? parsedRoutines : defaultRoutines);
    setCustomExercises(parsedCustom);
    setNotes(parsedNotes);
    setRests(parsedRests);
    setExtras(parsedExtras);
    setActiveRoutineId(target.id);
    setRestSound(localStorage.getItem(REST_SOUND_KEY) === "1");
    setTodayReadiness(readinessForToday(safeArray<ReadinessRecord>(localStorage.getItem(READINESS_KEY))));

    let loaded: GymExercise[];
    if (draft?.exercises?.length) {
      const migrated = draft.exercises
        .map((exercise) => migrateExercise(exercise, parsedHistory, parsedCustom, parsedNotes, parsedRests))
        .filter((exercise): exercise is GymExercise => Boolean(exercise));
      loaded = migrated.length ? migrated : makeRoutine(target, parsedHistory, parsedCustom, parsedNotes, parsedRests, parsedExtras);
      const activeDraft = draftSessionIsActive(draft as SessionDraft);
      setSessionActive(activeDraft);
      setStartedAt(activeDraft ? (draft.startedAt ?? null) : null);
      setPausedAt(activeDraft && "pausedAt" in draft ? (draft.pausedAt ?? null) : null);
      setTotalPausedSeconds(activeDraft && "totalPausedSeconds" in draft ? Number(draft.totalPausedSeconds ?? 0) : 0);
      setRestRemaining(activeDraft && "restRemaining" in draft ? Number(draft.restRemaining ?? 0) : 0);
      if ("sessionNote" in draft) setSessionNote(String(draft.sessionNote ?? ""));
      setCollapsed("collapsed" in draft && draft.collapsed ? draft.collapsed : defaultCollapsed(loaded));
    } else {
      loaded = makeRoutine(target, parsedHistory, parsedCustom, parsedNotes, parsedRests, parsedExtras);
      setSessionActive(false);
      setStartedAt(null);
      setPausedAt(null);
      setTotalPausedSeconds(0);
      setRestRemaining(0);
      setElapsed(0);
      setExercises(loaded);
      setCollapsed(defaultCollapsed(loaded));
    }
    setExercises(loaded);
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    localStorage.setItem(CUSTOM_KEY, JSON.stringify(customExercises));
  }, [customExercises, hydrated]);

  useEffect(() => {
    if (!hydrated) return;
    localStorage.setItem(NOTES_KEY, JSON.stringify(notes));
  }, [notes, hydrated]);

  useEffect(() => {
    if (!hydrated) return;
    localStorage.setItem(REST_KEY, JSON.stringify(rests));
  }, [rests, hydrated]);

  useEffect(() => {
    if (!hydrated) return;
    localStorage.setItem(EXTRAS_KEY, JSON.stringify(extras));
  }, [extras, hydrated]);

  useEffect(() => {
    if (!hydrated) return;
    localStorage.setItem(REST_SOUND_KEY, restSound ? "1" : "0");
  }, [restSound, hydrated]);

  useEffect(() => {
    if (!hydrated) return;
    const drafts = readJson<DraftMap>(DRAFTS_KEY, {});
    drafts[activeRoutineId] = {
      exercises,
      startedAt,
      sessionActive,
      pausedAt,
      totalPausedSeconds,
      restRemaining,
      sessionNote,
      collapsed,
    };
    localStorage.setItem(DRAFTS_KEY, JSON.stringify(drafts));
    setSavedAt(Date.now());
  }, [
    exercises,
    startedAt,
      sessionActive,
    pausedAt,
    totalPausedSeconds,
    restRemaining,
    sessionNote,
    collapsed,
    activeRoutineId,
    hydrated,
  ]);

  useEffect(() => {
    if (!hydrated || !sessionActive || !startedAt) {
      setElapsed(0);
      return;
    }
    const tick = () => setElapsed(elapsedSeconds(startedAt, totalPausedSeconds, pausedAt));
    tick();
    const timer = window.setInterval(tick, 1000);
    return () => window.clearInterval(timer);
  }, [hydrated, sessionActive, startedAt, totalPausedSeconds, pausedAt]);

  useEffect(() => {
    if (!sessionActive || restRemaining <= 0 || pausedAt) return;
    const timer = window.setInterval(() => setRestRemaining((value) => Math.max(0, value - 1)), 1000);
    return () => window.clearInterval(timer);
  }, [sessionActive, restRemaining, pausedAt]);

  useEffect(() => {
    const previous = previousRestRef.current;
    if (previous > 0 && restRemaining === 0) {
      if (!suppressRestAlertRef.current) {
        navigator.vibrate?.([120, 70, 120]);
        if (restSound) playRestTone();
        setNotice("Rest complete — next set is ready.");
      }
      suppressRestAlertRef.current = false;
    }
    previousRestRef.current = restRemaining;
  }, [restRemaining, restSound]);

  useEffect(() => {
    if (!undo) return;
    if (undoTimerRef.current) window.clearTimeout(undoTimerRef.current);
    undoTimerRef.current = window.setTimeout(() => setUndo(null), 6500);
    return () => {
      if (undoTimerRef.current) window.clearTimeout(undoTimerRef.current);
    };
  }, [undo]);

  useEffect(() => {
    if (!hydrated) return;
    const nav = navigator as Navigator & { wakeLock?: { request(type: "screen"): Promise<WakeSentinel> } };

    async function release() {
      const sentinel = wakeLockRef.current;
      wakeLockRef.current = null;
      setWakeLockActive(false);
      if (sentinel) {
        try {
          await sentinel.release();
        } catch {
          // Ignore unsupported/expired locks.
        }
      }
    }

    async function acquire() {
      if (!sessionActive || pausedAt || document.visibilityState !== "visible" || !nav.wakeLock?.request || wakeLockRef.current) return;
      try {
        wakeLockRef.current = await nav.wakeLock.request("screen");
        setWakeLockActive(true);
      } catch {
        setWakeLockActive(false);
      }
    }

    void (!sessionActive || pausedAt ? release() : acquire());
    const onVisibility = () => void (document.visibilityState === "visible" && sessionActive && !pausedAt ? acquire() : release());
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      void release();
    };
  }, [hydrated, sessionActive, pausedAt]);

  const stats = useMemo(() => {
    const working = exercises.flatMap((exercise) => workingPerformance(exercise.sets));
    const totalSets = exercises.reduce((sum, exercise) => sum + exercise.sets.length, 0);
    const completedAll = exercises.reduce((sum, exercise) => sum + exercise.sets.filter((set) => set.completed).length, 0);
    return {
      sets: working.length,
      volume: working.reduce((sum, set) => sum + set.weight * set.reps, 0),
      rir: averageRir(working),
      totalSets,
      completedAll,
      percent: totalSets ? Math.round((completedAll / totalSets) * 100) : 0,
    };
  }, [exercises]);

  const previousRoutineWorkout = useMemo(
    () => previousWorkoutForRoutine(history, activeRoutine.id, activeRoutine.name),
    [history, activeRoutine.id, activeRoutine.name],
  );
  const liveDelta = useMemo(
    () => liveMatchedDelta(exercises, previousRoutineWorkout),
    [exercises, previousRoutineWorkout],
  );
  const readinessNote = useMemo(() => readinessGuidance(todayReadiness), [todayReadiness]);

  const filteredDefinitions = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return allDefinitions;
    return allDefinitions.filter(
      (definition) => definition.name.toLowerCase().includes(query) || definition.muscle.toLowerCase().includes(query),
    );
  }, [allDefinitions, search]);

  const plate = useMemo(() => plateBreakdown(plateTarget, barWeight), [plateTarget, barWeight]);
  const warmups = useMemo(
    () => [
      { pct: 40, weight: nearestFive(warmupWeight * 0.4), reps: 8 },
      { pct: 60, weight: nearestFive(warmupWeight * 0.6), reps: 5 },
      { pct: 75, weight: nearestFive(warmupWeight * 0.75), reps: 3 },
      { pct: 90, weight: nearestFive(warmupWeight * 0.9), reps: 1 },
    ],
    [warmupWeight],
  );

  function snapshotUndo(label: string, includeExtras = false) {
    setUndo({
      label,
      exercises,
      extras: includeExtras ? extras : undefined,
      restRemaining,
    });
  }

  function restoreUndo() {
    if (!undo) return;
    setExercises(undo.exercises);
    if (undo.extras) setExtras(undo.extras);
    setRestRemaining(undo.restRemaining);
    setUndo(null);
    setNotice(`Undid: ${undo.label}.`);
  }

  function saveCurrentDraft() {
    const drafts = readJson<DraftMap>(DRAFTS_KEY, {});
    drafts[activeRoutineId] = {
      exercises,
      startedAt,
      sessionActive,
      pausedAt,
      totalPausedSeconds,
      restRemaining,
      sessionNote,
      collapsed,
    };
    localStorage.setItem(DRAFTS_KEY, JSON.stringify(drafts));
  }

  function switchRoutine(id: string) {
    if (id === activeRoutineId) return;
    saveCurrentDraft();
    const target = routines.find((routine) => routine.id === id);
    if (!target) return;
    const drafts = readJson<DraftMap>(DRAFTS_KEY, {});
    const draft = drafts[id];
    let loaded: GymExercise[];
    if (draft?.exercises?.length) {
      const migrated = draft.exercises
        .map((exercise) => migrateExercise(exercise, history, customExercises, notes, rests))
        .filter((exercise): exercise is GymExercise => Boolean(exercise));
      loaded = migrated.length ? migrated : makeRoutine(target, history, customExercises, notes, rests, extras);
      const activeDraft = draftSessionIsActive(draft);
      setSessionActive(activeDraft);
      setStartedAt(activeDraft ? draft.startedAt : null);
      setPausedAt(activeDraft ? (draft.pausedAt ?? null) : null);
      setTotalPausedSeconds(activeDraft ? Number(draft.totalPausedSeconds ?? 0) : 0);
      setRestRemaining(activeDraft ? Number(draft.restRemaining ?? 0) : 0);
      setSessionNote(draft.sessionNote ?? "");
      setCollapsed(draft.collapsed ?? defaultCollapsed(loaded));
    } else {
      loaded = makeRoutine(target, history, customExercises, notes, rests, extras);
      setSessionActive(false);
      setStartedAt(null);
      setElapsed(0);
      setPausedAt(null);
      setTotalPausedSeconds(0);
      setRestRemaining(0);
      setSessionNote("");
      setCollapsed(defaultCollapsed(loaded));
    }
    setExercises(loaded);
    setActiveRoutineId(id);
    setEditingCompleted({});
    localStorage.setItem(ACTIVE_ROUTINE_KEY, id);
    const activeDraft = draft ? draftSessionIsActive(draft) : false;
    setNotice(activeDraft ? `Resumed saved ${target.name} session.` : `${target.name} ready. Timer starts when you start logging.`);
  }

  function startWorkout() {
    if (sessionActive) return;
    setSessionActive(true);
    setStartedAt(new Date().toISOString());
    setElapsed(0);
    setPausedAt(null);
    setTotalPausedSeconds(0);
    setNotice("Workout started. Timer is running.");
  }

  function ensureSessionStarted() {
    if (!sessionActive) startWorkout();
  }

  function togglePause() {
    if (!sessionActive) {
      setNotice("No workout is running yet. Tap Start or log your first set.");
      return;
    }
    if (pausedAt) {
      const pausedFor = Math.max(0, Math.floor((Date.now() - new Date(pausedAt).getTime()) / 1000));
      setTotalPausedSeconds((current) => current + pausedFor);
      setPausedAt(null);
      setNotice("Session resumed. Workout and rest timers are running again.");
      return;
    }
    setPausedAt(new Date().toISOString());
    setNotice("Session paused. Workout duration and rest timer are frozen.");
  }

  function updateSet(exerciseId: string, setId: string, field: "weight" | "reps" | "rir", raw: string) {
    if (raw !== "") ensureSessionStarted();
    const value = raw === "" ? null : Number(raw);
    setExercises((current) =>
      current.map((exercise) =>
        exercise.id !== exerciseId
          ? exercise
          : { ...exercise, sets: exercise.sets.map((set) => (set.id === setId ? { ...set, [field]: value } : set)) },
      ),
    );
  }

  function updateSetType(exerciseId: string, setId: string, type: SetType) {
    setExercises((current) =>
      current.map((exercise) =>
        exercise.id !== exerciseId
          ? exercise
          : { ...exercise, sets: exercise.sets.map((set) => (set.id === setId ? { ...set, type } : set)) },
      ),
    );
  }

  function copyPrevious(exerciseId: string, setId: string, index: number) {
    setExercises((current) =>
      current.map((exercise) => {
        if (exercise.id !== exerciseId) return exercise;
        const prior = exercise.previous[index] ?? exercise.sets[index - 1];
        if (!prior) return exercise;
        return {
          ...exercise,
          sets: exercise.sets.map((set) =>
            set.id === setId ? { ...set, weight: Number(prior.weight ?? 0), reps: Number(prior.reps ?? 0) } : set,
          ),
        };
      }),
    );
  }

  function useAllPrevious(exerciseId: string) {
    const target = exercises.find((exercise) => exercise.id === exerciseId);
    if (!target?.previous.length) {
      setNotice("No previous performance is available for this exercise yet.");
      return;
    }
    snapshotUndo("Used previous exercise values");
    setExercises((current) =>
      current.map((exercise) =>
        exercise.id !== exerciseId
          ? exercise
          : {
              ...exercise,
              sets: exercise.sets.map((set, index) => {
                if (set.completed) return set;
                const previous = exercise.previous[index];
                if (!previous) return set;
                return { ...set, weight: previous.weight, reps: previous.reps, rir: previous.rir ?? null };
              }),
            },
      ),
    );
    setCollapsed((current) => ({ ...current, [exerciseId]: false }));
    setNotice(`Loaded last session values for ${target.name}. Timer stays at 0:00 until you actually start/log a set.`);
  }

  function focusNextSet(exerciseId: string, setId: string) {
    const exerciseIndex = exercises.findIndex((item) => item.id === exerciseId);
    if (exerciseIndex < 0) return;
    const setIndex = exercises[exerciseIndex].sets.findIndex((set) => set.id === setId);
    const sameExercise = exercises[exerciseIndex].sets.slice(setIndex + 1).find((set) => !set.completed);
    let nextExerciseId = exerciseId;
    let nextSet = sameExercise;

    if (!nextSet) {
      for (let index = exerciseIndex + 1; index < exercises.length; index += 1) {
        const candidate = exercises[index].sets.find((set) => !set.completed);
        if (candidate) {
          nextExerciseId = exercises[index].id;
          nextSet = candidate;
          break;
        }
      }
    }

    if (!nextSet) return;
    setCollapsed((current) => ({ ...current, [nextExerciseId]: false }));
    window.setTimeout(() => {
      const input = document.getElementById(`set-weight-${nextSet?.id}`) as HTMLInputElement | null;
      input?.scrollIntoView({ behavior: "smooth", block: "center" });
      input?.focus({ preventScroll: true });
      input?.select();
    }, 120);
  }

  function toggleSet(exerciseId: string, setId: string, index: number) {
    const exercise = exercises.find((item) => item.id === exerciseId);
    const target = exercise?.sets.find((set) => set.id === setId);
    if (!exercise || !target) return;
    snapshotUndo(target.completed ? "Reopened set" : "Completed set");
    const completing = !target.completed;
    if (completing) ensureSessionStarted();
    let shouldRest = completing;
    if (completing && exercise.supersetGroup) {
      const partners = exercises.filter((item) => item.id !== exercise.id && item.supersetGroup === exercise.supersetGroup);
      if (partners.length) shouldRest = partners.every((partner) => Boolean(partner.sets[index]?.completed));
    }
    setExercises((current) =>
      current.map((item) =>
        item.id !== exerciseId
          ? item
          : { ...item, sets: item.sets.map((set) => (set.id === setId ? { ...set, completed: !set.completed } : set)) },
      ),
    );
    if (shouldRest) {
      suppressRestAlertRef.current = false;
      setRestRemaining(exercise.restSeconds);
    }
    if (completing) {
      setEditingCompleted((current) => ({ ...current, [setId]: false }));
      const allDone = exercise.sets.every((set) => set.id === setId || set.completed);
      if (allDone) {
        const next = exercises[exercises.findIndex((item) => item.id === exerciseId) + 1];
        setCollapsed((current) => ({ ...current, [exerciseId]: true, ...(next ? { [next.id]: false } : {}) }));
      }
      focusNextSet(exerciseId, setId);
    }
  }

  function addSet(exerciseId: string) {
    setExercises((current) =>
      current.map((exercise) => {
        if (exercise.id !== exerciseId) return exercise;
        const last = exercise.sets.at(-1);
        return {
          ...exercise,
          sets: [
            ...exercise.sets,
            {
              id: uid(`${exercise.id}-set`),
              weight: last?.weight ?? exercise.suggestedWeights.at(-1) ?? exercise.fallbackWeight,
              reps: null,
              rir: null,
              completed: false,
              type: "working",
            },
          ],
        };
      }),
    );
    setCollapsed((current) => ({ ...current, [exerciseId]: false }));
  }

  function removeSet(exerciseId: string, setId: string) {
    snapshotUndo("Deleted set");
    setExercises((current) =>
      current.map((exercise) =>
        exercise.id === exerciseId ? { ...exercise, sets: exercise.sets.filter((set) => set.id !== setId) } : exercise,
      ),
    );
  }

  function updateNote(exerciseId: string, note: string) {
    setExercises((current) => current.map((exercise) => (exercise.id === exerciseId ? { ...exercise, note } : exercise)));
    setNotes((current) => ({ ...current, [exerciseId]: note }));
  }

  function updateRest(exerciseId: string, seconds: number) {
    const safe = Math.max(15, Math.min(600, seconds || 90));
    setExercises((current) => current.map((exercise) => (exercise.id === exerciseId ? { ...exercise, restSeconds: safe } : exercise)));
    setRests((current) => ({ ...current, [exerciseId]: safe }));
  }

  function pairWithNext(index: number) {
    if (!exercises[index + 1]) return;
    const first = exercises[index];
    const second = exercises[index + 1];
    const alreadyPaired = first.supersetGroup && first.supersetGroup === second.supersetGroup;
    const group = alreadyPaired ? undefined : uid("superset");
    setExercises((current) =>
      current.map((exercise, exerciseIndex) =>
        exerciseIndex === index || exerciseIndex === index + 1 ? { ...exercise, supersetGroup: group } : exercise,
      ),
    );
  }

  function substituteExercise(index: number, newId: string) {
    const definition = definitionFor(newId, customExercises);
    if (!definition) return;
    snapshotUndo("Substituted exercise");
    const old = exercises[index];
    const replacement = makeExercise(definition, history, notes, rests);
    replacement.sourceId = old.sourceId ?? old.id;
    replacement.supersetGroup = old.supersetGroup;
    setExercises((current) => current.map((exercise, exerciseIndex) => (exerciseIndex === index ? replacement : exercise)));
    setCollapsed((current) => ({ ...current, [old.id]: true, [replacement.id]: false }));
  }

  function addDefinition(definition: ExerciseDefinition, persist = true) {
    if (!exercises.some((exercise) => exercise.id === definition.id)) {
      const next = makeExercise(definition, history, notes, rests);
      setExercises((current) => [...current, next]);
      setCollapsed((current) => ({ ...current, [next.id]: false }));
    }
    if (persist && !activeRoutine.exerciseIds.includes(definition.id)) {
      setExtras((current) => ({
        ...current,
        [activeRoutine.id]: [...new Set([...(current[activeRoutine.id] ?? []), definition.id])],
      }));
    }
    setPanel(null);
    setSearch("");
  }

  function removeFromRoutine(exerciseId: string) {
    snapshotUndo("Removed exercise from routine", true);
    setExtras((current) => ({
      ...current,
      [activeRoutine.id]: (current[activeRoutine.id] ?? []).filter((id) => id !== exerciseId),
    }));
    setExercises((current) => current.filter((exercise) => exercise.id !== exerciseId));
  }

  function createCustomExercise() {
    const name = customForm.name.trim();
    if (!name) return;
    const definition: StoredCustomExercise = {
      id: uid(`custom-${name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "exercise"}`),
      name,
      muscle: customForm.muscle,
      repMin: Math.max(1, Number(customForm.repMin) || 8),
      repMax: Math.max(1, Number(customForm.repMax) || 12),
      increment: Math.max(0.5, Number(customForm.increment) || 5),
      fallbackWeight: Math.max(0, Number(customForm.fallbackWeight) || 0),
      setCount: Math.max(1, Math.min(10, Number(customForm.setCount) || 3)),
      equipment: customForm.equipment.trim(),
    };
    if (definition.repMax < definition.repMin) definition.repMax = definition.repMin;
    const next = makeExercise(definition, history, notes, rests);
    setCustomExercises((current) => [...current, definition]);
    setExercises((current) => [...current, next]);
    setCollapsed((current) => ({ ...current, [next.id]: false }));
    setExtras((current) => ({
      ...current,
      [activeRoutine.id]: [...new Set([...(current[activeRoutine.id] ?? []), definition.id])],
    }));
    setCustomForm({ name: "", muscle: "Chest", repMin: "8", repMax: "12", increment: "5", fallbackWeight: "0", setCount: "3", equipment: "" });
    setPanel(null);
  }

  function skipToday(index: number) {
    snapshotUndo("Skipped exercise");
    setExercises((current) => current.filter((_, exerciseIndex) => exerciseIndex !== index));
  }

  function moveExercise(from: number, to: number) {
    if (to < 0 || to >= exercises.length || from === to) return;
    setExercises((current) => {
      const copy = [...current];
      const [moved] = copy.splice(from, 1);
      copy.splice(to, 0, moved);
      return copy;
    });
  }

  function startDrag(index: number, event: ReactPointerEvent<HTMLButtonElement>) {
    dragIndexRef.current = index;
    setDraggingExercise(exercises[index]?.id ?? null);
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function dragMove(event: ReactPointerEvent<HTMLButtonElement>) {
    const from = dragIndexRef.current;
    if (from == null) return;
    const target = document.elementFromPoint(event.clientX, event.clientY)?.closest<HTMLElement>("[data-exercise-index]");
    if (!target) return;
    const to = Number(target.dataset.exerciseIndex);
    if (!Number.isInteger(to) || to === from) return;
    moveExercise(from, to);
    dragIndexRef.current = to;
  }

  function endDrag(event: ReactPointerEvent<HTMLButtonElement>) {
    dragIndexRef.current = null;
    setDraggingExercise(null);
    try {
      event.currentTarget.releasePointerCapture(event.pointerId);
    } catch {
      // Pointer may already be released.
    }
  }

  function skipRest() {
    suppressRestAlertRef.current = true;
    setRestRemaining(0);
  }

  function cancelWorkout() {
    if (!sessionActive) {
      setNotice("No workout is currently running.");
      setCancelArmed(false);
      return;
    }
    if (!cancelArmed) {
      setCancelArmed(true);
      setNotice("Tap Cancel workout again within 5 seconds to discard this session.");
      window.setTimeout(() => setCancelArmed(false), 5000);
      return;
    }

    const drafts = readJson<DraftMap>(DRAFTS_KEY, {});
    delete drafts[activeRoutine.id];
    localStorage.setItem(DRAFTS_KEY, JSON.stringify(drafts));
    const legacyDrafts = readJson<Record<string, unknown>>(LEGACY_DRAFTS_KEY, {});
    delete legacyDrafts[activeRoutine.id];
    localStorage.setItem(LEGACY_DRAFTS_KEY, JSON.stringify(legacyDrafts));

    const fresh = makeRoutine(activeRoutine, history, customExercises, notes, rests, extras);
    setExercises(fresh);
    setSessionActive(false);
    setStartedAt(null);
    setElapsed(0);
    setPausedAt(null);
    setTotalPausedSeconds(0);
    setRestRemaining(0);
    setSessionNote("");
    setCollapsed(defaultCollapsed(fresh));
    setEditingCompleted({});
    setFinishOpen(false);
    setCancelArmed(false);
    setSavedAt(null);
    setNotice("Workout canceled. Nothing was saved to History.");
  }

  function finishWorkout() {
    const previousRoutine = previousWorkoutForRoutine(history, activeRoutine.id, activeRoutine.name);
    const working = exercises.flatMap((exercise) => workingPerformance(exercise.sets));
    if (!working.length) {
      setNotice("Complete at least one working set before finishing.");
      setFinishOpen(false);
      return;
    }

    const prs: string[] = [];
    for (const exercise of exercises) {
      const current = workingPerformance(exercise.sets);
      if (!current.length) continue;
      const currentBest = bestEstimatedOneRepMax(current);
      const prior = historicalBest(history, exercise.id);
      if (prior > 0 && currentBest > prior + 0.5) prs.push(`${exercise.name}: ${Math.round(currentBest)} lb e1RM`);
    }

    const completedAt = new Date().toISOString();
    const item: HistoryItem = {
      id: uid("workout"),
      routineId: activeRoutine.id,
      name: activeRoutine.name,
      completedAt,
      durationSeconds: elapsed,
      totalVolume: working.reduce((sum, set) => sum + set.weight * set.reps, 0),
      completedSets: working.length,
      averageRir: averageRir(working),
      prs,
      sessionNote: sessionNote.trim() || undefined,
      pausedSeconds: totalPausedSeconds,
      exercises: exercises
        .map((exercise) => ({
          id: exercise.id,
          name: exercise.name,
          repMin: exercise.repMin,
          repMax: exercise.repMax,
          increment: exercise.increment,
          sets: workingPerformance(exercise.sets).map((set) => ({
            weight: set.weight,
            reps: set.reps,
            rir: set.rir,
            estimated1RM: estimateOneRepMax(set.weight, set.reps),
          })),
        }))
        .filter((exercise) => exercise.sets.length > 0),
      v07Details: exercises.map((exercise) => ({
        id: exercise.id,
        substitutedFor: exercise.sourceId ?? null,
        supersetGroup: exercise.supersetGroup ?? null,
        note: exercise.note,
        restSeconds: exercise.restSeconds,
        sets: exercise.sets.filter((set) => set.completed).map((set) => ({
          weight: set.weight,
          reps: set.reps,
          rir: set.rir,
          setType: set.type,
        })),
      })),
    };

    const nextHistory = [item, ...history].slice(0, 150);
    localStorage.setItem(HISTORY_KEY, JSON.stringify(nextHistory));
    const drafts = readJson<DraftMap>(DRAFTS_KEY, {});
    delete drafts[activeRoutine.id];
    localStorage.setItem(DRAFTS_KEY, JSON.stringify(drafts));

    const nextExercises = makeRoutine(activeRoutine, nextHistory, customExercises, notes, rests, extras);
    setLastSummary({
      name: item.name,
      sets: item.completedSets,
      volume: item.totalVolume,
      duration: item.durationSeconds,
      prs,
      nextTarget: nextExercises[0]?.recommendation,
      comparison: completedWorkoutComparison(item, previousRoutine),
    });
    setHistory(nextHistory);
    setExercises(nextExercises);
    setSessionActive(false);
    setStartedAt(null);
    setElapsed(0);
    setPausedAt(null);
    setTotalPausedSeconds(0);
    setRestRemaining(0);
    setSessionNote("");
    setCollapsed(defaultCollapsed(nextExercises));
    setEditingCompleted({});
    setFinishOpen(false);
    setNotice(`Saved ${activeRoutine.name}. Your next session is ready.`);
  }

  function beginFinishHold() {
    if (finishHoldRef.current) window.clearTimeout(finishHoldRef.current);
    setFinishHolding(true);
    finishHoldRef.current = window.setTimeout(() => {
      setFinishHolding(false);
      finishHoldRef.current = null;
      finishWorkout();
    }, 900);
  }

  function cancelFinishHold() {
    if (finishHoldRef.current) window.clearTimeout(finishHoldRef.current);
    finishHoldRef.current = null;
    setFinishHolding(false);
  }

  if (!hydrated) {
    return (
      <PageShell>
        <p className="ds-muted">Loading workout…</p>
      </PageShell>
    );
  }

  return (
    <PageShell>
      <div className="ds-rise">
        <PageHeader
          eyebrow="TRAINING INTELLIGENCE"
          eyebrowVolt
          title={activeRoutine.name}
          lede="Log the set in front of you. Everything else stays one tap deeper."
        />
      </div>

      <Card className="ds-rise ds-rise--1">
        <div className="ds-stack">
          <div className="ds-cluster" style={{ justifyContent: "space-between" }}>
            <Badge tone={sessionActive ? (pausedAt ? "amber" : "volt") : "neutral"} dot>
              {!sessionActive ? "READY" : pausedAt ? "PAUSED" : "SESSION"}
            </Badge>
            <span className="ds-muted" style={{ fontSize: "0.78rem" }}>
              {!sessionActive
                ? "Timer starts with Start or your first logged set"
                : `${savedAt ? "Saved locally ✓" : "Local-first"}${wakeLockActive ? " · screen awake" : ""}`}
            </span>
          </div>
          <TimerFace
            digits={sessionActive ? formatDuration(elapsed) : "0:00"}
            label="WORKOUT TIME"
            pulse={sessionActive && !pausedAt}
          />
          <div>
            {!sessionActive ? (
              <Button variant="primary" size="lg" block onClick={startWorkout}>▶ Start workout</Button>
            ) : (
              <Button variant="secondary" size="lg" block onClick={togglePause}>{pausedAt ? "▶ Resume" : "Ⅱ Pause"}</Button>
            )}
          </div>
          <details>
            <summary className="ds-btn ds-btn--ghost" style={{ width: "100%", justifyContent: "space-between" }}>
              Session menu <span>⌄</span>
            </summary>
            <div className="ds-stack" style={{ marginTop: 12 }}>
              <strong>Session controls</strong>
              {sessionActive ? (
                <>
                  <p className="ds-muted" style={{ margin: 0 }}>
                    Canceling discards this in-progress workout and does not save it to History.
                  </p>
                  <Button variant="danger" size="sm" onClick={cancelWorkout}>
                    {cancelArmed ? "Tap again to discard" : "Cancel workout"}
                  </Button>
                </>
              ) : (
                <p className="ds-muted" style={{ margin: 0 }}>No workout is running. Start when you are ready.</p>
              )}
            </div>
          </details>
        </div>
      </Card>

      {sessionActive && pausedAt && (
        <Card tight className="ds-rise">
          <div className="ds-cluster" style={{ justifyContent: "space-between" }}>
            <div>
              <strong>Session paused</strong>
              <p className="ds-muted" style={{ margin: "4px 0 0" }}>Workout time and rest time are frozen.</p>
            </div>
            <Button variant="secondary" size="sm" onClick={togglePause}>Resume session</Button>
          </div>
        </Card>
      )}

      <Card tight className="ds-rise ds-rise--2">
        <div className="ds-stack">
          <Field label="Routine">
            <SelectInput value={activeRoutineId} onChange={(event) => switchRoutine(event.target.value)}>
              {routines.map((routine) => <option key={routine.id} value={routine.id}>{routine.name}</option>)}
            </SelectInput>
          </Field>
          <div>
            <div className="ds-cluster" style={{ justifyContent: "space-between" }}>
              <span className="ds-field__label">Workout progress</span>
              <strong>{stats.completedAll}/{stats.totalSets} sets</strong>
            </div>
            <div style={{ marginTop: 8 }}>
              <ProgressBar
                value={stats.totalSets ? stats.completedAll / stats.totalSets : 0}
                label="Workout progress"
              />
            </div>
            <p className="ds-muted" style={{ margin: "8px 0 0", fontSize: "0.8rem" }}>
              {stats.percent}% complete · {Math.round(stats.volume).toLocaleString()} lb working volume
            </p>
          </div>
        </div>
      </Card>

      {readinessNote && readinessNote.tone !== "good" && (
        <Card tight className="ds-rise">
          <div className="ds-stack">
            <Badge tone={readinessNote.tone === "caution" ? "amber" : "blue"} dot>READINESS</Badge>
            <div>
              <strong>{readinessNote.title}</strong>
              <p className="ds-muted" style={{ margin: "4px 0 0" }}>{readinessNote.message}</p>
            </div>
          </div>
        </Card>
      )}

      {previousRoutineWorkout && (
        <Card tight className="ds-rise">
          <div className="ds-stack">
            <div>
              <p className="ds-eyebrow" style={{ margin: 0 }}>LIVE VS LAST {activeRoutine.name.toUpperCase()}</p>
              <strong>{liveDelta ? `${liveDelta.matchedSets} matched sets` : "Waiting for your first completed set"}</strong>
            </div>
            {liveDelta ? (
              <StatGrid cols={3}>
                <Stat label="Reps" value={`${liveDelta.repDelta >= 0 ? "+" : ""}${liveDelta.repDelta}`} />
                <Stat label="Volume lb" value={`${liveDelta.volumeDelta >= 0 ? "+" : ""}${Math.round(liveDelta.volumeDelta).toLocaleString()}`} />
                <Stat
                  label="e1RM"
                  value={liveDelta.e1rmDelta == null ? "—" : `${liveDelta.e1rmDelta >= 0 ? "+" : ""}${Math.round(liveDelta.e1rmDelta)}`}
                />
              </StatGrid>
            ) : (
              <p className="ds-muted" style={{ margin: 0 }}>Comparison activates as working sets are completed.</p>
            )}
          </div>
        </Card>
      )}

      <Card tight className="ds-rise ds-rise--2">
        <div className="ds-stack">
          <TimerFace
            digits={restRemaining ? formatDuration(restRemaining) : "--:--"}
            label={restRemaining ? (pausedAt ? "REST PAUSED" : "REST") : "REST TIMER"}
            pulse={Boolean(restRemaining) && !pausedAt}
          />
          <div className="ds-cluster" style={{ justifyContent: "center" }}>
            {restRemaining > 0 && <Button variant="secondary" size="sm" onClick={() => setRestRemaining((value) => value + 30)}>+30</Button>}
            {restRemaining > 0 && <Button variant="ghost" size="sm" onClick={skipRest}>Skip</Button>}
            <label className="ds-muted" style={{ display: "inline-flex", alignItems: "center", gap: 8, fontSize: "0.85rem" }}>
              <input type="checkbox" checked={restSound} onChange={(event) => setRestSound(event.target.checked)} /> Sound
            </label>
          </div>
        </div>
      </Card>

      <div className="ds-rise ds-rise--3" role="group" aria-label="Workout tools">
        <ChipRow>
          <Chip selected={panel === "exercise"} onClick={() => setPanel((current) => current === "exercise" ? null : "exercise")}>＋ Exercise <span>⌄</span></Chip>
          <Chip selected={panel === "custom"} onClick={() => setPanel((current) => current === "custom" ? null : "custom")}>✚ Custom <span>⌄</span></Chip>
          <Chip selected={panel === "plate"} onClick={() => setPanel((current) => current === "plate" ? null : "plate")}>◉ Plates <span>⌄</span></Chip>
          <Chip selected={panel === "warmup"} onClick={() => setPanel((current) => current === "warmup" ? null : "warmup")}>🔥 Warm-up <span>⌄</span></Chip>
        </ChipRow>
      </div>

      <Sheet
        open={panel !== null}
        onClose={() => setPanel(null)}
        title={panel === "exercise" ? "Add exercise" : panel === "custom" ? "Custom exercise" : panel === "plate" ? "Plate calculator" : "Warm-up calculator"}
      >
        {panel === "exercise" && (
          <div className="ds-stack">
            <Field label="Search">
              <TextInput value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search exercise or muscle…" />
            </Field>
            {filteredDefinitions.length === 0 ? (
              <EmptyState title="No matches" body="Try a different exercise or muscle name." />
            ) : (
              <div className="ds-stack">
                {filteredDefinitions.map((definition) => (
                  <ListRow
                    key={definition.id}
                    title={definition.name}
                    sub={`${definition.muscle} · ${definition.repMin}–${definition.repMax}`}
                    trailing={<strong>+ Routine</strong>}
                    onClick={() => addDefinition(definition, true)}
                  />
                ))}
              </div>
            )}
          </div>
        )}

        {panel === "custom" && (
          <div className="ds-stack">
            <Field label="Name">
              <TextInput value={customForm.name} onChange={(event) => setCustomForm((current) => ({ ...current, name: event.target.value }))} placeholder="e.g. Plate-Loaded Row" />
            </Field>
            <Field label="Muscle">
              <SelectInput value={customForm.muscle} onChange={(event) => setCustomForm((current) => ({ ...current, muscle: event.target.value as MuscleGroup }))}>
                {muscleOptions.map((muscle) => <option key={muscle}>{muscle}</option>)}
              </SelectInput>
            </Field>
            <div className="ds-grid-2">
              <Field label="Rep min">
                <TextInput type="number" inputMode="numeric" value={customForm.repMin} onChange={(event) => setCustomForm((current) => ({ ...current, repMin: event.target.value }))} />
              </Field>
              <Field label="Rep max">
                <TextInput type="number" inputMode="numeric" value={customForm.repMax} onChange={(event) => setCustomForm((current) => ({ ...current, repMax: event.target.value }))} />
              </Field>
            </div>
            <div className="ds-grid-2">
              <Field label="Increment">
                <TextInput type="number" inputMode="decimal" step="0.5" value={customForm.increment} onChange={(event) => setCustomForm((current) => ({ ...current, increment: event.target.value }))} />
              </Field>
              <Field label="Starting weight">
                <TextInput type="number" inputMode="decimal" value={customForm.fallbackWeight} onChange={(event) => setCustomForm((current) => ({ ...current, fallbackWeight: event.target.value }))} />
              </Field>
            </div>
            <div className="ds-grid-2">
              <Field label="Sets">
                <TextInput type="number" inputMode="numeric" min="1" max="10" value={customForm.setCount} onChange={(event) => setCustomForm((current) => ({ ...current, setCount: event.target.value }))} />
              </Field>
              <Field label="Equipment">
                <TextInput value={customForm.equipment} onChange={(event) => setCustomForm((current) => ({ ...current, equipment: event.target.value }))} placeholder="Machine, cable, dumbbell…" />
              </Field>
            </div>
            <Button variant="primary" block onClick={createCustomExercise}>Create + add to routine</Button>
          </div>
        )}

        {panel === "plate" && (
          <div className="ds-stack">
            <div className="ds-grid-2">
              <Stepper
                label="Target"
                unit="lb"
                value={String(plateTarget)}
                editable
                inputProps={{ type: "number", inputMode: "decimal", onChange: (event) => setPlateTarget(Number(event.target.value)) }}
                onDecrement={() => setPlateTarget((value) => Math.max(0, value - 5))}
                onIncrement={() => setPlateTarget((value) => value + 5)}
              />
              <Stepper
                label="Bar"
                unit="lb"
                value={String(barWeight)}
                editable
                inputProps={{ type: "number", inputMode: "decimal", onChange: (event) => setBarWeight(Number(event.target.value)) }}
                onDecrement={() => setBarWeight((value) => Math.max(0, value - 2.5))}
                onIncrement={() => setBarWeight((value) => value + 2.5)}
              />
            </div>
            <StatGrid cols={2}>
              <Stat label="Per side" value={`${plate.perSide} lb`} />
              <Stat
                label="Plates per side"
                value={plate.result.length ? plate.result.map((item) => `${item.count}×${item.plate}`).join(" + ") : "Bar only"}
                sub={plate.result.length ? undefined : "Target below bar"}
              />
            </StatGrid>
            {plate.remainder > 0.01 && (
              <p className="ds-muted" style={{ margin: 0 }}>Remaining {plate.remainder} lb per side with this plate set.</p>
            )}
          </div>
        )}

        {panel === "warmup" && (
          <div className="ds-stack">
            <Stepper
              label="Working weight"
              unit="lb"
              value={String(warmupWeight)}
              editable
              inputProps={{ type: "number", inputMode: "decimal", onChange: (event) => setWarmupWeight(Number(event.target.value)) }}
              onDecrement={() => setWarmupWeight((value) => Math.max(0, value - 5))}
              onIncrement={() => setWarmupWeight((value) => value + 5)}
            />
            <div className="ds-stack">
              {warmups.map((warmup) => (
                <ListRow key={warmup.pct} title={`${warmup.pct}%`} sub={`${warmup.weight} lb × ${warmup.reps}`} />
              ))}
            </div>
            <p className="ds-muted" style={{ margin: 0 }}>Simple ramp-up template. Adjust it down if you are already warm.</p>
          </div>
        )}
      </Sheet>

      {notice && (
        <div role="status" className="ds-card ds-card--tight ds-rise">
          <span className="ds-muted">{notice}</span>
        </div>
      )}

      <section className="ds-rise ds-rise--2" aria-label="Exercises">
        <div className="ds-stack">
          {exercises.map((exercise, exerciseIndex) => {
            const currentBest = bestEstimatedOneRepMax(workingPerformance(exercise.sets));
            const priorBest = historicalBest(history, exercise.id);
            const isPr = priorBest > 0 && currentBest > priorBest + 0.5;
            const next = exercises[exerciseIndex + 1];
            const pairedWithNext = Boolean(next && exercise.supersetGroup && exercise.supersetGroup === next.supersetGroup);
            const persistentExtra = (extras[activeRoutine.id] ?? []).includes(exercise.id);
            const completedCount = exercise.sets.filter((set) => set.completed).length;
            const isCollapsed = Boolean(collapsed[exercise.id]);
            const beatTarget = beatLastTimeTarget(exercise);
            const nextCue = nextSetCue(exercise);
            const recentSessions = recentExerciseHistory(history, exercise.id, 3);

            return (
              <Card
                key={`${exercise.id}-${exerciseIndex}`}
                data-exercise-index={exerciseIndex}
              >
                <div className="ds-stack">
                  <div className="ds-cluster" style={{ alignItems: "center" }}>
                    <IconButton
                      small
                      label={`Reorder ${exercise.name}`}
                      title="Hold and drag to reorder"
                      onPointerDown={(event) => startDrag(exerciseIndex, event)}
                      onPointerMove={dragMove}
                      onPointerUp={endDrag}
                      onPointerCancel={endDrag}
                    >⋮⋮</IconButton>
                    <button
                      type="button"
                      className="ds-row"
                      style={{ flex: 1 }}
                      onClick={() => setCollapsed((current) => ({ ...current, [exercise.id]: !isCollapsed }))}
                      aria-expanded={!isCollapsed}
                    >
                      <span className="ds-row__body">
                        <span className="ds-eyebrow" style={{ display: "block" }}>{exercise.muscle.toUpperCase()} · {exercise.repMin}–{exercise.repMax} REPS</span>
                        <span className="ds-row__title">{exercise.name}</span>
                        <span className="ds-row__sub" style={{ display: "block" }}>{completedCount}/{exercise.sets.length} sets · Prev {exercise.previous[0] ? previousLabel(exercise.previous[0]) : "none"}</span>
                      </span>
                      <span className="ds-row__trail">{isCollapsed ? "⌄" : "⌃"}</span>
                    </button>
                  </div>

                  {!isCollapsed && (
                    <div className="ds-stack">
                      <div className="ds-cluster">
                        {isPr && <Badge tone="amber">🏆 PR</Badge>}
                        {exercise.supersetGroup && <Badge tone="blue">↔ SUPERSET</Badge>}
                        <Badge>{actionLabel(exercise.progressionAction)}</Badge>
                      </div>

                      <Card tight>
                        <div className="ds-cluster"><Badge>{actionLabel(exercise.progressionAction)}</Badge></div>
                        <p className="ds-muted" style={{ margin: "8px 0 0", color: "var(--ds-text-1)", fontWeight: 700 }}>{exercise.recommendation}</p>
                      </Card>

                      <Card tight>
                        <div className="ds-stack">
                          <div>
                            <p className="ds-eyebrow" style={{ margin: 0 }}>BEAT LAST TIME</p>
                            <strong>{beatTarget.label}</strong>
                            <p className="ds-muted" style={{ margin: "4px 0 0" }}>{beatTarget.detail}</p>
                          </div>
                          <Button variant="secondary" size="sm" onClick={() => useAllPrevious(exercise.id)} disabled={!exercise.previous.length}>Use all previous</Button>
                        </div>
                      </Card>

                      {nextCue && (
                        <div>
                          <p className="ds-eyebrow" style={{ margin: 0 }}>NEXT · SET {nextCue.setNumber}</p>
                          <strong>{nextCue.target}</strong>
                          <p className="ds-muted" style={{ margin: "4px 0 0" }}>Previous: {nextCue.previous} · aim for honest RIR, not forced reps.</p>
                        </div>
                      )}

                      <details>
                        <summary className="ds-btn ds-btn--ghost" style={{ width: "100%", justifyContent: "space-between" }}>
                          Last 3 sessions <span>{recentSessions.length ? `${recentSessions.length} logged` : "No history"}</span>
                        </summary>
                        <div className="ds-stack" style={{ marginTop: 12 }}>
                          {recentSessions.length ? recentSessions.map((row) => (
                            <ListRow
                              key={row.workoutId}
                              title={new Date(row.completedAt).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
                              sub={row.sets.map((set) => `${set.weight}×${set.reps}${set.rir == null ? "" : ` @${set.rir}`}`).join(" · ")}
                            />
                          )) : <p className="ds-muted" style={{ margin: 0 }}>No previous sessions for this exercise yet.</p>}
                        </div>
                      </details>

                      <details>
                        <summary className="ds-btn ds-btn--ghost" style={{ width: "100%", justifyContent: "space-between" }}>
                          Exercise options <span>rest · notes · substitute · reorder</span>
                        </summary>
                        <div className="ds-stack" style={{ marginTop: 12 }}>
                          <div className="ds-grid-2">
                            <Field label="Rest" suffix="sec">
                              <TextInput type="number" inputMode="numeric" min="15" max="600" step="15" value={exercise.restSeconds} onChange={(event) => updateRest(exercise.id, Number(event.target.value))} />
                            </Field>
                            <Field label="Substitute">
                              <SelectInput value="" onChange={(event) => substituteExercise(exerciseIndex, event.target.value)}>
                                <option value="">Choose…</option>
                                {allDefinitions.filter((definition) => definition.id !== exercise.id).map((definition) => <option key={definition.id} value={definition.id}>{definition.name}</option>)}
                              </SelectInput>
                            </Field>
                          </div>
                          <div className="ds-cluster">
                            {next && <Button variant="ghost" size="sm" onClick={() => pairWithNext(exerciseIndex)}>{pairedWithNext ? "Unpair superset" : "Superset + next"}</Button>}
                            <Button variant="ghost" size="sm" onClick={() => moveExercise(exerciseIndex, exerciseIndex - 1)} disabled={exerciseIndex === 0}>↑ Move up</Button>
                            <Button variant="ghost" size="sm" onClick={() => moveExercise(exerciseIndex, exerciseIndex + 1)} disabled={exerciseIndex === exercises.length - 1}>↓ Move down</Button>
                            <Button variant="ghost" size="sm" onClick={() => skipToday(exerciseIndex)}>Skip today</Button>
                            {persistentExtra && <Button variant="danger" size="sm" onClick={() => removeFromRoutine(exercise.id)}>Remove from routine</Button>}
                          </div>
                          <Field label="Exercise note">
                            <TextAreaInput value={exercise.note} onChange={(event) => updateNote(exercise.id, event.target.value)} placeholder="Seat position, grip, tempo, cues…" />
                          </Field>
                        </div>
                      </details>

                      <div className="ds-stack">
                        {exercise.sets.map((set, setIndex) => {
                          const previous = exercise.previous[setIndex];
                          const editing = Boolean(editingCompleted[set.id]);
                          const locked = set.completed && !editing;
                          return (
                            <Card tight key={set.id}>
                              <div className="ds-stack">
                                <div className="ds-cluster" style={{ justifyContent: "space-between" }}>
                                  <span className="ds-field__control" style={{ maxWidth: 120 }}>
                                    <SelectInput aria-label={`${exercise.name} set type`} value={set.type} disabled={locked} onChange={(event) => updateSetType(exercise.id, set.id, event.target.value as SetType)}>
                                      {setTypes.map((type) => <option key={type.value} value={type.value}>{type.label}</option>)}
                                    </SelectInput>
                                  </span>
                                  <span className="ds-muted" style={{ fontSize: "0.85rem" }}>Prev: {previousLabel(previous)}</span>
                                  <IconButton
                                    small
                                    volt={set.completed}
                                    label={set.completed ? "Reopen completed set" : "Complete set"}
                                    onClick={() => toggleSet(exercise.id, set.id, setIndex)}
                                  >{set.completed ? "✓" : ""}</IconButton>
                                </div>
                                <div className="ds-grid-2">
                                  <Field label="Weight · lb">
                                    <TextInput id={`set-weight-${set.id}`} data-set-focus={set.id} aria-label={`${exercise.name} set ${setIndex + 1} weight`} type="number" inputMode="decimal" readOnly={locked} value={set.weight ?? ""} onChange={(event) => updateSet(exercise.id, set.id, "weight", event.target.value)} />
                                  </Field>
                                  <Field label="Reps">
                                    <TextInput aria-label={`${exercise.name} set ${setIndex + 1} reps`} type="number" inputMode="numeric" readOnly={locked} value={set.reps ?? ""} onChange={(event) => updateSet(exercise.id, set.id, "reps", event.target.value)} />
                                  </Field>
                                </div>
                                <Field label="RIR">
                                  <TextInput aria-label={`${exercise.name} set ${setIndex + 1} RIR`} type="number" inputMode="decimal" min="0" max="10" step="0.5" placeholder="—" readOnly={locked} value={set.rir ?? ""} onChange={(event) => updateSet(exercise.id, set.id, "rir", event.target.value)} />
                                </Field>
                                <div className="ds-cluster">
                                  {set.completed && <Button variant="ghost" size="sm" onClick={() => setEditingCompleted((current) => ({ ...current, [set.id]: !editing }))}>{editing ? "Done" : "Edit"}</Button>}
                                  {!locked && <Button variant="ghost" size="sm" onClick={() => copyPrevious(exercise.id, set.id, setIndex)}>Use previous</Button>}
                                  <Button variant="danger" size="sm" onClick={() => removeSet(exercise.id, set.id)}>Delete</Button>
                                </div>
                              </div>
                            </Card>
                          );
                        })}
                      </div>
                      <Button variant="secondary" size="sm" block onClick={() => addSet(exercise.id)}>＋ Add set</Button>
                    </div>
                  )}
                </div>
              </Card>
            );
          })}
        </div>
      </section>

      <details className="ds-rise ds-rise--3">
        <summary className="ds-btn ds-btn--ghost" style={{ width: "100%", justifyContent: "space-between" }}>
          Session note <span>{sessionNote ? "Saved" : "Optional"}</span>
        </summary>
        <div style={{ marginTop: 12 }}>
          <Field label="Session note">
            <TextAreaInput value={sessionNote} onChange={(event) => setSessionNote(event.target.value)} placeholder="How did the session feel? Equipment changes? Anything to remember next time?" rows={4} />
          </Field>
        </div>
      </details>

      <div className="ds-rise ds-rise--4">
        <SectionHeader eyebrow="Session" title="Finish workout" />
        <p className="ds-muted" style={{ margin: "8px 0 0" }}>Review your progress, then hold to save so an accidental tap cannot end the workout.</p>
        <div className="ds-stack" style={{ marginTop: 12 }}>
          <Button variant="secondary" size="lg" block onClick={() => setFinishOpen((current) => !current)}>Finish workout <span>⌄</span></Button>
          {finishOpen && (
            <Card tight>
              <div className="ds-stack">
                <div className="ds-cluster" style={{ justifyContent: "space-between" }}>
                  <strong>{stats.completedAll}/{stats.totalSets} sets completed</strong>
                </div>
                <span className="ds-muted">{formatDuration(elapsed)} active time · {Math.round(stats.volume).toLocaleString()} lb volume</span>
                <Button
                  variant="primary"
                  size="lg"
                  block
                  className={finishHolding ? "ds-pulse" : ""}
                  onPointerDown={beginFinishHold}
                  onPointerUp={cancelFinishHold}
                  onPointerLeave={cancelFinishHold}
                  onPointerCancel={cancelFinishHold}
                >{finishHolding ? "Keep holding…" : "Hold to finish & save"}</Button>
                <Button variant="ghost" size="sm" onClick={() => setFinishOpen(false)}>Continue workout</Button>
              </div>
            </Card>
          )}
        </div>
      </div>

      {lastSummary && (
        <Card glow className="ds-rise">
          <div className="ds-stack">
            <div className="ds-cluster" style={{ justifyContent: "space-between", alignItems: "flex-start" }}>
              <div>
                <p className="ds-eyebrow ds-eyebrow--volt" style={{ margin: 0 }}>WORKOUT SAVED</p>
                <h2 className="ds-section-title">{lastSummary.name}</h2>
              </div>
              <Button variant="ghost" size="sm" onClick={() => setLastSummary(null)}>Close</Button>
            </div>
            <StatGrid cols={4}>
              <Stat label="Sets" value={lastSummary.sets} />
              <Stat label="Volume" value={`${Math.round(lastSummary.volume).toLocaleString()} lb`} />
              <Stat label="Time" value={formatDuration(lastSummary.duration)} />
              <Stat label="PRs" value={lastSummary.prs.length} tone={lastSummary.prs.length ? "amber" : "default"} />
            </StatGrid>
            {lastSummary.prs.length > 0 && <p className="ds-muted" style={{ margin: 0 }}>🏆 {lastSummary.prs.join(" · ")}</p>}
            {lastSummary.nextTarget && (
              <div>
                <span className="ds-field__label">Next target</span>
                <p style={{ margin: "4px 0 0", fontWeight: 700 }}>{lastSummary.nextTarget}</p>
              </div>
            )}
            {lastSummary.comparison && lastSummary.comparison.length > 0 && (
              <div>
                <p className="ds-eyebrow" style={{ margin: "0 0 6px" }}>VS LAST MATCHING WORKOUT</p>
                <div className="ds-stack">{lastSummary.comparison.map((line) => <strong key={line}>{line}</strong>)}</div>
              </div>
            )}
          </div>
        </Card>
      )}

      {undo && (
        <div
          role="status"
          className="ds-card ds-card--tight ds-rise"
          style={{ position: "fixed", left: 16, right: 16, bottom: "calc(var(--ds-dock-clearance) + 12px)", zIndex: 800, maxWidth: "var(--ds-content-max)", margin: "0 auto" }}
        >
          <div className="ds-cluster" style={{ justifyContent: "space-between" }}>
            <span className="ds-muted">{undo.label}</span>
            <Button variant="ghost" size="sm" onClick={restoreUndo}>Undo</Button>
          </div>
        </div>
      )}
    </PageShell>
  );
}
