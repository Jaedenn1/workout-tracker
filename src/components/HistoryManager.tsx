"use client";

import { useEffect, useMemo, useState } from "react";
import { createSafetySnapshot, db, removeWorkout } from "../lib/database";

const HISTORY_KEY = "workout-tracker:v0.2:history";

type HistorySet = {
  weight?: number;
  reps?: number;
  rir?: number | null;
  estimated1RM?: number;
};

type HistoryExercise = {
  id?: string;
  name?: string;
  note?: string;
  sets?: HistorySet[];
};

type WorkoutPayload = Record<string, unknown> & {
  id: string;
  name?: string;
  completedAt?: string;
  durationSeconds?: number;
  totalVolume?: number;
  completedSets?: number;
  averageRir?: number | null;
  prs?: string[];
  exercises?: HistoryExercise[];
};

function cloneWorkout(payload: Record<string, unknown>) {
  return JSON.parse(JSON.stringify(payload)) as WorkoutPayload;
}

function formatDate(value?: string) {
  if (!value) return "Unknown date";
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function formatDuration(seconds?: number) {
  const total = Math.max(0, Number(seconds ?? 0));
  const minutes = Math.round(total / 60);
  if (minutes < 60) return `${minutes}m`;
  return `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
}

function e1rm(weight: number, reps: number) {
  if (!Number.isFinite(weight) || !Number.isFinite(reps) || weight <= 0 || reps <= 0) return 0;
  return weight * (1 + reps / 30);
}

function recompute(workout: WorkoutPayload): WorkoutPayload {
  let totalVolume = 0;
  let completedSets = 0;
  const rirValues: number[] = [];

  const exercises = (workout.exercises ?? []).map((exercise) => ({
    ...exercise,
    sets: (exercise.sets ?? []).map((set) => {
      const weight = Number(set.weight ?? 0);
      const reps = Number(set.reps ?? 0);
      const rir = set.rir == null ? null : Number(set.rir);
      if (weight >= 0 && reps > 0) {
        totalVolume += weight * reps;
        completedSets += 1;
      }
      if (rir != null && Number.isFinite(rir)) rirValues.push(rir);
      return {
        ...set,
        weight,
        reps,
        rir: rir != null && Number.isFinite(rir) ? rir : null,
        estimated1RM: e1rm(weight, reps),
      };
    }),
  }));

  return {
    ...workout,
    exercises,
    totalVolume,
    completedSets,
    averageRir: rirValues.length ? rirValues.reduce((sum, value) => sum + value, 0) / rirValues.length : null,
    prs: [],
  };
}

export default function HistoryManager() {
  const [workouts, setWorkouts] = useState<WorkoutPayload[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [draft, setDraft] = useState<WorkoutPayload | null>(null);
  const [status, setStatus] = useState("Corrections create a safety snapshot first.");
  const [busy, setBusy] = useState(false);

  async function refresh(preferredId?: string) {
    const rows = await db.workouts.orderBy("completedAt").reverse().toArray();
    const next = rows.map((row) => cloneWorkout(row.payload));
    setWorkouts(next);
    const target = preferredId && next.some((item) => item.id === preferredId)
      ? preferredId
      : next[0]?.id ?? "";
    setSelectedId(target);
    setDraft(next.find((item) => item.id === target) ? cloneWorkout(next.find((item) => item.id === target) as WorkoutPayload) : null);
  }

  useEffect(() => {
    void refresh();
  }, []);

  const selected = useMemo(
    () => workouts.find((workout) => workout.id === selectedId) ?? null,
    [workouts, selectedId],
  );

  useEffect(() => {
    setDraft(selected ? cloneWorkout(selected) : null);
  }, [selected]);

  function updateSet(exerciseIndex: number, setIndex: number, field: "weight" | "reps" | "rir", value: string) {
    setDraft((current) => {
      if (!current) return current;
      const next = cloneWorkout(current);
      const set = next.exercises?.[exerciseIndex]?.sets?.[setIndex];
      if (!set) return current;
      if (field === "rir" && value === "") set.rir = null;
      else set[field] = Number(value);
      return next;
    });
  }

  async function saveCorrections() {
    if (!draft) return;
    setBusy(true);
    try {
      await createSafetySnapshot(`Before editing ${draft.name ?? "workout"}`);
      const rows = await db.workouts.orderBy("completedAt").reverse().toArray();
      const corrected = recompute(draft);
      const history = rows.map((row) => row.id === corrected.id ? corrected : row.payload);
      localStorage.setItem(HISTORY_KEY, JSON.stringify(history));
      setStatus("Corrections saved. Volume/e1RM were recalculated; old PR labels were cleared for this edited workout.");
      await new Promise((resolve) => window.setTimeout(resolve, 40));
      await refresh(corrected.id);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Could not save those corrections.");
    } finally {
      setBusy(false);
    }
  }

  async function deleteWorkout() {
    if (!draft || !window.confirm(`Delete ${draft.name ?? "this workout"}? A safety snapshot will be created first.`)) return;
    setBusy(true);
    try {
      await createSafetySnapshot(`Before deleting ${draft.name ?? "workout"}`);
      await removeWorkout(draft.id);
      setStatus("Workout deleted. You can roll back from Data Center if needed.");
      await refresh();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Could not delete that workout.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="v10-shell">
      <header className="v10-hero">
        <div>
          <p className="v10-eyebrow">V1.0 · HISTORY</p>
          <h1>Workout History</h1>
          <p>Inspect every logged set and fix accidental entries without editing raw JSON.</p>
        </div>
        <div className="v10-header-links">
          <a className="v10-back" href="/data">Data Center</a>
          <a className="v10-back" href="/gym">← Gym Mode</a>
        </div>
      </header>

      <div className="v10-status" role="status">{status}</div>

      <section className="v10-history-layout">
        <aside className="v10-history-list">
          {workouts.length ? workouts.map((workout) => (
            <button
              type="button"
              key={workout.id}
              className={workout.id === selectedId ? "active" : ""}
              onClick={() => setSelectedId(workout.id)}
            >
              <strong>{workout.name ?? "Workout"}</strong>
              <span>{formatDate(workout.completedAt)}</span>
              <small>{Number(workout.completedSets ?? 0)} sets · {Math.round(Number(workout.totalVolume ?? 0)).toLocaleString()} lb</small>
            </button>
          )) : <p className="v10-muted">No completed workouts yet.</p>}
        </aside>

        <section className="v10-card v10-history-detail">
          {draft ? (
            <>
              <div className="v10-section-heading">
                <div>
                  <p className="v10-eyebrow">WORKOUT DETAIL</p>
                  <input
                    className="v10-title-input"
                    value={draft.name ?? "Workout"}
                    onChange={(event) => setDraft((current) => current ? { ...current, name: event.target.value } : current)}
                  />
                  <span>{formatDate(draft.completedAt)} · {formatDuration(draft.durationSeconds)}</span>
                </div>
                <div className="v10-detail-actions">
                  <button type="button" disabled={busy} onClick={saveCorrections}>Save corrections</button>
                  <button type="button" className="danger" disabled={busy} onClick={deleteWorkout}>Delete</button>
                </div>
              </div>

              <div className="v10-summary-row">
                <div><span>Sets</span><strong>{Number(draft.completedSets ?? 0)}</strong></div>
                <div><span>Volume</span><strong>{Math.round(Number(draft.totalVolume ?? 0)).toLocaleString()} lb</strong></div>
                <div><span>Avg RIR</span><strong>{typeof draft.averageRir === "number" ? draft.averageRir.toFixed(1) : "—"}</strong></div>
                <div><span>PR labels</span><strong>{draft.prs?.length ?? 0}</strong></div>
              </div>

              <div className="v10-exercise-history">
                {(draft.exercises ?? []).map((exercise, exerciseIndex) => (
                  <article key={`${exercise.id ?? exercise.name}-${exerciseIndex}`}>
                    <div>
                      <strong>{exercise.name ?? exercise.id ?? `Exercise ${exerciseIndex + 1}`}</strong>
                      {exercise.note && <span>{exercise.note}</span>}
                    </div>
                    <div className="v10-set-table">
                      <span>Set</span><span>lb</span><span>Reps</span><span>RIR</span><span>e1RM</span>
                      {(exercise.sets ?? []).map((set, setIndex) => (
                        <div className="v10-set-row" key={`${exercise.id}-${setIndex}`}>
                          <strong>{setIndex + 1}</strong>
                          <input type="number" inputMode="decimal" value={set.weight ?? 0} onChange={(event) => updateSet(exerciseIndex, setIndex, "weight", event.target.value)} />
                          <input type="number" inputMode="numeric" value={set.reps ?? 0} onChange={(event) => updateSet(exerciseIndex, setIndex, "reps", event.target.value)} />
                          <input type="number" inputMode="decimal" min="0" max="10" step="0.5" value={set.rir ?? ""} onChange={(event) => updateSet(exerciseIndex, setIndex, "rir", event.target.value)} />
                          <span>{Math.round(e1rm(Number(set.weight ?? 0), Number(set.reps ?? 0)))}</span>
                        </div>
                      ))}
                    </div>
                  </article>
                ))}
              </div>
            </>
          ) : (
            <p className="v10-muted">Choose a workout to inspect it.</p>
          )}
        </section>
      </section>
    </main>
  );
}
