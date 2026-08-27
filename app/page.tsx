"use client";

import { useEffect, useMemo, useRef, useState } from "react";

type LoggedSet = {
  id: string;
  weight: number | null;
  reps: number | null;
  completed: boolean;
};

type ExerciseState = {
  id: string;
  name: string;
  repMin: number;
  repMax: number;
  increment: number;
  defaultWeight: number;
  previous: Array<{ weight: number; reps: number }>;
  sets: LoggedSet[];
};

type WorkoutHistoryItem = {
  id: string;
  name: string;
  completedAt: string;
  durationSeconds: number;
  totalVolume: number;
  completedSets: number;
  exercises: Array<{
    id: string;
    name: string;
    repMin: number;
    repMax: number;
    increment: number;
    sets: Array<{ weight: number; reps: number }>;
  }>;
};

const DRAFT_KEY = "workout-tracker:v0.2:draft";
const HISTORY_KEY = "workout-tracker:v0.2:history";

const exerciseSeed = [
  {
    id: "leg-extension",
    name: "Leg Extensions",
    repMin: 12,
    repMax: 15,
    increment: 5,
    defaultWeight: 100,
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
    defaultWeight: 90,
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
    defaultWeight: 180,
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
    defaultWeight: 0,
    previous: [],
    setCount: 2,
  },
  {
    id: "hamstring-curl",
    name: "Hamstring Curl",
    repMin: 12,
    repMax: 15,
    increment: 5,
    defaultWeight: 45,
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
    defaultWeight: 0,
    previous: [],
    setCount: 2,
  },
  {
    id: "calf-raise",
    name: "Calf Raises",
    repMin: 15,
    repMax: 20,
    increment: 5,
    defaultWeight: 80,
    previous: [
      { weight: 80, reps: 15 },
      { weight: 80, reps: 15 },
      { weight: 80, reps: 15 },
    ],
    setCount: 3,
  },
];

function makeWorkout(history: WorkoutHistoryItem[]): ExerciseState[] {
  const lastWorkout = history[0];

  return exerciseSeed.map((exercise) => {
    const lastExercise = lastWorkout?.exercises.find((item) => item.id === exercise.id);
    const previous = lastExercise?.sets.length ? lastExercise.sets : exercise.previous;
    const previousLoad = previous[0]?.weight ?? exercise.defaultWeight;
    const allHitTop =
      previous.length > 0 && previous.every((set) => set.reps >= exercise.repMax);
    const suggestedLoad = allHitTop ? previousLoad + exercise.increment : previousLoad;

    return {
      id: exercise.id,
      name: exercise.name,
      repMin: exercise.repMin,
      repMax: exercise.repMax,
      increment: exercise.increment,
      defaultWeight: suggestedLoad,
      previous,
      sets: Array.from({ length: exercise.setCount }, (_, index) => ({
        id: `${exercise.id}-${index + 1}`,
        weight: suggestedLoad || null,
        reps: null,
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

export default function Home() {
  const [history, setHistory] = useState<WorkoutHistoryItem[]>([]);
  const [exercises, setExercises] = useState<ExerciseState[]>(() => makeWorkout([]));
  const [hydrated, setHydrated] = useState(false);
  const [startedAt, setStartedAt] = useState(() => new Date().toISOString());
  const [elapsed, setElapsed] = useState(0);
  const [restRemaining, setRestRemaining] = useState(0);
  const [finishedMessage, setFinishedMessage] = useState<string | null>(null);
  const firstSave = useRef(true);

  useEffect(() => {
    const savedHistory = localStorage.getItem(HISTORY_KEY);
    const parsedHistory: WorkoutHistoryItem[] = savedHistory ? JSON.parse(savedHistory) : [];
    setHistory(parsedHistory);

    const draft = localStorage.getItem(DRAFT_KEY);
    if (draft) {
      try {
        const parsed = JSON.parse(draft) as {
          exercises: ExerciseState[];
          startedAt: string;
        };
        setExercises(parsed.exercises);
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
      setElapsed(Math.max(0, Math.floor((Date.now() - new Date(startedAt).getTime()) / 1000)));
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
    for (const exercise of exercises) {
      for (const set of exercise.sets) {
        if (!set.completed || set.weight == null || set.reps == null) continue;
        completedSets += 1;
        totalVolume += set.weight * set.reps;
      }
    }
    return { completedSets, totalVolume };
  }, [exercises]);

  const totalSets = useMemo(
    () => exercises.reduce((sum, exercise) => sum + exercise.sets.length, 0),
    [exercises],
  );

  function updateSet(
    exerciseId: string,
    setId: string,
    field: "weight" | "reps",
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
    if (becameComplete) setRestRemaining(90);
  }

  function addSet(exerciseId: string) {
    setExercises((current) =>
      current.map((exercise) => {
        if (exercise.id !== exerciseId) return exercise;
        const number = exercise.sets.length + 1;
        return {
          ...exercise,
          sets: [
            ...exercise.sets,
            {
              id: `${exercise.id}-${Date.now()}`,
              weight: exercise.sets.at(-1)?.weight ?? exercise.defaultWeight ?? null,
              reps: null,
              completed: false,
            },
          ],
        };
      }),
    );
  }

  function resetWorkout() {
    const nextStartedAt = new Date().toISOString();
    setExercises(makeWorkout(history));
    setStartedAt(nextStartedAt);
    setRestRemaining(0);
    setFinishedMessage(null);
    localStorage.removeItem(DRAFT_KEY);
  }

  function finishWorkout() {
    if (stats.completedSets === 0) {
      setFinishedMessage("Complete at least one set before finishing the workout.");
      return;
    }

    const completedAt = new Date().toISOString();
    const item: WorkoutHistoryItem = {
      id: `workout-${Date.now()}`,
      name: "Leg Day",
      completedAt,
      durationSeconds: elapsed,
      totalVolume: stats.totalVolume,
      completedSets: stats.completedSets,
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
                set.completed && set.weight != null && set.reps != null,
            )
            .map((set) => ({ weight: set.weight as number, reps: set.reps as number })),
        }))
        .filter((exercise) => exercise.sets.length > 0),
    };

    const nextHistory = [item, ...history].slice(0, 30);
    localStorage.setItem(HISTORY_KEY, JSON.stringify(nextHistory));
    localStorage.removeItem(DRAFT_KEY);
    setHistory(nextHistory);
    setFinishedMessage(
      `Saved: ${item.completedSets} working sets · ${Math.round(item.totalVolume).toLocaleString()} lb volume.`,
    );
    setExercises(makeWorkout(nextHistory));
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
          <p className="eyebrow">V0.2 · LOCAL WORKOUT</p>
          <h1>Leg Day</h1>
          <p className="muted">Previous performance, live logging, and automatic local saving.</p>
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
        <div className={restRemaining > 0 ? "rest-active" : ""}>
          <span>Rest</span>
          <strong>{restRemaining > 0 ? formatDuration(restRemaining) : "Ready"}</strong>
        </div>
      </section>

      {finishedMessage && <div className="notice">{finishedMessage}</div>}

      <section className="stack">
        {exercises.map((exercise) => {
          const allPreviousTop =
            exercise.previous.length > 0 &&
            exercise.previous.every((set) => set.reps >= exercise.repMax);
          const targetText = exercise.defaultWeight
            ? `${exercise.defaultWeight} lb · ${exercise.repMin}–${exercise.repMax} reps`
            : `${exercise.repMin}–${exercise.repMax} reps`;

          return (
            <article className="card" key={exercise.id}>
              <div className="exercise-heading">
                <div>
                  <p className="exercise-kicker">TARGET {exercise.repMin}–{exercise.repMax}</p>
                  <h2>{exercise.name}</h2>
                </div>
                {allPreviousTop && <span className="progression-badge">↑ Progress</span>}
              </div>

              <div className="metrics">
                <div>
                  <span>Previous</span>
                  <strong>
                    {exercise.previous.length
                      ? exercise.previous.map((set) => `${set.weight}×${set.reps}`).join(" · ")
                      : "No previous sets"}
                  </strong>
                </div>
                <div>
                  <span>Suggested</span>
                  <strong>{targetText}</strong>
                </div>
              </div>

              <div className="set-table set-header" aria-hidden="true">
                <span>SET</span>
                <span>PREVIOUS</span>
                <span>LB</span>
                <span>REPS</span>
                <span>✓</span>
              </div>

              <div className="set-list">
                {exercise.sets.map((set, index) => {
                  const previous = exercise.previous[index];
                  return (
                    <div
                      className={`set-table set-row ${set.completed ? "set-complete" : ""}`}
                      key={set.id}
                    >
                      <strong className="set-number">{index + 1}</strong>
                      <span className="previous-cell">
                        {previous ? `${previous.weight} × ${previous.reps}` : "—"}
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

              <button className="ghost-button" type="button" onClick={() => addSet(exercise.id)}>
                + Add set
              </button>
            </article>
          );
        })}
      </section>

      <section className="finish-card">
        <div>
          <p className="eyebrow">WORKOUT</p>
          <h2>Finish & save</h2>
          <p className="muted">Your completed sets are stored in this browser and become next session&apos;s previous performance.</p>
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
          <div className="empty-state">Finish your first workout and it will show up here.</div>
        ) : (
          <div className="history-list">
            {history.slice(0, 5).map((workout) => (
              <article className="history-item" key={workout.id}>
                <div>
                  <strong>{workout.name}</strong>
                  <span>{formatDate(workout.completedAt)}</span>
                </div>
                <div className="history-numbers">
                  <strong>{workout.completedSets} sets</strong>
                  <span>{Math.round(workout.totalVolume).toLocaleString()} lb</span>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
