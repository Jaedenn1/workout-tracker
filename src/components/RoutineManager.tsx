"use client";

import { useEffect, useMemo, useState } from "react";
import { defaultRoutines, ensureCurrentRoutineTemplates, exerciseLibrary, type ExerciseDefinition, type RoutineDefinition } from "../data/training";
import {
  Badge,
  Button,
  Card,
  EmptyState,
  Field,
  IconButton,
  ListRow,
  PageHeader,
  PageShell,
  SectionHeader,
  Stepper,
  TextAreaInput,
  TextInput,
} from "../ui";

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
    const next = ensureCurrentRoutineTemplates(stored);
    if (next.length !== stored.length) localStorage.setItem(ROUTINES_KEY, JSON.stringify(next));
    const active = localStorage.getItem(ACTIVE_ROUTINE_KEY) ?? next[0]?.id ?? "legs";
    setRoutines(next); setActiveId(active); setSelectedId(next.some((item) => item.id === active) ? active : next[0]?.id ?? "legs");
    setCustom(readJson<ExerciseDefinition[]>(CUSTOM_KEY, [])); setRests(readJson<Record<string, number>>(REST_KEY, {})); setMeta(readJson<Meta>(META_KEY, {}));
  }, []);
  const definitions = useMemo(() => [...exerciseLibrary, ...custom], [custom]);
  const selected = routines.find((routine) => routine.id === selectedId) ?? routines[0];
  const selectedDefinitions = selected?.exerciseIds.map((id) => definitions.find((item) => item.id === id)).filter((item): item is ExerciseDefinition => Boolean(item)) ?? [];
  const totalSets = selectedDefinitions.reduce((sum, item) => sum + (selected?.setCountOverrides?.[item.id] ?? item.setCount), 0);

  function persist(next: RoutineDefinition[]) { setRoutines(next); localStorage.setItem(ROUTINES_KEY, JSON.stringify(next)); }
  function updateSelected(changes: Partial<RoutineDefinition>) { if (!selected) return; persist(routines.map((routine) => routine.id === selected.id ? { ...routine, ...changes } : routine)); }
  function createRoutine() { const routine = { id: uid("routine"), name: "New Routine", exerciseIds: [] }; persist([...routines, routine]); setSelectedId(routine.id); }
  function duplicateRoutine() { if (!selected) return; const routine = { ...selected, id: uid(`${selected.id}-copy`), name: `${selected.name} Copy`, exerciseIds: [...selected.exerciseIds], setCountOverrides: selected.setCountOverrides ? { ...selected.setCountOverrides } : undefined }; persist([...routines, routine]); setSelectedId(routine.id); }
  function removeRoutine() { if (!selected || routines.length <= 1) return; if (armedDelete !== selected.id) { setArmedDelete(selected.id); window.setTimeout(() => setArmedDelete(""), 5000); return; } const next = routines.filter((routine) => routine.id !== selected.id); persist(next); const fallback = next[0]?.id ?? "legs"; if (activeId === selected.id) { setActiveId(fallback); localStorage.setItem(ACTIVE_ROUTINE_KEY, fallback); } setSelectedId(fallback); setArmedDelete(""); }
  function activate() { if (!selected) return; setActiveId(selected.id); localStorage.setItem(ACTIVE_ROUTINE_KEY, selected.id); }
  function addExercise(id: string) { if (!selected || selected.exerciseIds.includes(id)) return; updateSelected({ exerciseIds: [...selected.exerciseIds, id] }); }
  function removeExercise(index: number) { if (!selected) return; updateSelected({ exerciseIds: selected.exerciseIds.filter((_, itemIndex) => itemIndex !== index) }); }
  function move(index: number, delta: number) { if (!selected) return; const to = index + delta; if (to < 0 || to >= selected.exerciseIds.length) return; const ids = [...selected.exerciseIds]; const [item] = ids.splice(index, 1); ids.splice(to, 0, item); updateSelected({ exerciseIds: ids }); }
  function setRest(id: string, value: number) { const next = { ...rests, [id]: Math.max(15, Math.min(600, value || 90)) }; setRests(next); localStorage.setItem(REST_KEY, JSON.stringify(next)); }
  function setNote(value: string) { if (!selected) return; const next = { ...meta, [selected.id]: { ...meta[selected.id], note: value } }; setMeta(next); localStorage.setItem(META_KEY, JSON.stringify(next)); }
  function restoreTemplates() { const byId = new Map(routines.map((item) => [item.id, item])); for (const template of defaultRoutines) if (!byId.has(template.id)) byId.set(template.id, template); persist([...byId.values()]); }

  const go = (href: string) => { window.location.href = href; };

  return (
    <PageShell>
      <div className="ds-rise">
        <PageHeader
          eyebrow="ROUTINE BUILDER · V1.3"
          eyebrowVolt
          title="Routines"
          lede="Build the plan once. Gym Mode handles the execution."
          action={
            <div className="ds-cluster">
              <Button variant="ghost" size="sm" onClick={() => go("/")}>← Today</Button>
              <Button variant="ghost" size="sm" onClick={() => go("/gym")}>Gym</Button>
            </div>
          }
        />
      </div>

      <div className="ds-rise ds-rise--1">
        <SectionHeader eyebrow="LIBRARY" title="Your routines" />
        <div style={{ marginTop: 12 }}>
          <div className="ds-stack">
            <Button variant="primary" block onClick={createRoutine}>＋ New routine</Button>
            {routines.map((routine) => (
              <ListRow
                key={routine.id}
                title={routine.name}
                sub={`${routine.exerciseIds.length} exercises${routine.id === activeId ? " · Active" : ""}`}
                trailing={routine.id === selectedId ? <Badge tone="volt">Editing</Badge> : undefined}
                onClick={() => setSelectedId(routine.id)}
              />
            ))}
            <Button variant="ghost" onClick={restoreTemplates}>Restore P/P/L templates</Button>
          </div>
        </div>
      </div>

      {selected && (
        <div className="ds-rise ds-rise--2">
          <Card>
            <div className="ds-stack">
              <SectionHeader
                eyebrow="ROUTINE"
                title="Editor"
                action={<span className="ds-muted" style={{ fontSize: "0.78rem" }}>{selectedDefinitions.length} exercises · about {totalSets} working sets</span>}
              />
              <Field label="Routine name">
                <TextInput value={selected.name} onChange={(event) => updateSelected({ name: event.target.value })} />
              </Field>
              <div className="ds-grid-2">
                <Button variant="secondary" block onClick={activate}>{selected.id === activeId ? "Active routine" : "Set active"}</Button>
                <Button variant="secondary" block onClick={duplicateRoutine}>Duplicate</Button>
              </div>
              <Button variant="danger" block onClick={removeRoutine}>{armedDelete === selected.id ? "Tap again to delete" : "Delete"}</Button>
              <Field label="Routine note">
                <TextAreaInput value={meta[selected.id]?.note ?? ""} onChange={(event) => setNote(event.target.value)} placeholder="Focus, cues, schedule, or intent for this routine…" />
              </Field>

              <div>
                <SectionHeader eyebrow="EXERCISES" title="In this routine" />
                <div style={{ marginTop: 12 }}>
                  <div className="ds-stack">
                    {selectedDefinitions.map((exercise, index) => (
                      <Card tight key={`${exercise.id}-${index}`}>
                        <div className="ds-stack">
                          <div className="ds-cluster" style={{ justifyContent: "space-between", alignItems: "flex-start", flexWrap: "nowrap" }}>
                            <div className="ds-cluster" style={{ flexWrap: "nowrap" }}>
                              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                                <IconButton small label={`Move ${exercise.name} up`} disabled={index === 0} onClick={() => move(index, -1)}>↑</IconButton>
                                <IconButton small label={`Move ${exercise.name} down`} disabled={index === selectedDefinitions.length - 1} onClick={() => move(index, 1)}>↓</IconButton>
                              </div>
                              <div style={{ minWidth: 0 }}>
                                <div className="ds-row__title">{exercise.name}</div>
                                <div className="ds-row__sub">{exercise.muscle} · {exercise.repMin}–{exercise.repMax} reps · {selected.setCountOverrides?.[exercise.id] ?? exercise.setCount} sets</div>
                              </div>
                            </div>
                            <Button variant="danger" size="sm" onClick={() => removeExercise(index)}>Remove</Button>
                          </div>
                          <Stepper
                            label="Rest"
                            unit="sec"
                            value={String(rests[exercise.id] ?? 90)}
                            editable
                            inputProps={{
                              type: "number",
                              inputMode: "numeric",
                              min: 15,
                              max: 600,
                              step: 15,
                              onChange: (event) => setRest(exercise.id, Number(event.target.value)),
                            }}
                            onDecrement={() => setRest(exercise.id, (rests[exercise.id] ?? 90) - 15)}
                            onIncrement={() => setRest(exercise.id, (rests[exercise.id] ?? 90) + 15)}
                            decrementLabel="Decrease rest"
                            incrementLabel="Increase rest"
                          />
                        </div>
                      </Card>
                    ))}
                    {!selectedDefinitions.length && (
                      <EmptyState
                        title="Empty routine"
                        body="Add exercises below to build this routine."
                      />
                    )}
                  </div>
                </div>
              </div>

              <details className="ds-card ds-card--tight">
                <summary style={{ cursor: "pointer", listStyle: "none" }}>
                  <span className="ds-section-title" style={{ fontSize: "1rem" }}>Add exercise</span>
                  <span className="ds-muted" style={{ fontSize: "0.8rem" }}> · exercise library</span>
                </summary>
                <div className="ds-stack" style={{ marginTop: 12 }}>
                  {definitions.filter((definition) => !selected.exerciseIds.includes(definition.id)).map((definition) => (
                    <ListRow
                      key={definition.id}
                      title={definition.name}
                      sub={`${definition.muscle} · ${definition.repMin}–${definition.repMax}`}
                      onClick={() => addExercise(definition.id)}
                    />
                  ))}
                </div>
              </details>
            </div>
          </Card>
        </div>
      )}
    </PageShell>
  );
}
