"use client";

import { useEffect, useMemo, useState } from "react";
import { defaultRoutines, exerciseLibrary, type ExerciseDefinition, type RoutineDefinition } from "../data/training";

const ROUTINES_KEY = "workout-tracker:v0.4:routines";
const ACTIVE_ROUTINE_KEY = "workout-tracker:v0.4:active-routine";
const CUSTOM_KEY = "workout-tracker:v0.7:custom-exercises";
const REST_KEY = "workout-tracker:v0.7:rest-seconds";
const META_KEY = "workout-tracker:v1.3:routine-meta";
type Meta = Record<string, { note?: string }>;

function readJson<T>(key: string, fallback: T): T { try { const parsed = JSON.parse(localStorage.getItem(key) ?? "null"); return parsed ?? fallback; } catch { return fallback; } }
function uid(label: string) { return `${label}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`; }

export default function RoutineManager() {
  const [routines, setRoutines] = useState<RoutineDefinition[]>(defaultRoutines);
  const [activeId, setActiveId] = useState("legs");
  const [selectedId, setSelectedId] = useState("legs");
  const [custom, setCustom] = useState<ExerciseDefinition[]>([]);
  const [rests, setRests] = useState<Record<string, number>>({});
  const [meta, setMeta] = useState<Meta>({});
  const [armedDelete, setArmedDelete] = useState("");
  useEffect(() => {
    const stored = readJson<RoutineDefinition[]>(ROUTINES_KEY, defaultRoutines);
    const next = stored.length ? stored : defaultRoutines;
    const active = localStorage.getItem(ACTIVE_ROUTINE_KEY) ?? next[0]?.id ?? "legs";
    setRoutines(next); setActiveId(active); setSelectedId(next.some((item) => item.id === active) ? active : next[0]?.id ?? "legs");
    setCustom(readJson<ExerciseDefinition[]>(CUSTOM_KEY, [])); setRests(readJson<Record<string, number>>(REST_KEY, {})); setMeta(readJson<Meta>(META_KEY, {}));
  }, []);
  const definitions = useMemo(() => [...exerciseLibrary, ...custom], [custom]);
  const selected = routines.find((routine) => routine.id === selectedId) ?? routines[0];
  const selectedDefinitions = selected?.exerciseIds.map((id) => definitions.find((item) => item.id === id)).filter((item): item is ExerciseDefinition => Boolean(item)) ?? [];
  const totalSets = selectedDefinitions.reduce((sum, item) => sum + item.setCount, 0);

  function persist(next: RoutineDefinition[]) { setRoutines(next); localStorage.setItem(ROUTINES_KEY, JSON.stringify(next)); }
  function updateSelected(changes: Partial<RoutineDefinition>) { if (!selected) return; persist(routines.map((routine) => routine.id === selected.id ? { ...routine, ...changes } : routine)); }
  function createRoutine() { const routine = { id: uid("routine"), name: "New Routine", exerciseIds: [] }; persist([...routines, routine]); setSelectedId(routine.id); }
  function duplicateRoutine() { if (!selected) return; const routine = { ...selected, id: uid(`${selected.id}-copy`), name: `${selected.name} Copy`, exerciseIds: [...selected.exerciseIds] }; persist([...routines, routine]); setSelectedId(routine.id); }
  function removeRoutine() { if (!selected || routines.length <= 1) return; if (armedDelete !== selected.id) { setArmedDelete(selected.id); window.setTimeout(() => setArmedDelete(""), 5000); return; } const next = routines.filter((routine) => routine.id !== selected.id); persist(next); const fallback = next[0]?.id ?? "legs"; if (activeId === selected.id) { setActiveId(fallback); localStorage.setItem(ACTIVE_ROUTINE_KEY, fallback); } setSelectedId(fallback); setArmedDelete(""); }
  function activate() { if (!selected) return; setActiveId(selected.id); localStorage.setItem(ACTIVE_ROUTINE_KEY, selected.id); }
  function addExercise(id: string) { if (!selected || selected.exerciseIds.includes(id)) return; updateSelected({ exerciseIds: [...selected.exerciseIds, id] }); }
  function removeExercise(index: number) { if (!selected) return; updateSelected({ exerciseIds: selected.exerciseIds.filter((_, itemIndex) => itemIndex !== index) }); }
  function move(index: number, delta: number) { if (!selected) return; const to = index + delta; if (to < 0 || to >= selected.exerciseIds.length) return; const ids = [...selected.exerciseIds]; const [item] = ids.splice(index, 1); ids.splice(to, 0, item); updateSelected({ exerciseIds: ids }); }
  function setRest(id: string, value: number) { const next = { ...rests, [id]: Math.max(15, Math.min(600, value || 90)) }; setRests(next); localStorage.setItem(REST_KEY, JSON.stringify(next)); }
  function setNote(value: string) { if (!selected) return; const next = { ...meta, [selected.id]: { ...meta[selected.id], note: value } }; setMeta(next); localStorage.setItem(META_KEY, JSON.stringify(next)); }
  function restoreTemplates() { const byId = new Map(routines.map((item) => [item.id, item])); for (const template of defaultRoutines) if (!byId.has(template.id)) byId.set(template.id, template); persist([...byId.values()]); }

  return <main className="ti-shell">
    <header className="ti-topbar"><div><p className="ti-eyebrow">ROUTINE BUILDER · V1.3</p><h1>Routines</h1><p>Build the plan once. Gym Mode handles the execution.</p></div><div className="ti-top-actions"><a href="/">← Today</a><a href="/gym">Gym</a></div></header>
    <section className="ti-routine-layout"><aside className="ti-routine-list"><button className="ti-primary" onClick={createRoutine}>＋ New routine</button>{routines.map((routine) => <button key={routine.id} className={routine.id === selectedId ? "active" : ""} onClick={() => setSelectedId(routine.id)}><strong>{routine.name}</strong><span>{routine.exerciseIds.length} exercises{routine.id === activeId ? " · ACTIVE" : ""}</span></button>)}<button onClick={restoreTemplates}>Restore P/P/L templates</button></aside>
      <section className="ti-card ti-routine-editor">{selected && <><div className="ti-section-head"><div><p className="ti-eyebrow">ROUTINE</p><input className="ti-title-input" value={selected.name} onChange={(event) => updateSelected({ name: event.target.value })}/><span>{selectedDefinitions.length} exercises · about {totalSets} working sets</span></div><div className="ti-inline-actions"><button className={selected.id === activeId ? "active" : ""} onClick={activate}>{selected.id === activeId ? "Active routine" : "Set active"}</button><button onClick={duplicateRoutine}>Duplicate</button><button className="danger" onClick={removeRoutine}>{armedDelete === selected.id ? "Tap again to delete" : "Delete"}</button></div></div>
        <label className="ti-field">Routine note<textarea value={meta[selected.id]?.note ?? ""} onChange={(event) => setNote(event.target.value)} placeholder="Focus, cues, schedule, or intent for this routine…"/></label>
        <div className="ti-routine-exercises">{selectedDefinitions.map((exercise, index) => <article key={`${exercise.id}-${index}`}><div className="ti-routine-order"><button disabled={index === 0} onClick={() => move(index, -1)}>↑</button><button disabled={index === selectedDefinitions.length - 1} onClick={() => move(index, 1)}>↓</button></div><div><strong>{exercise.name}</strong><span>{exercise.muscle} · {exercise.repMin}–{exercise.repMax} reps · {exercise.setCount} sets</span></div><label>Rest <input type="number" inputMode="numeric" min="15" max="600" step="15" value={rests[exercise.id] ?? 90} onChange={(event) => setRest(exercise.id, Number(event.target.value))}/> sec</label><button className="danger" onClick={() => removeExercise(index)}>Remove</button></article>)}{!selectedDefinitions.length && <p className="ti-empty">Add exercises below to build this routine.</p>}</div>
        <details className="ti-dropdown"><summary>Add exercise <span>exercise library</span></summary><div className="ti-add-grid">{definitions.filter((definition) => !selected.exerciseIds.includes(definition.id)).map((definition) => <button key={definition.id} onClick={() => addExercise(definition.id)}><strong>{definition.name}</strong><span>{definition.muscle} · {definition.repMin}–{definition.repMax}</span></button>)}</div></details>
      </>}</section></section>
  </main>;
}
