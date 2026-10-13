"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  defaultRoutines,
  ensureCurrentRoutineTemplates,
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

type SetType = "working" | "warmup" | "backoff" | "drop" | "failure";

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
};

type StoredCustomExercise = ExerciseDefinition & { equipment?: string };
type NotesMap = Record<string, string>;
type RestMap = Record<string, number>;
type ExtraMap = Record<string, string[]>;
type DraftMap = Record<string, { exercises: GymExercise[]; startedAt: string }>;

type Panel = "exercise" | "custom" | "plate" | "warmup" | null;

const HISTORY_KEY = "workout-tracker:v0.2:history";
const ROUTINES_KEY = "workout-tracker:v0.4:routines";
const ACTIVE_ROUTINE_KEY = "workout-tracker:v0.4:active-routine";
const LEGACY_DRAFTS_KEY = "workout-tracker:v0.4:drafts";
const CUSTOM_KEY = "workout-tracker:v0.7:custom-exercises";
const NOTES_KEY = "workout-tracker:v0.7:exercise-notes";
const REST_KEY = "workout-tracker:v0.7:rest-seconds";
const EXTRAS_KEY = "workout-tracker:v0.7:routine-extras";
const DRAFTS_KEY = "workout-tracker:v0.7:drafts";

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
  setCountOverride?: number,
): GymExercise {
  const setCount = setCountOverride ?? definition.setCount;
  const previous = latestSets(history, definition.id).length
    ? latestSets(history, definition.id)
    : definition.seedPrevious ?? [];
  const decision = progressionDecision(
    previous,
    definition.repMin,
    definition.repMax,
    definition.increment,
    definition.fallbackWeight,
    setCount,
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
    sets: Array.from({ length: setCount }, (_, index) => ({
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
    .map((definition) => makeExercise(definition, history, notes, rests, routine.setCountOverrides?.[definition.id]));
}

function formatDuration(totalSeconds: number) {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
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

export default function GymLogger() {
  const [hydrated, setHydrated] = useState(false);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [routines, setRoutines] = useState<RoutineDefinition[]>(defaultRoutines);
  const [activeRoutineId, setActiveRoutineId] = useState("legs");
  const [customExercises, setCustomExercises] = useState<StoredCustomExercise[]>([]);
  const [notes, setNotes] = useState<NotesMap>({});
  const [rests, setRests] = useState<RestMap>({});
  const [extras, setExtras] = useState<ExtraMap>({});
  const [exercises, setExercises] = useState<GymExercise[]>([]);
  const [startedAt, setStartedAt] = useState(() => new Date().toISOString());
  const [elapsed, setElapsed] = useState(0);
  const [restRemaining, setRestRemaining] = useState(0);
  const [panel, setPanel] = useState<Panel>(null);
  const [search, setSearch] = useState("");
  const [notice, setNotice] = useState("");
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
  const firstSave = useRef(true);

  const activeRoutine = useMemo(
    () => routines.find((routine) => routine.id === activeRoutineId) ?? routines[0] ?? defaultRoutines[2],
    [routines, activeRoutineId],
  );

  const allDefinitions = useMemo(
    () => [...exerciseLibrary, ...customExercises],
    [customExercises],
  );

  useEffect(() => {
    const parsedHistory = readJson<HistoryItem[]>(HISTORY_KEY, []);
    const storedRoutines = readJson<RoutineDefinition[]>(ROUTINES_KEY, defaultRoutines);
    const parsedRoutines = ensureCurrentRoutineTemplates(storedRoutines);
    if (parsedRoutines.length !== storedRoutines.length) localStorage.setItem(ROUTINES_KEY, JSON.stringify(parsedRoutines));
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

    if (draft?.exercises?.length) {
      const migrated = draft.exercises
        .map((exercise) => migrateExercise(exercise, parsedHistory, parsedCustom, parsedNotes, parsedRests))
        .filter((exercise): exercise is GymExercise => Boolean(exercise));
      setExercises(migrated.length ? migrated : makeRoutine(target, parsedHistory, parsedCustom, parsedNotes, parsedRests, parsedExtras));
      setStartedAt(draft.startedAt ?? new Date().toISOString());
    } else {
      setExercises(makeRoutine(target, parsedHistory, parsedCustom, parsedNotes, parsedRests, parsedExtras));
    }
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
    if (firstSave.current) {
      firstSave.current = false;
      return;
    }
    const drafts = readJson<DraftMap>(DRAFTS_KEY, {});
    drafts[activeRoutineId] = { exercises, startedAt };
    localStorage.setItem(DRAFTS_KEY, JSON.stringify(drafts));
  }, [exercises, startedAt, activeRoutineId, hydrated]);

  useEffect(() => {
    if (!hydrated) return;
    const tick = () => setElapsed(Math.max(0, Math.floor((Date.now() - new Date(startedAt).getTime()) / 1000)));
    tick();
    const timer = window.setInterval(tick, 1000);
    return () => window.clearInterval(timer);
  }, [hydrated, startedAt]);

  useEffect(() => {
    if (restRemaining <= 0) return;
    const timer = window.setInterval(() => setRestRemaining((value) => Math.max(0, value - 1)), 1000);
    return () => window.clearInterval(timer);
  }, [restRemaining]);

  const stats = useMemo(() => {
    const performance = exercises.flatMap((exercise) => workingPerformance(exercise.sets));
    return {
      sets: performance.length,
      volume: performance.reduce((sum, set) => sum + set.weight * set.reps, 0),
      rir: averageRir(performance),
    };
  }, [exercises]);

  const filteredDefinitions = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return allDefinitions;
    return allDefinitions.filter(
      (definition) =>
        definition.name.toLowerCase().includes(query) ||
        definition.muscle.toLowerCase().includes(query),
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

  function saveCurrentDraft() {
    const drafts = readJson<DraftMap>(DRAFTS_KEY, {});
    drafts[activeRoutineId] = { exercises, startedAt };
    localStorage.setItem(DRAFTS_KEY, JSON.stringify(drafts));
  }

  function switchRoutine(id: string) {
    if (id === activeRoutineId) return;
    saveCurrentDraft();
    const target = routines.find((routine) => routine.id === id);
    if (!target) return;
    const drafts = readJson<DraftMap>(DRAFTS_KEY, {});
    const draft = drafts[id];
    if (draft?.exercises?.length) {
      const migrated = draft.exercises
        .map((exercise) => migrateExercise(exercise, history, customExercises, notes, rests))
        .filter((exercise): exercise is GymExercise => Boolean(exercise));
      setExercises(migrated);
      setStartedAt(draft.startedAt);
    } else {
      setExercises(makeRoutine(target, history, customExercises, notes, rests, extras));
      setStartedAt(new Date().toISOString());
    }
    setActiveRoutineId(id);
    localStorage.setItem(ACTIVE_ROUTINE_KEY, id);
    setRestRemaining(0);
    setNotice("");
  }

  function updateSet(exerciseId: string, setId: string, field: "weight" | "reps" | "rir", raw: string) {
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

  function bump(exerciseId: string, setId: string, field: "weight" | "reps", amount: number) {
    setExercises((current) =>
      current.map((exercise) =>
        exercise.id !== exerciseId
          ? exercise
          : {
              ...exercise,
              sets: exercise.sets.map((set) =>
                set.id === setId ? { ...set, [field]: Math.max(0, Number(set[field] ?? 0) + amount) } : set,
              ),
            },
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
            set.id === setId
              ? { ...set, weight: Number(prior.weight ?? 0), reps: Number(prior.reps ?? 0) }
              : set,
          ),
        };
      }),
    );
  }

  function toggleSet(exerciseId: string, setId: string, index: number) {
    const exercise = exercises.find((item) => item.id === exerciseId);
    const target = exercise?.sets.find((set) => set.id === setId);
    if (!exercise || !target) return;
    const completing = !target.completed;
    let shouldRest = completing;
    if (completing && exercise.supersetGroup) {
      const partners = exercises.filter(
        (item) => item.id !== exercise.id && item.supersetGroup === exercise.supersetGroup,
      );
      if (partners.length) shouldRest = partners.every((partner) => Boolean(partner.sets[index]?.completed));
    }
    setExercises((current) =>
      current.map((item) =>
        item.id !== exerciseId
          ? item
          : { ...item, sets: item.sets.map((set) => (set.id === setId ? { ...set, completed: !set.completed } : set)) },
      ),
    );
    if (shouldRest) setRestRemaining(exercise.restSeconds);
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
  }

  function removeSet(exerciseId: string, setId: string) {
    setExercises((current) =>
      current.map((exercise) =>
        exercise.id === exerciseId
          ? { ...exercise, sets: exercise.sets.filter((set) => set.id !== setId) }
          : exercise,
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
    const old = exercises[index];
    const replacement = makeExercise(definition, history, notes, rests);
    replacement.sourceId = old.sourceId ?? old.id;
    replacement.supersetGroup = old.supersetGroup;
    setExercises((current) => current.map((exercise, exerciseIndex) => (exerciseIndex === index ? replacement : exercise)));
  }

  function addDefinition(definition: ExerciseDefinition, persist = true) {
    if (!exercises.some((exercise) => exercise.id === definition.id)) {
      setExercises((current) => [...current, makeExercise(definition, history, notes, rests)]);
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
    setCustomExercises((current) => [...current, definition]);
    setExercises((current) => [...current, makeExercise(definition, history, notes, rests)]);
    setExtras((current) => ({
      ...current,
      [activeRoutine.id]: [...new Set([...(current[activeRoutine.id] ?? []), definition.id])],
    }));
    setCustomForm({ name: "", muscle: "Chest", repMin: "8", repMax: "12", increment: "5", fallbackWeight: "0", setCount: "3", equipment: "" });
    setPanel(null);
  }

  function skipToday(index: number) {
    setExercises((current) => current.filter((_, exerciseIndex) => exerciseIndex !== index));
  }

  function finishWorkout() {
    const working = exercises.flatMap((exercise) => workingPerformance(exercise.sets));
    if (!working.length) {
      setNotice("Complete at least one working set before finishing.");
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
    setHistory(nextHistory);
    setExercises(makeRoutine(activeRoutine, nextHistory, customExercises, notes, rests, extras));
    setStartedAt(new Date().toISOString());
    setRestRemaining(0);
    setNotice(`Saved ${activeRoutine.name}: ${item.completedSets} working sets · ${Math.round(item.totalVolume).toLocaleString()} lb${prs.length ? ` · ${prs.length} PR${prs.length === 1 ? "" : "s"}` : ""}.`);
  }

  if (!hydrated) {
    return (
      <PageShell>
        <p className="ds-muted">Loading Gym Mode…</p>
      </PageShell>
    );
  }

  return (
    <PageShell>
      <div className="ds-rise">
        <PageHeader
          eyebrow="V0.7 · TRAINING EXPERIENCE"
          title={activeRoutine.name}
          lede="Fast logging, set types, notes, supersets, substitutions, custom rest and custom exercises."
        />
      </div>

      <Card className="ds-rise ds-rise--1">
        <div className="ds-stack">
          <TimerFace digits={formatDuration(elapsed)} label="SESSION" />
          <div className="ds-cluster" style={{ justifyContent: "flex-end" }}>
            <a className="ds-btn ds-btn--ghost" href="/">Full view</a>
          </div>
        </div>
      </Card>

      <div className="ds-rise ds-rise--2" role="group" aria-label="Routines">
        <ChipRow>
          {routines.map((routine) => (
            <Chip key={routine.id} selected={routine.id === activeRoutineId} onClick={() => switchRoutine(routine.id)}>{routine.name}</Chip>
          ))}
        </ChipRow>
      </div>

      <div className="ds-rise ds-rise--2">
        <StatGrid cols={4}>
          <Stat label="Working sets" value={stats.sets} />
          <Stat label="Volume" value={`${Math.round(stats.volume).toLocaleString()} lb`} />
          <Stat label="Avg RIR" value={stats.rir == null ? "—" : stats.rir.toFixed(1)} />
          <Stat label="Rest" value={restRemaining ? formatDuration(restRemaining) : "Ready"} tone={restRemaining ? "volt" : "default"} />
        </StatGrid>
      </div>

      {restRemaining > 0 && (
        <Card tight className="ds-rise">
          <div className="ds-stack">
            <TimerFace digits={formatDuration(restRemaining)} label="REST" pulse />
            <div className="ds-cluster" style={{ justifyContent: "center" }}>
              <Button variant="secondary" size="sm" onClick={() => setRestRemaining((value) => Math.max(0, value - 30))}>−30</Button>
              <Button variant="ghost" size="sm" onClick={() => setRestRemaining(0)}>Skip</Button>
              <Button variant="secondary" size="sm" onClick={() => setRestRemaining((value) => value + 30)}>+30</Button>
            </div>
          </div>
        </Card>
      )}

      <div className="ds-rise ds-rise--3" role="group" aria-label="Workout tools">
        <ChipRow>
          <Chip selected={panel === "exercise"} onClick={() => setPanel("exercise")}>＋ Exercise</Chip>
          <Chip selected={panel === "custom"} onClick={() => setPanel("custom")}>✚ Custom</Chip>
          <Chip selected={panel === "plate"} onClick={() => setPanel("plate")}>◉ Plates</Chip>
          <Chip selected={panel === "warmup"} onClick={() => setPanel("warmup")}>🔥 Warm-up</Chip>
        </ChipRow>
      </div>

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

            return (
              <Card key={`${exercise.id}-${exerciseIndex}`}>
                <div className="ds-stack">
                  <div>
                    <p className="ds-eyebrow" style={{ margin: 0 }}>{exercise.muscle.toUpperCase()} · {exercise.repMin}–{exercise.repMax} REPS</p>
                    <h3 className="ds-section-title">{exercise.name}</h3>
                    {exercise.sourceId && <p className="ds-muted" style={{ margin: "4px 0 0", fontSize: "0.82rem" }}>Substituted for {definitionFor(exercise.sourceId, customExercises)?.name ?? exercise.sourceId}</p>}
                  </div>

                  <div className="ds-cluster">
                    {isPr && <Badge tone="amber">🏆 PR</Badge>}
                    {exercise.supersetGroup && <Badge tone="blue">↔ SUPERSET</Badge>}
                    <Badge>{actionLabel(exercise.progressionAction)}</Badge>
                  </div>

                  <Card tight>
                    <strong>{exercise.recommendation}</strong>
                    <p className="ds-muted" style={{ margin: "4px 0 0" }}>Previous: {exercise.previous.length ? exercise.previous.map((set) => `${set.weight}×${set.reps}`).join(" · ") : "none"}</p>
                  </Card>

                  <div className="ds-stack">
                    <div className="ds-grid-2">
                      <Field label="Rest" suffix="sec">
                        <TextInput type="number" min="15" max="600" step="15" value={exercise.restSeconds} onChange={(event) => updateRest(exercise.id, Number(event.target.value))} />
                      </Field>
                      <Field label="Substitute">
                        <SelectInput value="" onChange={(event) => substituteExercise(exerciseIndex, event.target.value)}>
                          <option value="">Choose…</option>
                          {allDefinitions.filter((definition) => definition.id !== exercise.id).map((definition) => <option key={definition.id} value={definition.id}>{definition.name}</option>)}
                        </SelectInput>
                      </Field>
                    </div>
                    <div className="ds-cluster">
                      {next && <Button variant="ghost" size="sm" onClick={() => pairWithNext(exerciseIndex)}>{pairedWithNext ? "Unpair" : "Superset + next"}</Button>}
                      <Button variant="ghost" size="sm" onClick={() => skipToday(exerciseIndex)}>Skip today</Button>
                      {persistentExtra && <Button variant="danger" size="sm" onClick={() => removeFromRoutine(exercise.id)}>Remove from routine</Button>}
                    </div>
                    <Field label="Note">
                      <TextAreaInput value={exercise.note} onChange={(event) => updateNote(exercise.id, event.target.value)} placeholder="Persistent note — seat position, grip, tempo, cues…" />
                    </Field>
                  </div>

                  <div className="ds-stack">
                    {exercise.sets.map((set, setIndex) => {
                      const previous = exercise.previous[setIndex];
                      return (
                        <Card tight key={set.id}>
                          <div className="ds-stack">
                            <div className="ds-cluster" style={{ justifyContent: "space-between" }}>
                              <span className="ds-field__control" style={{ maxWidth: 120 }}>
                                <SelectInput aria-label={`${exercise.name} set type`} value={set.type} onChange={(event) => updateSetType(exercise.id, set.id, event.target.value as SetType)}>
                                  {setTypes.map((type) => <option key={type.value} value={type.value}>{type.label}</option>)}
                                </SelectInput>
                              </span>
                              <span className="ds-muted" style={{ fontSize: "0.85rem" }}>Prev: {previous ? `${previous.weight}×${previous.reps}` : "—"}</span>
                              <IconButton
                                small
                                volt={set.completed}
                                label={set.completed ? "Reopen set" : "Complete set"}
                                onClick={() => toggleSet(exercise.id, set.id, setIndex)}
                              >{set.completed ? "✓" : ""}</IconButton>
                            </div>
                            <div className="ds-grid-2">
                              <Stepper
                                label="Weight"
                                unit="lb"
                                value={String(set.weight ?? "")}
                                editable
                                inputProps={{ type: "number", inputMode: "decimal", onChange: (event) => updateSet(exercise.id, set.id, "weight", event.target.value) }}
                                onDecrement={() => bump(exercise.id, set.id, "weight", -5)}
                                onIncrement={() => bump(exercise.id, set.id, "weight", 5)}
                              />
                              <Field label="Reps">
                                <TextInput aria-label={`${exercise.name} set ${setIndex + 1} reps`} type="number" inputMode="numeric" value={set.reps ?? ""} onChange={(event) => updateSet(exercise.id, set.id, "reps", event.target.value)} />
                              </Field>
                            </div>
                            <Field label="RIR">
                              <TextInput aria-label={`${exercise.name} set ${setIndex + 1} RIR`} type="number" inputMode="decimal" min="0" max="10" step="0.5" placeholder="—" value={set.rir ?? ""} onChange={(event) => updateSet(exercise.id, set.id, "rir", event.target.value)} />
                            </Field>
                            <div className="ds-cluster">
                              <Button variant="ghost" size="sm" onClick={() => copyPrevious(exercise.id, set.id, setIndex)}>Copy</Button>
                              <Button variant="ghost" size="sm" onClick={() => bump(exercise.id, set.id, "reps", 1)}>+1 rep</Button>
                              <Button variant="danger" size="sm" onClick={() => removeSet(exercise.id, set.id)}>Delete</Button>
                            </div>
                          </div>
                        </Card>
                      );
                    })}
                  </div>
                  <Button variant="secondary" size="sm" block onClick={() => addSet(exercise.id)}>＋ Add set</Button>
                </div>
              </Card>
            );
          })}
        </div>
      </section>

      <div className="ds-rise ds-rise--4">
        <SectionHeader eyebrow="Session" title="Finish workout" />
        <p className="ds-muted" style={{ margin: "8px 0 0" }}>Only Work sets feed normal volume, PRs and progression. Warm-up/drop/failure/back-off details are still saved in the v0.7 session metadata.</p>
        <div style={{ marginTop: 12 }}>
          <Button variant="primary" size="lg" block onClick={finishWorkout}>Finish & save</Button>
        </div>
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
              <TextInput value={customForm.name} onChange={(event) => setCustomForm((current) => ({ ...current, name: event.target.value }))} placeholder="e.g. Prime Plate-Loaded Row" />
            </Field>
            <Field label="Muscle">
              <SelectInput value={customForm.muscle} onChange={(event) => setCustomForm((current) => ({ ...current, muscle: event.target.value as MuscleGroup }))}>
                {muscleOptions.map((muscle) => <option key={muscle}>{muscle}</option>)}
              </SelectInput>
            </Field>
            <div className="ds-grid-2">
              <Field label="Rep min">
                <TextInput type="number" value={customForm.repMin} onChange={(event) => setCustomForm((current) => ({ ...current, repMin: event.target.value }))} />
              </Field>
              <Field label="Rep max">
                <TextInput type="number" value={customForm.repMax} onChange={(event) => setCustomForm((current) => ({ ...current, repMax: event.target.value }))} />
              </Field>
            </div>
            <div className="ds-grid-2">
              <Field label="Increment">
                <TextInput type="number" step="0.5" value={customForm.increment} onChange={(event) => setCustomForm((current) => ({ ...current, increment: event.target.value }))} />
              </Field>
              <Field label="Starting weight">
                <TextInput type="number" value={customForm.fallbackWeight} onChange={(event) => setCustomForm((current) => ({ ...current, fallbackWeight: event.target.value }))} />
              </Field>
            </div>
            <div className="ds-grid-2">
              <Field label="Sets">
                <TextInput type="number" min="1" max="10" value={customForm.setCount} onChange={(event) => setCustomForm((current) => ({ ...current, setCount: event.target.value }))} />
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
                inputProps={{ type: "number", onChange: (event) => setPlateTarget(Number(event.target.value)) }}
                onDecrement={() => setPlateTarget((value) => Math.max(0, value - 5))}
                onIncrement={() => setPlateTarget((value) => value + 5)}
              />
              <Stepper
                label="Bar"
                unit="lb"
                value={String(barWeight)}
                editable
                inputProps={{ type: "number", onChange: (event) => setBarWeight(Number(event.target.value)) }}
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
              inputProps={{ type: "number", onChange: (event) => setWarmupWeight(Number(event.target.value)) }}
              onDecrement={() => setWarmupWeight((value) => Math.max(0, value - 5))}
              onIncrement={() => setWarmupWeight((value) => value + 5)}
            />
            <div className="ds-stack">
              {warmups.map((warmup) => (
                <ListRow key={warmup.pct} title={`${warmup.pct}%`} sub={`${warmup.weight} lb × ${warmup.reps}`} />
              ))}
            </div>
            <p className="ds-muted" style={{ margin: 0 }}>Simple ramp-up template. Adjust down if you are already warm or the movement is very light.</p>
          </div>
        )}
      </Sheet>
    </PageShell>
  );
}
