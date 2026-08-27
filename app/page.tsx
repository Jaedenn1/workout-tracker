"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  defaultRoutines,
  exerciseLibrary,
  getExerciseDefinition,
  type ExerciseDefinition,
  type RoutineDefinition,
} from "../src/data/training";
import {
  averageRir,
  bestEstimatedOneRepMax,
  estimateOneRepMax,
  progressionDecision,
  type PerformanceSet,
  type ProgressionAction,
} from "../src/lib/progression";

type LoggedSet = {
  id: string;
  weight: number | null;
  reps: number | null;
  rir: number | null;
  completed: boolean;
};

type PreviousSet = {
  weight: number;
  reps: number;
  rir?: number | null;
};

type ExerciseState = {
  id: string;
  name: string;
  muscle: string;
  repMin: number;
  repMax: number;
  increment: number;
  fallbackWeight: number;
  previous: PreviousSet[];
  suggestedWeights: number[];
  recommendation: string;
  progressionAction: ProgressionAction;
  sets: LoggedSet[];
};

type WorkoutHistoryExercise = {
  id: string;
  name: string;
  repMin: number;
  repMax: number;
  increment: number;
  sets: Array<{
    weight: number;
    reps: number;
    rir?: number | null;
    estimated1RM?: number;
  }>;
};

type WorkoutHistoryItem = {
  id: string;
  routineId?: string;
  name: string;
  completedAt: string;
  durationSeconds: number;
  totalVolume: number;
  completedSets: number;
  averageRir?: number | null;
  prs?: string[];
  exercises: WorkoutHistoryExercise[];
};

type FinishSummary = {
  completedSets: number;
  totalVolume: number;
  averageRir: number | null;
  prs: string[];
  nextTargets: Array<{ name: string; text: string }>;
};

type Draft = {
  exercises: ExerciseState[];
  startedAt: string;
};

type DraftMap = Record<string, Draft>;

type ExerciseHistoryEntry = {
  workoutId: string;
  workoutName: string;
  completedAt: string;
  sets: PreviousSet[];
  volume: number;
  bestE1rm: number;
};

const HISTORY_KEY = "workout-tracker:v0.2:history";
const LEGACY_DRAFT_KEY = "workout-tracker:v0.2:draft";
const ROUTINES_KEY = "workout-tracker:v0.4:routines";
const ACTIVE_ROUTINE_KEY = "workout-tracker:v0.4:active-routine";
const DRAFTS_KEY = "workout-tracker:v0.4:drafts";
const REST_SECONDS = 90;

function normalizePerformanceSets(sets: PreviousSet[]): PerformanceSet[] {
  return sets
    .filter((set) => Number.isFinite(set.weight) && Number.isFinite(set.reps))
    .map((set) => ({
      weight: Number(set.weight),
      reps: Number(set.reps),
      rir: set.rir ?? null,
    }));
}

function latestExerciseSets(
  history: WorkoutHistoryItem[],
  definition: ExerciseDefinition,
): PreviousSet[] {
  for (const workout of history) {
    const found = workout.exercises?.find((exercise) => exercise.id === definition.id);
    if (found?.sets?.length) {
      return found.sets.map((set) => ({
        weight: Number(set.weight),
        reps: Number(set.reps),
        rir: set.rir ?? null,
      }));
    }
  }

  return definition.seedPrevious ?? [];
}

function makeExerciseState(
  definition: ExerciseDefinition,
  history: WorkoutHistoryItem[],
): ExerciseState {
  const previous = latestExerciseSets(history, definition);
  const decision = progressionDecision(
    normalizePerformanceSets(previous),
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
    sets: Array.from({ length: definition.setCount }, (_, index) => ({
      id: `${definition.id}-${index + 1}-${Date.now()}`,
      weight: decision.suggestedWeights[index] || null,
      reps: null,
      rir: null,
      completed: false,
    })),
  };
}

function makeWorkout(
  routine: RoutineDefinition,
  history: WorkoutHistoryItem[],
): ExerciseState[] {
  return routine.exerciseIds
    .map((id) => getExerciseDefinition(id))
    .filter((definition): definition is ExerciseDefinition => definition != null)
    .map((definition) => makeExerciseState(definition, history));
}

function migrateExerciseState(
  exercise: Partial<ExerciseState> & { id: string; sets?: LoggedSet[] },
  history: WorkoutHistoryItem[],
): ExerciseState | null {
  const definition = getExerciseDefinition(exercise.id);
  if (!definition) return null;

  const fresh = makeExerciseState(definition, history);
  const previous = Array.isArray(exercise.previous)
    ? exercise.previous.map((set) => ({
        weight: Number(set.weight),
        reps: Number(set.reps),
        rir: set.rir ?? null,
      }))
    : fresh.previous;

  const decision = progressionDecision(
    normalizePerformanceSets(previous),
    definition.repMin,
    definition.repMax,
    definition.increment,
    definition.fallbackWeight,
    Math.max(definition.setCount, exercise.sets?.length ?? 0),
  );

  return {
    ...fresh,
    previous,
    suggestedWeights: exercise.suggestedWeights ?? decision.suggestedWeights,
    recommendation: exercise.recommendation ?? decision.reason,
    progressionAction: exercise.progressionAction ?? decision.action,
    sets: (exercise.sets?.length ? exercise.sets : fresh.sets).map((set, index) => ({
      id: set.id || `${definition.id}-${index + 1}-${Date.now()}`,
      weight: set.weight ?? null,
      reps: set.reps ?? null,
      rir: set.rir ?? null,
      completed: Boolean(set.completed),
    })),
  };
}

function formatDuration(totalSeconds: number) {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

function completedPerformanceSets(exercise: ExerciseState): PerformanceSet[] {
  return exercise.sets
    .filter(
      (set) =>
        set.completed &&
        set.weight != null &&
        set.reps != null &&
        set.weight >= 0 &&
        set.reps > 0,
    )
    .map((set) => ({
      weight: set.weight as number,
      reps: set.reps as number,
      rir: set.rir,
    }));
}

function historicalBest(
  history: WorkoutHistoryItem[],
  exerciseId: string,
  seededPrevious: PreviousSet[],
) {
  const fromHistory = history.flatMap((workout) => {
    const exercise = workout.exercises?.find((item) => item.id === exerciseId);
    return exercise
      ? exercise.sets.map((set) => ({
          weight: set.weight,
          reps: set.reps,
          rir: set.rir ?? null,
        }))
      : [];
  });

  return bestEstimatedOneRepMax([
    ...normalizePerformanceSets(seededPrevious),
    ...fromHistory,
  ]);
}

function targetLabel(exercise: ExerciseState) {
  const weights = exercise.suggestedWeights.filter((weight) => weight > 0);
  if (weights.length === 0) return `${exercise.repMin}–${exercise.repMax} reps`;

  const unique = [...new Set(weights)];
  const loadText = unique.length === 1 ? `${unique[0]} lb` : `${weights.join(" / ")} lb`;
  return `${loadText} · ${exercise.repMin}–${exercise.repMax} reps`;
}

function actionLabel(action: ProgressionAction) {
  if (action === "increase") return "↑ Add load";
  if (action === "hold") return "Hold";
  return "Beat reps";
}

function readDrafts(): DraftMap {
  try {
    const raw = localStorage.getItem(DRAFTS_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function writeDraft(routineId: string, exercises: ExerciseState[], startedAt: string) {
  const drafts = readDrafts();
  drafts[routineId] = { exercises, startedAt };
  localStorage.setItem(DRAFTS_KEY, JSON.stringify(drafts));
}

function removeDraft(routineId: string) {
  const drafts = readDrafts();
  delete drafts[routineId];
  localStorage.setItem(DRAFTS_KEY, JSON.stringify(drafts));
}

function exerciseHistory(
  history: WorkoutHistoryItem[],
  exerciseId: string,
): ExerciseHistoryEntry[] {
  return history.flatMap((workout) => {
    const exercise = workout.exercises?.find((item) => item.id === exerciseId);
    if (!exercise?.sets?.length) return [];

    const sets = exercise.sets.map((set) => ({
      weight: set.weight,
      reps: set.reps,
      rir: set.rir ?? null,
    }));
    const performance = normalizePerformanceSets(sets);

    return [
      {
        workoutId: workout.id,
        workoutName: workout.name,
        completedAt: workout.completedAt,
        sets,
        volume: sets.reduce((sum, set) => sum + set.weight * set.reps, 0),
        bestE1rm: bestEstimatedOneRepMax(performance),
      },
    ];
  });
}

export default function Home() {
  const [history, setHistory] = useState<WorkoutHistoryItem[]>([]);
  const [routines, setRoutines] = useState<RoutineDefinition[]>(defaultRoutines);
  const [activeRoutineId, setActiveRoutineId] = useState("legs");
  const [exercises, setExercises] = useState<ExerciseState[]>(() =>
    makeWorkout(defaultRoutines[2], []),
  );
  const [hydrated, setHydrated] = useState(false);
  const [startedAt, setStartedAt] = useState(() => new Date().toISOString());
  const [elapsed, setElapsed] = useState(0);
  const [restRemaining, setRestRemaining] = useState(0);
  const [finishedMessage, setFinishedMessage] = useState<string | null>(null);
  const [finishSummary, setFinishSummary] = useState<FinishSummary | null>(null);
  const [showRoutineEditor, setShowRoutineEditor] = useState(false);
  const [librarySearch, setLibrarySearch] = useState("");
  const [analyticsExerciseId, setAnalyticsExerciseId] = useState<string | null>(null);
  const firstDraftSave = useRef(true);

  const activeRoutine = useMemo(
    () =>
      routines.find((routine) => routine.id === activeRoutineId) ??
      routines[0] ??
      defaultRoutines[2],
    [routines, activeRoutineId],
  );

  useEffect(() => {
    let parsedHistory: WorkoutHistoryItem[] = [];
    let parsedRoutines: RoutineDefinition[] = defaultRoutines;

    try {
      const savedHistory = localStorage.getItem(HISTORY_KEY);
      parsedHistory = savedHistory ? JSON.parse(savedHistory) : [];
    } catch {
      parsedHistory = [];
    }

    try {
      const savedRoutines = localStorage.getItem(ROUTINES_KEY);
      const candidate = savedRoutines ? JSON.parse(savedRoutines) : null;
      if (Array.isArray(candidate) && candidate.length > 0) parsedRoutines = candidate;
    } catch {
      parsedRoutines = defaultRoutines;
    }

    let targetRoutineId = localStorage.getItem(ACTIVE_ROUTINE_KEY) ?? "legs";
    if (!parsedRoutines.some((routine) => routine.id === targetRoutineId)) {
      targetRoutineId = parsedRoutines[0]?.id ?? "legs";
    }

    let drafts = readDrafts();

    if (!drafts.legs) {
      try {
        const legacy = localStorage.getItem(LEGACY_DRAFT_KEY);
        if (legacy) {
          const parsed = JSON.parse(legacy) as Draft;
          drafts.legs = parsed;
          localStorage.setItem(DRAFTS_KEY, JSON.stringify(drafts));
          localStorage.removeItem(LEGACY_DRAFT_KEY);
        }
      } catch {
        // Ignore an unreadable legacy draft.
      }
    }

    const targetRoutine =
      parsedRoutines.find((routine) => routine.id === targetRoutineId) ??
      parsedRoutines[0] ??
      defaultRoutines[2];
    const draft = drafts[targetRoutine.id];

    setHistory(parsedHistory);
    setRoutines(parsedRoutines);
    setActiveRoutineId(targetRoutine.id);

    if (draft?.exercises?.length) {
      const migrated = draft.exercises
        .map((exercise) => migrateExerciseState(exercise, parsedHistory))
        .filter((exercise): exercise is ExerciseState => exercise != null);
      const ordered = targetRoutine.exerciseIds
        .map((id) => migrated.find((exercise) => exercise.id === id))
        .filter((exercise): exercise is ExerciseState => exercise != null);
      setExercises(ordered.length ? ordered : makeWorkout(targetRoutine, parsedHistory));
      setStartedAt(draft.startedAt || new Date().toISOString());
    } else {
      setExercises(makeWorkout(targetRoutine, parsedHistory));
    }

    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    localStorage.setItem(ROUTINES_KEY, JSON.stringify(routines));
  }, [routines, hydrated]);

  useEffect(() => {
    if (!hydrated) return;
    localStorage.setItem(ACTIVE_ROUTINE_KEY, activeRoutineId);
  }, [activeRoutineId, hydrated]);

  useEffect(() => {
    if (!hydrated) return;
    if (firstDraftSave.current) {
      firstDraftSave.current = false;
      return;
    }
    writeDraft(activeRoutineId, exercises, startedAt);
  }, [exercises, hydrated, startedAt, activeRoutineId]);

  useEffect(() => {
    if (!hydrated) return;
    const tick = () => {
      setElapsed(
        Math.max(0, Math.floor((Date.now() - new Date(startedAt).getTime()) / 1000)),
      );
    };
    tick();
    const timer = window.setInterval(tick, 1000);
    return () => window.clearInterval(timer);
  }, [hydrated, startedAt]);

  useEffect(() => {
    if (restRemaining <= 0) return;
    const timer = window.setInterval(() => {
      setRestRemaining((current) => Math.max(0, current - 1));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [restRemaining]);

  const stats = useMemo(() => {
    let completedSets = 0;
    let totalVolume = 0;
    const effort: PerformanceSet[] = [];

    for (const exercise of exercises) {
      for (const set of exercise.sets) {
        if (!set.completed || set.weight == null || set.reps == null) continue;
        completedSets += 1;
        totalVolume += set.weight * set.reps;
        effort.push({ weight: set.weight, reps: set.reps, rir: set.rir });
      }
    }

    return { completedSets, totalVolume, averageRir: averageRir(effort) };
  }, [exercises]);

  const totalSets = useMemo(
    () => exercises.reduce((sum, exercise) => sum + exercise.sets.length, 0),
    [exercises],
  );

  const selectedAnalyticsDefinition = analyticsExerciseId
    ? getExerciseDefinition(analyticsExerciseId)
    : null;
  const selectedAnalyticsHistory = useMemo(
    () => (analyticsExerciseId ? exerciseHistory(history, analyticsExerciseId) : []),
    [history, analyticsExerciseId],
  );
  const selectedAnalyticsBest = useMemo(
    () => Math.max(0, ...selectedAnalyticsHistory.map((entry) => entry.bestE1rm)),
    [selectedAnalyticsHistory],
  );

  const filteredLibrary = useMemo(() => {
    const query = librarySearch.trim().toLowerCase();
    if (!query) return exerciseLibrary;
    return exerciseLibrary.filter(
      (exercise) =>
        exercise.name.toLowerCase().includes(query) ||
        exercise.muscle.toLowerCase().includes(query),
    );
  }, [librarySearch]);

  function updateSet(
    exerciseId: string,
    setId: string,
    field: "weight" | "reps" | "rir",
    value: string,
  ) {
    const parsed = value === "" ? null : Number(value);
    setExercises((current) =>
      current.map((exercise) =>
        exercise.id !== exerciseId
          ? exercise
          : {
              ...exercise,
              sets: exercise.sets.map((set) =>
                set.id === setId ? { ...set, [field]: parsed } : set,
              ),
            },
      ),
    );
  }

  function toggleSet(exerciseId: string, setId: string) {
    let becameComplete = false;
    setExercises((current) =>
      current.map((exercise) =>
        exercise.id !== exerciseId
          ? exercise
          : {
              ...exercise,
              sets: exercise.sets.map((set) => {
                if (set.id !== setId) return set;
                const completed = !set.completed;
                becameComplete = completed;
                return { ...set, completed };
              }),
            },
      ),
    );
    if (becameComplete) setRestRemaining(REST_SECONDS);
  }

  function addSet(exerciseId: string) {
    setExercises((current) =>
      current.map((exercise) => {
        if (exercise.id !== exerciseId) return exercise;
        return {
          ...exercise,
          sets: [
            ...exercise.sets,
            {
              id: `${exercise.id}-${Date.now()}`,
              weight:
                exercise.sets.at(-1)?.weight ??
                exercise.suggestedWeights.at(-1) ??
                exercise.fallbackWeight ??
                null,
              reps: null,
              rir: null,
              completed: false,
            },
          ],
        };
      }),
    );
  }

  function adjustRest(seconds: number) {
    setRestRemaining((current) => Math.max(0, current + seconds));
  }

  function switchRoutine(routineId: string) {
    if (routineId === activeRoutineId) return;
    writeDraft(activeRoutineId, exercises, startedAt);

    const target = routines.find((routine) => routine.id === routineId);
    if (!target) return;

    const draft = readDrafts()[routineId];
    if (draft?.exercises?.length) {
      const migrated = draft.exercises
        .map((exercise) => migrateExerciseState(exercise, history))
        .filter((exercise): exercise is ExerciseState => exercise != null);
      const ordered = target.exerciseIds
        .map((id) => migrated.find((exercise) => exercise.id === id))
        .filter((exercise): exercise is ExerciseState => exercise != null);
      setExercises(ordered.length ? ordered : makeWorkout(target, history));
      setStartedAt(draft.startedAt || new Date().toISOString());
    } else {
      setExercises(makeWorkout(target, history));
      setStartedAt(new Date().toISOString());
    }

    setActiveRoutineId(routineId);
    setRestRemaining(0);
    setFinishedMessage(null);
    setFinishSummary(null);
    setAnalyticsExerciseId(null);
  }

  function resetWorkout() {
    removeDraft(activeRoutine.id);
    const nextStartedAt = new Date().toISOString();
    setExercises(makeWorkout(activeRoutine, history));
    setStartedAt(nextStartedAt);
    setRestRemaining(0);
    setFinishedMessage(null);
    setFinishSummary(null);
  }

  function renameActiveRoutine(name: string) {
    setRoutines((current) =>
      current.map((routine) =>
        routine.id === activeRoutine.id ? { ...routine, name } : routine,
      ),
    );
  }

  function addExerciseToRoutine(exerciseId: string) {
    if (activeRoutine.exerciseIds.includes(exerciseId)) return;
    const definition = getExerciseDefinition(exerciseId);
    if (!definition) return;

    setRoutines((current) =>
      current.map((routine) =>
        routine.id === activeRoutine.id
          ? { ...routine, exerciseIds: [...routine.exerciseIds, exerciseId] }
          : routine,
      ),
    );
    setExercises((current) => [...current, makeExerciseState(definition, history)]);
  }

  function removeExerciseFromRoutine(exerciseId: string) {
    setRoutines((current) =>
      current.map((routine) =>
        routine.id === activeRoutine.id
          ? {
              ...routine,
              exerciseIds: routine.exerciseIds.filter((id) => id !== exerciseId),
            }
          : routine,
      ),
    );
    setExercises((current) => current.filter((exercise) => exercise.id !== exerciseId));
    if (analyticsExerciseId === exerciseId) setAnalyticsExerciseId(null);
  }

  function moveExercise(exerciseId: string, direction: -1 | 1) {
    const currentIds = [...activeRoutine.exerciseIds];
    const index = currentIds.indexOf(exerciseId);
    const nextIndex = index + direction;
    if (index < 0 || nextIndex < 0 || nextIndex >= currentIds.length) return;

    [currentIds[index], currentIds[nextIndex]] = [currentIds[nextIndex], currentIds[index]];
    setRoutines((current) =>
      current.map((routine) =>
        routine.id === activeRoutine.id ? { ...routine, exerciseIds: currentIds } : routine,
      ),
    );
    setExercises((current) =>
      currentIds
        .map((id) => current.find((exercise) => exercise.id === id))
        .filter((exercise): exercise is ExerciseState => exercise != null),
    );
  }

  function createRoutine() {
    const id = `custom-${Date.now()}`;
    const nextRoutine: RoutineDefinition = { id, name: "Custom Day", exerciseIds: [] };
    writeDraft(activeRoutineId, exercises, startedAt);
    setRoutines((current) => [...current, nextRoutine]);
    setActiveRoutineId(id);
    setExercises([]);
    setStartedAt(new Date().toISOString());
    setFinishedMessage(null);
    setFinishSummary(null);
    setShowRoutineEditor(true);
  }

  function deleteActiveRoutine() {
    if (routines.length <= 1) return;
    if (!window.confirm(`Delete ${activeRoutine.name}? Workout history will stay saved.`)) return;

    const remaining = routines.filter((routine) => routine.id !== activeRoutine.id);
    const next = remaining[0];
    removeDraft(activeRoutine.id);
    setRoutines(remaining);
    setActiveRoutineId(next.id);
    const draft = readDrafts()[next.id];
    if (draft?.exercises?.length) {
      const migrated = draft.exercises
        .map((exercise) => migrateExerciseState(exercise, history))
        .filter((exercise): exercise is ExerciseState => exercise != null);
      setExercises(migrated);
      setStartedAt(draft.startedAt);
    } else {
      setExercises(makeWorkout(next, history));
      setStartedAt(new Date().toISOString());
    }
    setShowRoutineEditor(false);
  }

  function finishWorkout() {
    if (stats.completedSets === 0) {
      setFinishedMessage("Complete at least one set before finishing the workout.");
      return;
    }

    const prs: string[] = [];

    for (const exercise of exercises) {
      const completed = completedPerformanceSets(exercise);
      if (completed.length === 0) continue;
      const currentBest = bestEstimatedOneRepMax(completed);
      const priorBest = historicalBest(history, exercise.id, exercise.previous);
      if (priorBest > 0 && currentBest > priorBest + 0.5) {
        prs.push(`${exercise.name}: ${Math.round(currentBest)} lb estimated 1RM`);
      }
    }

    const completedAt = new Date().toISOString();
    const item: WorkoutHistoryItem = {
      id: `workout-${Date.now()}`,
      routineId: activeRoutine.id,
      name: activeRoutine.name || "Workout",
      completedAt,
      durationSeconds: elapsed,
      totalVolume: stats.totalVolume,
      completedSets: stats.completedSets,
      averageRir: stats.averageRir,
      prs,
      exercises: exercises
        .map((exercise) => ({
          id: exercise.id,
          name: exercise.name,
          repMin: exercise.repMin,
          repMax: exercise.repMax,
          increment: exercise.increment,
          sets: exercise.sets
            .filter(
              (set) =>
                set.completed &&
                set.weight != null &&
                set.reps != null &&
                set.reps > 0,
            )
            .map((set) => ({
              weight: set.weight as number,
              reps: set.reps as number,
              rir: set.rir,
              estimated1RM: estimateOneRepMax(set.weight as number, set.reps as number),
            })),
        }))
        .filter((exercise) => exercise.sets.length > 0),
    };

    const nextHistory = [item, ...history].slice(0, 100);
    const nextWorkout = makeWorkout(activeRoutine, nextHistory);

    localStorage.setItem(HISTORY_KEY, JSON.stringify(nextHistory));
    removeDraft(activeRoutine.id);
    setHistory(nextHistory);
    setFinishSummary({
      completedSets: item.completedSets,
      totalVolume: item.totalVolume,
      averageRir: item.averageRir ?? null,
      prs,
      nextTargets: nextWorkout
        .filter((exercise) => item.exercises.some((done) => done.id === exercise.id))
        .map((exercise) => ({
          name: exercise.name,
          text: `${targetLabel(exercise)} — ${exercise.recommendation}`,
        })),
    });
    setFinishedMessage(
      `Saved ${activeRoutine.name}: ${item.completedSets} working sets · ${Math.round(
        item.totalVolume,
      ).toLocaleString()} lb volume${prs.length ? ` · ${prs.length} PR${prs.length === 1 ? "" : "s"}` : ""}.`,
    );
    setExercises(nextWorkout);
    setStartedAt(new Date().toISOString());
    setRestRemaining(0);
  }

  if (!hydrated) {
    return (
      <main className="shell loading-shell">
        <p className="muted">Loading your workouts…</p>
      </main>
    );
  }

  return (
    <main className="shell">
      <header className="hero">
        <div>
          <p className="eyebrow">V0.4 · ROUTINES + ANALYTICS</p>
          <h1>{activeRoutine.name || "Workout"}</h1>
          <p className="muted">
            Pick a routine, log fast, and see exactly how each exercise is progressing.
          </p>
        </div>
        <div className="session-clock" aria-label="Workout duration">
          <span>Session</span>
          <strong>{formatDuration(elapsed)}</strong>
        </div>
      </header>

      <section className="routine-bar" aria-label="Workout routines">
        <div className="routine-tabs">
          {routines.map((routine) => (
            <button
              type="button"
              key={routine.id}
              className={routine.id === activeRoutine.id ? "routine-tab active" : "routine-tab"}
              onClick={() => switchRoutine(routine.id)}
            >
              {routine.name || "Untitled"}
            </button>
          ))}
          <button type="button" className="routine-tab add-routine" onClick={createRoutine}>
            +
          </button>
        </div>
        <button
          type="button"
          className="manage-button"
          onClick={() => setShowRoutineEditor((current) => !current)}
        >
          {showRoutineEditor ? "Done" : "Edit routine"}
        </button>
      </section>

      {showRoutineEditor && (
        <section className="routine-editor">
          <div className="editor-heading">
            <div>
              <p className="eyebrow">ROUTINE BUILDER</p>
              <h2>Edit {activeRoutine.name || "routine"}</h2>
            </div>
            {routines.length > 1 && (
              <button type="button" className="danger-text" onClick={deleteActiveRoutine}>
                Delete
              </button>
            )}
          </div>

          <label className="field-label">
            Routine name
            <input
              className="name-input"
              value={activeRoutine.name}
              onChange={(event) => renameActiveRoutine(event.target.value)}
              placeholder="Workout name"
            />
          </label>

          <div className="routine-exercise-list">
            {activeRoutine.exerciseIds.length === 0 && (
              <div className="empty-state">Add exercises from the library below.</div>
            )}
            {activeRoutine.exerciseIds.map((exerciseId, index) => {
              const definition = getExerciseDefinition(exerciseId);
              if (!definition) return null;
              return (
                <div className="routine-exercise-row" key={exerciseId}>
                  <div>
                    <strong>{definition.name}</strong>
                    <span>{definition.muscle} · {definition.repMin}–{definition.repMax} reps</span>
                  </div>
                  <div className="row-actions">
                    <button type="button" onClick={() => moveExercise(exerciseId, -1)} disabled={index === 0}>↑</button>
                    <button
                      type="button"
                      onClick={() => moveExercise(exerciseId, 1)}
                      disabled={index === activeRoutine.exerciseIds.length - 1}
                    >↓</button>
                    <button type="button" onClick={() => removeExerciseFromRoutine(exerciseId)}>×</button>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="library-panel">
            <div className="section-title-row">
              <div>
                <p className="eyebrow">EXERCISE LIBRARY</p>
                <h2>Add an exercise</h2>
              </div>
              <span>{exerciseLibrary.length} exercises</span>
            </div>
            <input
              className="search-input"
              value={librarySearch}
              onChange={(event) => setLibrarySearch(event.target.value)}
              placeholder="Search exercise or muscle…"
            />
            <div className="library-list">
              {filteredLibrary.map((exercise) => {
                const alreadyAdded = activeRoutine.exerciseIds.includes(exercise.id);
                return (
                  <button
                    type="button"
                    className="library-item"
                    key={exercise.id}
                    disabled={alreadyAdded}
                    onClick={() => addExerciseToRoutine(exercise.id)}
                  >
                    <span>
                      <strong>{exercise.name}</strong>
                      <small>{exercise.muscle} · {exercise.repMin}–{exercise.repMax} reps</small>
                    </span>
                    <b>{alreadyAdded ? "Added" : "+ Add"}</b>
                  </button>
                );
              })}
            </div>
          </div>
        </section>
      )}

      <section className="summary-strip" aria-label="Workout summary">
        <div>
          <span>Sets</span>
          <strong>{stats.completedSets}/{totalSets}</strong>
        </div>
        <div>
          <span>Volume</span>
          <strong>{Math.round(stats.totalVolume).toLocaleString()} lb</strong>
        </div>
        <div>
          <span>Avg RIR</span>
          <strong>{stats.averageRir == null ? "—" : stats.averageRir.toFixed(1)}</strong>
        </div>
        <div className={restRemaining > 0 ? "rest-active" : ""}>
          <span>Rest</span>
          <strong>{restRemaining > 0 ? formatDuration(restRemaining) : "Ready"}</strong>
        </div>
      </section>

      {restRemaining > 0 && (
        <div className="rest-controls" aria-label="Rest timer controls">
          <button type="button" onClick={() => adjustRest(-30)}>-30s</button>
          <button type="button" onClick={() => setRestRemaining(0)}>Skip</button>
          <button type="button" onClick={() => adjustRest(30)}>+30s</button>
        </div>
      )}

      {finishedMessage && <div className="notice">{finishedMessage}</div>}

      {finishSummary && (
        <section className="completion-card">
          <div className="section-title-row">
            <div>
              <p className="eyebrow">SESSION REVIEW</p>
              <h2>Workout complete</h2>
            </div>
            <span>{finishSummary.prs.length} PRs</span>
          </div>
          <div className="review-grid">
            <div><span>Sets</span><strong>{finishSummary.completedSets}</strong></div>
            <div><span>Volume</span><strong>{Math.round(finishSummary.totalVolume).toLocaleString()} lb</strong></div>
            <div><span>Avg RIR</span><strong>{finishSummary.averageRir == null ? "Not logged" : finishSummary.averageRir.toFixed(1)}</strong></div>
          </div>
          {finishSummary.prs.length > 0 && (
            <div className="pr-list">
              {finishSummary.prs.map((pr) => <div className="pr-item" key={pr}>🏆 {pr}</div>)}
            </div>
          )}
          <div className="next-targets">
            <p className="eyebrow">NEXT SESSION</p>
            {finishSummary.nextTargets.map((target) => (
              <div className="next-target" key={target.name}>
                <strong>{target.name}</strong>
                <span>{target.text}</span>
              </div>
            ))}
          </div>
        </section>
      )}

      {selectedAnalyticsDefinition && (
        <section className="analytics-card">
          <div className="section-title-row">
            <div>
              <p className="eyebrow">EXERCISE ANALYTICS</p>
              <h2>{selectedAnalyticsDefinition.name}</h2>
            </div>
            <button type="button" className="text-button" onClick={() => setAnalyticsExerciseId(null)}>Close</button>
          </div>

          <div className="review-grid analytics-grid">
            <div><span>Sessions</span><strong>{selectedAnalyticsHistory.length}</strong></div>
            <div><span>Best e1RM</span><strong>{selectedAnalyticsBest > 0 ? `${Math.round(selectedAnalyticsBest)} lb` : "—"}</strong></div>
            <div>
              <span>Latest volume</span>
              <strong>{selectedAnalyticsHistory[0] ? `${Math.round(selectedAnalyticsHistory[0].volume).toLocaleString()} lb` : "—"}</strong>
            </div>
          </div>

          {selectedAnalyticsHistory.length === 0 ? (
            <div className="empty-state">No completed sessions for this exercise yet.</div>
          ) : (
            <div className="exercise-history-list">
              {selectedAnalyticsHistory.slice(0, 6).map((entry, index) => {
                const older = selectedAnalyticsHistory[index + 1];
                const delta = older ? entry.bestE1rm - older.bestE1rm : 0;
                return (
                  <div className="exercise-history-row" key={entry.workoutId}>
                    <div>
                      <strong>{formatDate(entry.completedAt)}</strong>
                      <span>{entry.sets.map((set) => `${set.weight}×${set.reps}`).join(" · ")}</span>
                    </div>
                    <div className="history-numbers">
                      <strong>{Math.round(entry.bestE1rm)} e1RM</strong>
                      <span>{older ? `${delta >= 0 ? "+" : ""}${Math.round(delta)} vs prior` : entry.workoutName}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      )}

      <section className="stack">
        {exercises.length === 0 && !showRoutineEditor && (
          <section className="empty-workout-card">
            <p className="eyebrow">EMPTY ROUTINE</p>
            <h2>Add your first exercise</h2>
            <p className="muted">Open Edit routine and choose exercises from the library.</p>
            <button type="button" className="finish-button" onClick={() => setShowRoutineEditor(true)}>Edit routine</button>
          </section>
        )}

        {exercises.map((exercise) => {
          const currentCompleted = completedPerformanceSets(exercise);
          const currentBest = bestEstimatedOneRepMax(currentCompleted);
          const priorBest = historicalBest(history, exercise.id, exercise.previous);
          const isLivePr = priorBest > 0 && currentBest > priorBest + 0.5;
          const completedSessions = exerciseHistory(history, exercise.id).length;

          return (
            <article className="card" key={exercise.id}>
              <div className="exercise-heading">
                <div>
                  <p className="exercise-kicker">{exercise.muscle.toUpperCase()} · TARGET {exercise.repMin}–{exercise.repMax} · 1–3 RIR</p>
                  <h2>{exercise.name}</h2>
                </div>
                <div className="badge-stack">
                  {isLivePr && <span className="pr-badge">🏆 PR</span>}
                  <span className={`progression-badge action-${exercise.progressionAction}`}>
                    {actionLabel(exercise.progressionAction)}
                  </span>
                </div>
              </div>

              <div className="metrics">
                <div>
                  <span>Previous</span>
                  <strong>{exercise.previous.length ? exercise.previous.map((set) => `${set.weight}×${set.reps}`).join(" · ") : "No previous sets"}</strong>
                </div>
                <div><span>Suggested</span><strong>{targetLabel(exercise)}</strong></div>
                <div><span>Best e1RM</span><strong>{currentBest > 0 ? `${Math.round(currentBest)} lb` : priorBest > 0 ? `${Math.round(priorBest)} lb prior` : "—"}</strong></div>
              </div>

              <div className="recommendation">
                <div>
                  <strong>{actionLabel(exercise.progressionAction)}</strong>
                  <span>{exercise.recommendation}</span>
                </div>
                <button type="button" onClick={() => setAnalyticsExerciseId(exercise.id)}>
                  History {completedSessions ? `(${completedSessions})` : ""}
                </button>
              </div>

              <div className="set-table set-header" aria-hidden="true">
                <span>SET</span><span>PREV</span><span>LB</span><span>REPS</span><span>RIR</span><span>✓</span>
              </div>

              <div className="set-list">
                {exercise.sets.map((set, index) => {
                  const previous = exercise.previous[index];
                  const e1rm = set.completed && set.weight != null && set.reps != null ? estimateOneRepMax(set.weight, set.reps) : 0;
                  const setPr = priorBest > 0 && e1rm > priorBest + 0.5;
                  return (
                    <div className={`set-table set-row ${set.completed ? "set-complete" : ""} ${setPr ? "set-pr" : ""}`} key={set.id}>
                      <strong className="set-number">{index + 1}</strong>
                      <span className="previous-cell">{previous ? `${previous.weight}×${previous.reps}` : "—"}</span>
                      <input aria-label={`${exercise.name} set ${index + 1} weight`} inputMode="decimal" type="number" min="0" step="2.5" value={set.weight ?? ""} onChange={(event) => updateSet(exercise.id, set.id, "weight", event.target.value)} />
                      <input aria-label={`${exercise.name} set ${index + 1} reps`} inputMode="numeric" type="number" min="0" step="1" value={set.reps ?? ""} onChange={(event) => updateSet(exercise.id, set.id, "reps", event.target.value)} />
                      <input aria-label={`${exercise.name} set ${index + 1} reps in reserve`} inputMode="decimal" type="number" min="0" max="10" step="0.5" placeholder="—" value={set.rir ?? ""} onChange={(event) => updateSet(exercise.id, set.id, "rir", event.target.value)} />
                      <button className={`check-button ${set.completed ? "checked" : ""}`} type="button" aria-label={`${set.completed ? "Uncomplete" : "Complete"} ${exercise.name} set ${index + 1}`} onClick={() => toggleSet(exercise.id, set.id)}>{set.completed ? "✓" : ""}</button>
                    </div>
                  );
                })}
              </div>

              <button className="ghost-button" type="button" onClick={() => addSet(exercise.id)}>+ Add set</button>
            </article>
          );
        })}
      </section>

      <section className="finish-card">
        <div>
          <p className="eyebrow">WORKOUT</p>
          <h2>Finish & analyze</h2>
          <p className="muted">Completed sets feed routine history, PR tracking, exercise analytics, and next-session targets.</p>
        </div>
        <button className="finish-button" type="button" onClick={finishWorkout}>Finish Workout</button>
        <button className="text-button" type="button" onClick={resetWorkout}>Reset current workout</button>
      </section>

      <section className="history-section">
        <div className="section-title-row">
          <div><p className="eyebrow">HISTORY</p><h2>Recent workouts</h2></div>
          <span>{history.length} saved</span>
        </div>
        {history.length === 0 ? (
          <div className="empty-state">Finish your first workout and it will show up here.</div>
        ) : (
          <div className="history-list">
            {history.slice(0, 8).map((workout) => (
              <article className="history-item" key={workout.id}>
                <div>
                  <strong>{workout.name}</strong>
                  <span>{formatDate(workout.completedAt)} · {formatDuration(workout.durationSeconds)}</span>
                </div>
                <div className="history-numbers">
                  <strong>{workout.completedSets} sets</strong>
                  <span>{Math.round(workout.totalVolume).toLocaleString()} lb</span>
                  <span>{workout.prs?.length ? `${workout.prs.length} PR${workout.prs.length === 1 ? "" : "s"}` : workout.averageRir != null ? `${workout.averageRir.toFixed(1)} avg RIR` : "Saved"}</span>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
