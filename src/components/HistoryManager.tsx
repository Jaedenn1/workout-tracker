"use client";

import { useEffect, useMemo, useState } from "react";
import { createSafetySnapshot, db, persistLegacyKey, removeWorkout } from "../lib/database";
import { Button, Card, Chip, EmptyState, Field, PageHeader, SegmentedControl, SelectInput, Stat, StatGrid, TextInput } from "../ui";

const HISTORY_KEY = "workout-tracker:v0.2:history";
type HistorySet = { weight?: number; reps?: number; rir?: number | null; estimated1RM?: number };
type HistoryExercise = { id?: string; name?: string; note?: string; sets?: HistorySet[] };
type WorkoutPayload = Record<string, unknown> & { id: string; routineId?: string; name?: string; completedAt?: string; durationSeconds?: number; totalVolume?: number; completedSets?: number; averageRir?: number | null; prs?: string[]; exercises?: HistoryExercise[] };

function cloneWorkout(payload: Record<string, unknown>) { return JSON.parse(JSON.stringify(payload)) as WorkoutPayload; }
function formatDate(value?: string) { return value ? new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(new Date(value)) : "Unknown date"; }
function formatDuration(seconds?: number) { const minutes = Math.round(Math.max(0, Number(seconds ?? 0)) / 60); return minutes < 60 ? `${minutes}m` : `${Math.floor(minutes / 60)}h ${minutes % 60}m`; }
function e1rm(weight: number, reps: number) { return weight > 0 && reps > 0 ? weight * (1 + reps / 30) : 0; }
function recompute(workout: WorkoutPayload): WorkoutPayload {
  let totalVolume = 0; let completedSets = 0; const rirValues: number[] = [];
  const exercises = (workout.exercises ?? []).map((exercise) => ({ ...exercise, sets: (exercise.sets ?? []).map((set) => {
    const weight = Number(set.weight ?? 0); const reps = Number(set.reps ?? 0); const rir = set.rir == null ? null : Number(set.rir);
    if (weight >= 0 && reps > 0) { totalVolume += weight * reps; completedSets += 1; }
    if (rir != null && Number.isFinite(rir)) rirValues.push(rir);
    return { ...set, weight, reps, rir: rir != null && Number.isFinite(rir) ? rir : null, estimated1RM: e1rm(weight, reps) };
  }) }));
  return { ...workout, exercises, totalVolume, completedSets, averageRir: rirValues.length ? rirValues.reduce((sum, value) => sum + value, 0) / rirValues.length : null, prs: [] };
}

const SET_GRID_COLUMNS = "2.2rem 1fr 1fr 1fr 3rem";

export default function HistoryManager() {
  const [workouts, setWorkouts] = useState<WorkoutPayload[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [draft, setDraft] = useState<WorkoutPayload | null>(null);
  const [status, setStatus] = useState("Edits create a safety snapshot before changing history.");
  const [busy, setBusy] = useState(false);
  const [query, setQuery] = useState(""); const [routineFilter, setRoutineFilter] = useState("all"); const [exerciseFilter, setExerciseFilter] = useState("all"); const [range, setRange] = useState("all"); const [prOnly, setPrOnly] = useState(false); const [armedDelete, setArmedDelete] = useState(false);

  async function refresh(preferredId?: string) { const rows = await db.workouts.orderBy("completedAt").reverse().toArray(); const next = rows.map((row) => cloneWorkout(row.payload)); setWorkouts(next); const target = preferredId && next.some((item) => item.id === preferredId) ? preferredId : next[0]?.id ?? ""; setSelectedId(target); setDraft(next.find((item) => item.id === target) ? cloneWorkout(next.find((item) => item.id === target) as WorkoutPayload) : null); }
  useEffect(() => { void refresh(); }, []);
  const routineOptions = useMemo(() => [...new Set(workouts.map((item) => item.name ?? "Workout"))].sort(), [workouts]);
  const exerciseOptions = useMemo(() => [...new Set(workouts.flatMap((item) => (item.exercises ?? []).map((exercise) => exercise.name ?? exercise.id ?? "Exercise")))].sort(), [workouts]);
  const filtered = useMemo(() => workouts.filter((workout) => {
    const search = query.trim().toLowerCase();
    if (search && !`${workout.name ?? ""} ${(workout.exercises ?? []).map((exercise) => exercise.name ?? exercise.id ?? "").join(" ")}`.toLowerCase().includes(search)) return false;
    if (routineFilter !== "all" && (workout.name ?? "Workout") !== routineFilter) return false;
    if (exerciseFilter !== "all" && !(workout.exercises ?? []).some((exercise) => (exercise.name ?? exercise.id ?? "Exercise") === exerciseFilter)) return false;
    if (prOnly && !(workout.prs?.length)) return false;
    if (range !== "all") { const days = Number(range); const stamp = new Date(workout.completedAt ?? 0).getTime(); if (!stamp || Date.now() - stamp > days * 86400000) return false; }
    return true;
  }), [workouts, query, routineFilter, exerciseFilter, range, prOnly]);
  const selected = useMemo(() => workouts.find((workout) => workout.id === selectedId) ?? null, [workouts, selectedId]);
  useEffect(() => { if (filtered.length && !filtered.some((item) => item.id === selectedId)) setSelectedId(filtered[0].id); }, [filtered, selectedId]);
  useEffect(() => { setDraft(selected ? cloneWorkout(selected) : null); setArmedDelete(false); }, [selected]);

  function updateSet(exerciseIndex: number, setIndex: number, field: "weight" | "reps" | "rir", value: string) { setDraft((current) => { if (!current) return current; const next = cloneWorkout(current); const set = next.exercises?.[exerciseIndex]?.sets?.[setIndex]; if (!set) return current; if (field === "rir" && value === "") set.rir = null; else set[field] = Number(value); return next; }); }
  async function saveCorrections() { if (!draft) return; setBusy(true); try { await createSafetySnapshot(`Before editing ${draft.name ?? "workout"}`); const rows = await db.workouts.orderBy("completedAt").reverse().toArray(); const corrected = recompute(draft); const value = JSON.stringify(rows.map((row) => row.id === corrected.id ? corrected : row.payload)); localStorage.setItem(HISTORY_KEY, value); await persistLegacyKey(HISTORY_KEY, value); setStatus("Corrections saved. Volume/e1RM were recalculated and old PR labels for this edited workout were cleared."); await refresh(corrected.id); } catch (error) { setStatus(error instanceof Error ? error.message : "Could not save those corrections."); } finally { setBusy(false); } }
  async function deleteWorkout() { if (!draft) return; if (!armedDelete) { setArmedDelete(true); setStatus("Tap Delete again within 5 seconds to confirm. A safety snapshot will be created first."); window.setTimeout(() => setArmedDelete(false), 5000); return; } setBusy(true); try { await createSafetySnapshot(`Before deleting ${draft.name ?? "workout"}`); await removeWorkout(draft.id); setStatus("Workout deleted. Data Center rollback remains available."); await refresh(); } catch (error) { setStatus(error instanceof Error ? error.message : "Could not delete that workout."); } finally { setBusy(false); setArmedDelete(false); } }

  return (
    <div className="ds-stack">
      <div className="ds-rise">
        <PageHeader
          eyebrow="TRAINING JOURNAL · V1.3"
          eyebrowVolt
          title="History"
          lede="Find any session fast, then inspect or correct it safely."
          action={
            <div className="ds-cluster">
              <a className="ds-btn ds-btn--ghost ds-btn--sm" href="/progress">Progress</a>
              <a className="ds-btn ds-btn--ghost ds-btn--sm" href="/gym">Gym</a>
            </div>
          }
        />
      </div>

      <Card className="ds-rise ds-rise--1">
        <div className="ds-stack">
          <Field label="Search workouts">
            <TextInput aria-label="Search workouts" placeholder="Search workout or exercise…" value={query} onChange={(event) => setQuery(event.target.value)} />
          </Field>
          <div className="ds-grid-2">
            <Field label="Routine">
              <SelectInput value={routineFilter} onChange={(event) => setRoutineFilter(event.target.value)}>
                <option value="all">All routines</option>
                {routineOptions.map((item) => <option key={item}>{item}</option>)}
              </SelectInput>
            </Field>
            <Field label="Exercise">
              <SelectInput value={exerciseFilter} onChange={(event) => setExerciseFilter(event.target.value)}>
                <option value="all">All exercises</option>
                {exerciseOptions.map((item) => <option key={item}>{item}</option>)}
              </SelectInput>
            </Field>
          </div>
          <div>
            <div className="ds-field__label" style={{ marginBottom: 6 }}>Range</div>
            <SegmentedControl
              label="Date range"
              options={[{ value: "all", label: "All time" }, { value: "30", label: "Last 30 days" }, { value: "90", label: "Last 90 days" }]}
              value={range}
              onChange={(value) => setRange(value)}
            />
          </div>
          <div className="ds-cluster" style={{ justifyContent: "space-between" }}>
            <Chip selected={prOnly} onClick={() => setPrOnly((value) => !value)}>🏆 PR only</Chip>
            <span className="ds-muted">{filtered.length} result{filtered.length === 1 ? "" : "s"}</span>
          </div>
        </div>
      </Card>

      <Card tight className="ds-rise ds-rise--2">
        <p className="ds-muted" role="status" style={{ margin: 0 }}>{status}</p>
      </Card>

      <div className="ds-rise ds-rise--3">
        <div className="ds-stack">
          <div>
            {filtered.map((workout) => (
              <button
                type="button"
                key={workout.id}
                className="ds-row"
                style={workout.id === selectedId ? { borderColor: "var(--ds-border-glow)" } : undefined}
                onClick={() => setSelectedId(workout.id)}
              >
                <span className="ds-row__body">
                  <span className="ds-row__title">{workout.name ?? "Workout"}</span>
                  <span className="ds-row__sub" style={{ display: "block" }}>{formatDate(workout.completedAt)}</span>
                  <span className="ds-row__sub" style={{ display: "block" }}>
                    {Number(workout.completedSets ?? 0)} sets · {Math.round(Number(workout.totalVolume ?? 0)).toLocaleString()} lb{workout.prs?.length ? ` · 🏆 ${workout.prs.length}` : ""}
                  </span>
                </span>
              </button>
            ))}
            {!filtered.length && <EmptyState title="No workouts match these filters." />}
          </div>

          <Card>
            {draft ? (
              <div className="ds-stack">
                <div>
                  <p className="ds-eyebrow">WORKOUT DETAIL</p>
                  <div style={{ marginTop: 8 }}>
                    <Field label="Workout name">
                      <TextInput aria-label="Workout name" value={draft.name ?? "Workout"} onChange={(event) => setDraft((current) => current ? { ...current, name: event.target.value } : current)} />
                    </Field>
                  </div>
                  <p className="ds-muted" style={{ margin: "8px 0 0" }}>{formatDate(draft.completedAt)} · {formatDuration(draft.durationSeconds)}</p>
                </div>
                <div className="ds-cluster">
                  <Button variant="primary" disabled={busy} onClick={saveCorrections}>Save corrections</Button>
                  <Button variant="danger" disabled={busy} onClick={deleteWorkout}>{armedDelete ? "Tap again to delete" : "Delete"}</Button>
                </div>
                <StatGrid cols={4}>
                  <Stat label="Sets" value={Number(draft.completedSets ?? 0)} />
                  <Stat label="Volume" value={<>{Math.round(Number(draft.totalVolume ?? 0)).toLocaleString()}<span style={{ fontSize: "0.7em" }}> lb</span></>} />
                  <Stat label="Avg RIR" value={typeof draft.averageRir === "number" ? draft.averageRir.toFixed(1) : "—"} />
                  <Stat label="PRs" value={draft.prs?.length ?? 0} tone="amber" />
                </StatGrid>
                <div className="ds-stack">
                  {(draft.exercises ?? []).map((exercise, exerciseIndex) => (
                    <Card tight key={`${exercise.id ?? exercise.name}-${exerciseIndex}`}>
                      <details open>
                        <summary style={{ cursor: "pointer" }}>
                          <div className="ds-cluster" style={{ justifyContent: "space-between" }}>
                            <strong>{exercise.name ?? exercise.id ?? `Exercise ${exerciseIndex + 1}`}</strong>
                            <span className="ds-muted" style={{ fontSize: "0.8rem" }}>{exercise.sets?.length ?? 0} sets</span>
                          </div>
                        </summary>
                        <div style={{ marginTop: 12 }}>
                          <div style={{ display: "grid", gridTemplateColumns: SET_GRID_COLUMNS, gap: 8, alignItems: "center" }}>
                            <span className="ds-field__label">Set</span>
                            <span className="ds-field__label">Lb</span>
                            <span className="ds-field__label">Reps</span>
                            <span className="ds-field__label">RIR</span>
                            <span className="ds-field__label">e1RM</span>
                          </div>
                          <div className="ds-stack" style={{ marginTop: 8 }}>
                            {(exercise.sets ?? []).map((set, setIndex) => (
                              <div key={`${exercise.id}-${setIndex}`} style={{ display: "grid", gridTemplateColumns: SET_GRID_COLUMNS, gap: 8, alignItems: "center" }}>
                                <span style={{ fontWeight: 800 }}>{setIndex + 1}</span>
                                <span className="ds-field__control">
                                  <TextInput type="number" inputMode="decimal" aria-label={`Set ${setIndex + 1} weight in pounds`} value={set.weight ?? 0} onChange={(event) => updateSet(exerciseIndex, setIndex, "weight", event.target.value)} />
                                </span>
                                <span className="ds-field__control">
                                  <TextInput type="number" inputMode="numeric" aria-label={`Set ${setIndex + 1} reps`} value={set.reps ?? 0} onChange={(event) => updateSet(exerciseIndex, setIndex, "reps", event.target.value)} />
                                </span>
                                <span className="ds-field__control">
                                  <TextInput type="number" inputMode="decimal" min="0" max="10" step="0.5" aria-label={`Set ${setIndex + 1} RIR`} value={set.rir ?? ""} onChange={(event) => updateSet(exerciseIndex, setIndex, "rir", event.target.value)} />
                                </span>
                                <span className="ds-muted">{Math.round(e1rm(Number(set.weight ?? 0), Number(set.reps ?? 0)))}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      </details>
                    </Card>
                  ))}
                </div>
              </div>
            ) : (
              <EmptyState title="Choose a workout to inspect it." />
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}
