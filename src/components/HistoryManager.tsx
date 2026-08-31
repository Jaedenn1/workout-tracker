"use client";

import { useEffect, useMemo, useState } from "react";
import { createSafetySnapshot, db, persistLegacyKey, removeWorkout } from "../lib/database";

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

  return <main className="ti-shell ti-history"><header className="ti-topbar"><div><p className="ti-eyebrow">TRAINING JOURNAL · V1.3</p><h1>History</h1><p>Find any session fast, then inspect or correct it safely.</p></div><div className="ti-top-actions"><a href="/progress">Progress</a><a href="/gym">Gym</a></div></header>
    <section className="ti-card ti-history-filters"><input aria-label="Search workouts" placeholder="Search workout or exercise…" value={query} onChange={(event) => setQuery(event.target.value)}/><select value={routineFilter} onChange={(event) => setRoutineFilter(event.target.value)}><option value="all">All routines</option>{routineOptions.map((item) => <option key={item}>{item}</option>)}</select><select value={exerciseFilter} onChange={(event) => setExerciseFilter(event.target.value)}><option value="all">All exercises</option>{exerciseOptions.map((item) => <option key={item}>{item}</option>)}</select><select value={range} onChange={(event) => setRange(event.target.value)}><option value="all">All time</option><option value="30">Last 30 days</option><option value="90">Last 90 days</option></select><button className={prOnly ? "active" : ""} onClick={() => setPrOnly((value) => !value)}>🏆 PR only</button><span>{filtered.length} result{filtered.length === 1 ? "" : "s"}</span></section>
    <div className="ti-status" role="status">{status}</div>
    <section className="ti-history-layout"><aside className="ti-history-list">{filtered.map((workout) => <button key={workout.id} className={workout.id === selectedId ? "active" : ""} onClick={() => setSelectedId(workout.id)}><strong>{workout.name ?? "Workout"}</strong><span>{formatDate(workout.completedAt)}</span><small>{Number(workout.completedSets ?? 0)} sets · {Math.round(Number(workout.totalVolume ?? 0)).toLocaleString()} lb {workout.prs?.length ? `· 🏆 ${workout.prs.length}` : ""}</small></button>)}{!filtered.length && <p className="ti-empty">No workouts match these filters.</p>}</aside>
      <section className="ti-card ti-history-detail">{draft ? <><div className="ti-section-head"><div><p className="ti-eyebrow">WORKOUT DETAIL</p><input className="ti-title-input" value={draft.name ?? "Workout"} onChange={(event) => setDraft((current) => current ? { ...current, name: event.target.value } : current)}/><span>{formatDate(draft.completedAt)} · {formatDuration(draft.durationSeconds)}</span></div><div className="ti-inline-actions"><button disabled={busy} onClick={saveCorrections}>Save corrections</button><button className="danger" disabled={busy} onClick={deleteWorkout}>{armedDelete ? "Tap again to delete" : "Delete"}</button></div></div>
        <div className="ti-kpi-grid ti-history-kpis"><div className="ti-kpi"><span>Sets</span><strong>{Number(draft.completedSets ?? 0)}</strong></div><div className="ti-kpi"><span>Volume</span><strong>{Math.round(Number(draft.totalVolume ?? 0)).toLocaleString()}<small> lb</small></strong></div><div className="ti-kpi"><span>Avg RIR</span><strong>{typeof draft.averageRir === "number" ? draft.averageRir.toFixed(1) : "—"}</strong></div><div className="ti-kpi"><span>PRs</span><strong>{draft.prs?.length ?? 0}</strong></div></div>
        <div className="ti-history-exercises">{(draft.exercises ?? []).map((exercise, exerciseIndex) => <details open key={`${exercise.id ?? exercise.name}-${exerciseIndex}`}><summary><strong>{exercise.name ?? exercise.id ?? `Exercise ${exerciseIndex + 1}`}</strong><span>{exercise.sets?.length ?? 0} sets</span></summary><div className="ti-history-set-head"><span>SET</span><span>LB</span><span>REPS</span><span>RIR</span><span>e1RM</span></div>{(exercise.sets ?? []).map((set, setIndex) => <div className="ti-history-set" key={`${exercise.id}-${setIndex}`}><strong>{setIndex + 1}</strong><input type="number" inputMode="decimal" value={set.weight ?? 0} onChange={(event) => updateSet(exerciseIndex, setIndex, "weight", event.target.value)}/><input type="number" inputMode="numeric" value={set.reps ?? 0} onChange={(event) => updateSet(exerciseIndex, setIndex, "reps", event.target.value)}/><input type="number" inputMode="decimal" min="0" max="10" step="0.5" value={set.rir ?? ""} onChange={(event) => updateSet(exerciseIndex, setIndex, "rir", event.target.value)}/><span>{Math.round(e1rm(Number(set.weight ?? 0), Number(set.reps ?? 0)))}</span></div>)}</details>)}</div></> : <p className="ti-empty">Choose a workout to inspect it.</p>}</section></section>
  </main>;
}
