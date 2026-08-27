"use client";

import { useEffect, useMemo, useRef, useState } from "react";
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

const DRAFT_KEY = "workout-tracker:v0.2:draft";
const HISTORY_KEY = "workout-tracker:v0.2:history";
const REST_SECONDS = 90;

const exerciseSeed = [
  {
    id: "leg-extension",
    name: "Leg Extensions",
    repMin: 12,
    repMax: 15,
    increment: 5,
    fallbackWeight: 100,
    previous: [
      { weight: 100, reps: 15 },
      { weight: 100, reps: 15 },
      { weight: 100, reps: 15 },
    ],
    setCount: 3,
  },
  {
    id: "hack-squat",
    name: "Pendulum / Hack Squat",
    repMin: 12,
    repMax: 15,
    increment: 5,
    fallbackWeight: 90,
    previous: [
      { weight: 90, reps: 12 },
      { weight: 90, reps: 12 },
      { weight: 90, reps: 12 },
    ],
    setCount: 3,
  },
  {
    id: "smith-rdl",
    name: "Smith Romanian Deadlift",
    repMin: 12,
    repMax: 15,
    increment: 5,
    fallbackWeight: 180,
    previous: [
      { weight: 180, reps: 12 },
      { weight: 180, reps: 12 },
      { weight: 180, reps: 12 },
    ],
    setCount: 3,
  },
  {
    id: "bulgarian-split-squat",
    name: "Bulgarian Split Squat",
    repMin: 12,
    repMax: 15,
    increment: 5,
    fallbackWeight: 0,
    previous: [],
    setCount: 2,
  },
  {
    id: "hamstring-curl",
    name: "Hamstring Curl",
    repMin: 12,
    repMax: 15,
    increment: 5,
    fallbackWeight: 45,
    previous: [
      { weight: 35, reps: 15 },
      { weight: 40, reps: 15 },
      { weight: 45, reps: 15 },
    ],
    setCount: 3,
  },
  {
    id: "leg-press",
    name: "Leg Press",
    repMin: 15,
    repMax: 20,
    increment: 10,
    fallbackWeight: 0,
    previous: [],
    setCount: 2,
  },
  {
    id: "calf-raise",
    name: "Calf Raises",
    repMin: 15,
    repMax: 20,
    increment: 5,
    fallbackWeight: 80,
    previous: [
      { weight: 80, reps: 15 },
      { weight: 80, reps: 15 },
      { weight: 80, reps: 15 },
    ],
    setCount: 3,
  },
];

function normalizePerformanceSets(sets: PreviousSet[]): PerformanceSet[] {
  return sets
    .filter((set) => Number.isFinite(set.weight) && Number.isFinite(set.reps))
    .map((set) => ({
      weight: Number(set.weight),
      reps: Number(set.reps),
      rir: set.rir ?? null,
    }));
}

function makeWorkout(history: WorkoutHistoryItem[]): ExerciseState[] {
  const lastWorkout = history[0];

  return exerciseSeed.map((exercise) => {
    const lastExercise = lastWorkout?.exercises.find((item) => item.id === exercise.id);
    const previous = lastExercise?.sets.length
      ? lastExercise.sets.map((set) => ({
          weight: set.weight,
          reps: set.reps,
          rir: set.rir ?? null,
        }))
      : exercise.previous;

    const decision = progressionDecision(
      normalizePerformanceSets(previous),
      exercise.repMin,
      exercise.repMax,
      exercise.increment,
      exercise.fallbackWeight,
      exercise.setCount,
    );

    return {
      id: exercise.id,
      name: exercise.name,
      repMin: exercise.repMin,
      repMax: exercise.repMax,
      increment: exercise.increment,
      fallbackWeight: exercise.fallbackWeight,
      previous,
      suggestedWeights: decision.suggestedWeights,
      recommendation: decision.reason,
      progressionAction: decision.action,
      sets: Array.from({ length: exercise.setCount }, (_, index) => ({
        id: `${exercise.id}-${index + 1}`,
        weight: decision.suggestedWeights[index] || null,
        reps: null,
        rir: null,
        completed: false,
      })),
    };
  });
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
    const exercise = workout.exercises.find((item) => item.id === exerciseId);
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
  const loadText =
    unique.length === 1
      ? `${unique[0]} lb`
      : `${weights.join(" / ")} lb`;

  return `${loadText} · ${exercise.repMin}–${exercise.repMax} reps`;
}

function actionLabel(action: ProgressionAction) {
  if (action === "increase") return "↑ Add load";
  if (action === "hold") return "Hold";
  return "Beat reps";
}

export default function Home() {
  const [history, setHistory] = useState<WorkoutHistoryItem[]>([]);
  const [exercises, setExercises] = useState<ExerciseState[]>(() => makeWorkout([]));
  const [hydrated, setHydrated] = useState(false);
  const [startedAt, setStartedAt] = useState(() => new Date().toISOString());
  const [elapsed, setElapsed] = useState(0);
  const [restRemaining, setRestRemaining] = useState(0);
  const [finishedMessage, setFinishedMessage] = useState<string | null>(null);
  const [finishSummary, setFinishSummary] = useState<FinishSummary | null>(null);
  const firstSave = useRef(true);

  useEffect(() => {
    let parsedHistory: WorkoutHistoryItem[] = [];

    try {
      const savedHistory = localStorage.getItem(HISTORY_KEY);
      parsedHistory = savedHistory ? JSON.parse(savedHistory) : [];
    } catch {
      parsedHistory = [];
    }

    setHistory(parsedHistory);

    const draft = localStorage.getItem(DRAFT_KEY);
    if (draft) {
      try {
        const parsed = JSON.parse(draft) as {
          exercises: ExerciseState[];
          startedAt: string;
        };

        const migratedExercises = parsed.exercises.map((exercise) => ({
          ...exercise,
          fallbackWeight:
            exercise.fallbackWeight ??
            exercise.suggestedWeights?.[0] ??
            exercise.sets?.[0]?.weight ??
            0,
          suggestedWeights:
            exercise.suggestedWeights ??
            exercise.sets.map((set) => set.weight ?? 0),
          recommendation:
            exercise.recommendation ?? "Continue from your saved v0.2 workout.",
          progressionAction: exercise.progressionAction ?? "build",
          sets: exercise.sets.map((set) => ({
            ...set,
            rir: set.rir ?? null,
          })),
        }));

        setExercises(migratedExercises);
        setStartedAt(parsed.startedAt);
      } catch {
        setExercises(makeWorkout(parsedHistory));
      }
    } else {
      setExercises(makeWorkout(parsedHistory));
    }

    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    const tick = () => {
      setElapsed(
        Math.max(
          0,
          Math.floor((Date.now() - new Date(startedAt).getTime()) / 1000),
        ),
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

  useEffect(() => {
    if (!hydrated) return;
    if (firstSave.current) {
      firstSave.current = false;
      return;
    }
    localStorage.setItem(DRAFT_KEY, JSON.stringify({ exercises, startedAt }));
  }, [exercises, hydrated, startedAt]);

  const stats = useMemo(() => {
    let completedSets = 0;
    let totalVolume = 0;
    const effort: PerformanceSet[] = [];

    for (const exercise of exercises) {
      for (const set of exercise.sets) {
        if (!set.completed || set.weight == null || set.reps == null) continue;
        completedSets += 1;
        totalVolume += set.weight * set.reps;
        effort.push({
          weight: set.weight,
          reps: set.reps,
          rir: set.rir,
        });
      }
    }

    return {
      completedSets,
      totalVolume,
      averageRir: averageRir(effort),
    };
  }, [exercises]);

  const totalSets = useMemo(
    () => exercises.reduce((sum, exercise) => sum + exercise.sets.length, 0),
    [exercises],
  );

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

  function resetWorkout() {
    const nextStartedAt = new Date().toISOString();
    setExercises(makeWorkout(history));
    setStartedAt(nextStartedAt);
    setRestRemaining(0);
    setFinishedMessage(null);
    setFinishSummary(null);
    localStorage.removeItem(DRAFT_KEY);
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
        prs.push(
          `${exercise.name}: ${Math.round(currentBest)} lb estimated 1RM`,
        );
      }
    }

    const completedAt = new Date().toISOString();
    const item: WorkoutHistoryItem = {
      id: `workout-${Date.now()}`,
      name: "Leg Day",
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
              estimated1RM: estimateOneRepMax(
                set.weight as number,
                set.reps as number,
              ),
            })),
        }))
        .filter((exercise) => exercise.sets.length > 0),
    };

    const nextHistory = [item, ...history].slice(0, 50);
    const nextWorkout = makeWorkout(nextHistory);

    localStorage.setItem(HISTORY_KEY, JSON.stringify(nextHistory));
    localStorage.removeItem(DRAFT_KEY);

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
      `Saved: ${item.completedSets} working sets · ${Math.round(
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
        <p className="muted">Loading your workout…</p>
      </main>
    );
  }

  return (
    <main className="shell">
      <header className="hero">
        <div>
          <p className="eyebrow">V0.3 · PROGRESSION</p>
          <h1>Leg Day</h1>
          <p className="muted">
            Log fast, track effort, detect PRs, and get a clear target for next time.
          </p>
        </div>
        <div className="session-clock" aria-label="Workout duration">
          <span>Session</span>
          <strong>{formatDuration(elapsed)}</strong>
        </div>
      </header>

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
          <strong>
            {stats.averageRir == null ? "—" : stats.averageRir.toFixed(1)}
          </strong>
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
            <div>
              <span>Sets</span>
              <strong>{finishSummary.completedSets}</strong>
            </div>
            <div>
              <span>Volume</span>
              <strong>{Math.round(finishSummary.totalVolume).toLocaleString()} lb</strong>
            </div>
            <div>
              <span>Avg RIR</span>
              <strong>
                {finishSummary.averageRir == null
                  ? "Not logged"
                  : finishSummary.averageRir.toFixed(1)}
              </strong>
            </div>
          </div>

          {finishSummary.prs.length > 0 && (
            <div className="pr-list">
              {finishSummary.prs.map((pr) => (
                <div className="pr-item" key={pr}>🏆 {pr}</div>
              ))}
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

      <section className="stack">
        {exercises.map((exercise) => {
          const currentCompleted = completedPerformanceSets(exercise);
          const currentBest = bestEstimatedOneRepMax(currentCompleted);
          const priorBest = historicalBest(history, exercise.id, exercise.previous);
          const isLivePr = priorBest > 0 && currentBest > priorBest + 0.5;

          return (
            <article className="card" key={exercise.id}>
              <div className="exercise-heading">
                <div>
                  <p className="exercise-kicker">
                    TARGET {exercise.repMin}–{exercise.repMax} · 1–3 RIR
                  </p>
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
                  <strong>
                    {exercise.previous.length
                      ? exercise.previous
                          .map((set) => `${set.weight}×${set.reps}`)
                          .join(" · ")
                      : "No previous sets"}
                  </strong>
                </div>
                <div>
                  <span>Suggested</span>
                  <strong>{targetLabel(exercise)}</strong>
                </div>
                <div>
                  <span>Best e1RM</span>
                  <strong>
                    {currentBest > 0
                      ? `${Math.round(currentBest)} lb`
                      : priorBest > 0
                        ? `${Math.round(priorBest)} lb prior`
                        : "—"}
                  </strong>
                </div>
              </div>

              <div className="recommendation">
                <strong>{actionLabel(exercise.progressionAction)}</strong>
                <span>{exercise.recommendation}</span>
              </div>

              <div className="set-table set-header" aria-hidden="true">
                <span>SET</span>
                <span>PREV</span>
                <span>LB</span>
                <span>REPS</span>
                <span>RIR</span>
                <span>✓</span>
              </div>

              <div className="set-list">
                {exercise.sets.map((set, index) => {
                  const previous = exercise.previous[index];
                  const e1rm =
                    set.completed && set.weight != null && set.reps != null
                      ? estimateOneRepMax(set.weight, set.reps)
                      : 0;
                  const setPr = priorBest > 0 && e1rm > priorBest + 0.5;

                  return (
                    <div
                      className={`set-table set-row ${set.completed ? "set-complete" : ""} ${setPr ? "set-pr" : ""}`}
                      key={set.id}
                    >
                      <strong className="set-number">{index + 1}</strong>
                      <span className="previous-cell">
                        {previous ? `${previous.weight}×${previous.reps}` : "—"}
                      </span>
                      <input
                        aria-label={`${exercise.name} set ${index + 1} weight`}
                        inputMode="decimal"
                        type="number"
                        min="0"
                        step="2.5"
                        value={set.weight ?? ""}
                        onChange={(event) =>
                          updateSet(exercise.id, set.id, "weight", event.target.value)
                        }
                      />
                      <input
                        aria-label={`${exercise.name} set ${index + 1} reps`}
                        inputMode="numeric"
                        type="number"
                        min="0"
                        step="1"
                        value={set.reps ?? ""}
                        onChange={(event) =>
                          updateSet(exercise.id, set.id, "reps", event.target.value)
                        }
                      />
                      <input
                        aria-label={`${exercise.name} set ${index + 1} reps in reserve`}
                        inputMode="decimal"
                        type="number"
                        min="0"
                        max="10"
                        step="0.5"
                        placeholder="—"
                        value={set.rir ?? ""}
                        onChange={(event) =>
                          updateSet(exercise.id, set.id, "rir", event.target.value)
                        }
                      />
                      <button
                        className={`check-button ${set.completed ? "checked" : ""}`}
                        type="button"
                        aria-label={`${set.completed ? "Uncomplete" : "Complete"} ${exercise.name} set ${index + 1}`}
                        onClick={() => toggleSet(exercise.id, set.id)}
                      >
                        {set.completed ? "✓" : ""}
                      </button>
                    </div>
                  );
                })}
              </div>

              <button
                className="ghost-button"
                type="button"
                onClick={() => addSet(exercise.id)}
              >
                + Add set
              </button>
            </article>
          );
        })}
      </section>

      <section className="finish-card">
        <div>
          <p className="eyebrow">WORKOUT</p>
          <h2>Finish & analyze</h2>
          <p className="muted">
            Completed sets stay on this device, feed your PR history, and generate the next session&apos;s targets.
          </p>
        </div>
        <button className="finish-button" type="button" onClick={finishWorkout}>
          Finish Workout
        </button>
        <button className="text-button" type="button" onClick={resetWorkout}>
          Reset current workout
        </button>
      </section>

      <section className="history-section">
        <div className="section-title-row">
          <div>
            <p className="eyebrow">HISTORY</p>
            <h2>Recent workouts</h2>
          </div>
          <span>{history.length} saved</span>
        </div>

        {history.length === 0 ? (
          <div className="empty-state">
            Finish your first workout and it will show up here.
          </div>
        ) : (
          <div className="history-list">
            {history.slice(0, 5).map((workout) => (
              <article className="history-item" key={workout.id}>
                <div>
                  <strong>{workout.name}</strong>
                  <span>{formatDate(workout.completedAt)}</span>
                  <span>{formatDuration(workout.durationSeconds)}</span>
                </div>
                <div className="history-numbers">
                  <strong>{workout.completedSets} sets</strong>
                  <span>{Math.round(workout.totalVolume).toLocaleString()} lb</span>
                  <span>
                    {workout.prs?.length
                      ? `${workout.prs.length} PR${workout.prs.length === 1 ? "" : "s"}`
                      : workout.averageRir != null
                        ? `${workout.averageRir.toFixed(1)} avg RIR`
                        : "Saved"}
                  </span>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
