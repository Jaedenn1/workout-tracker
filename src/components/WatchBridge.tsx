"use client";

import { useEffect, useMemo, useState, type ChangeEvent } from "react";
import {
  Button,
  Card,
  ListRow,
  PageHeader,
  PageShell,
  SectionHeader,
  Stat,
  StatGrid,
} from "../ui";

const ROUTINES_KEY = "workout-tracker:v0.4:routines";
const ACTIVE_ROUTINE_KEY = "workout-tracker:v0.4:active-routine";
const DRAFTS_KEY = "workout-tracker:v0.7:drafts";

type DraftSet = { id: string; weight: number | null; reps: number | null; completed: boolean };
type DraftExercise = { id: string; name: string; restSeconds?: number; sets: DraftSet[] };
type Draft = { startedAt: string; exercises: DraftExercise[] };
type DraftMap = Record<string, Draft>;
type Routine = { id: string; name: string };

type WatchSession = {
  version: 1;
  revision: number;
  id: string;
  name: string;
  startedAt: string;
  activeExerciseIndex: number;
  restEndsAt: string | null;
  exercises: Array<{
    id: string;
    name: string;
    restSeconds: number;
    sets: DraftSet[];
  }>;
};

function parse<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function currentIndex(exercises: DraftExercise[]) {
  const found = exercises.findIndex((exercise) => exercise.sets.some((set) => !set.completed));
  return found >= 0 ? found : Math.max(0, exercises.length - 1);
}

export default function WatchBridge() {
  const [drafts, setDrafts] = useState<DraftMap>({});
  const [routines, setRoutines] = useState<Routine[]>([]);
  const [activeRoutineId, setActiveRoutineId] = useState("");
  const [status, setStatus] = useState("Loading Gym Mode draft…");

  useEffect(() => {
    const nextDrafts = parse<DraftMap>(DRAFTS_KEY, {});
    const nextRoutines = parse<Routine[]>(ROUTINES_KEY, []);
    const active = localStorage.getItem(ACTIVE_ROUTINE_KEY) ?? nextRoutines[0]?.id ?? "";
    setDrafts(nextDrafts);
    setRoutines(nextRoutines);
    setActiveRoutineId(active);
    setStatus(nextDrafts[active] ? "Current Gym Mode draft is ready for Apple Watch." : "Start or open a workout in Gym Mode first, then return here.");
  }, []);

  const session = useMemo<WatchSession | null>(() => {
    const draft = drafts[activeRoutineId];
    if (!draft?.exercises?.length) return null;
    const routine = routines.find((item) => item.id === activeRoutineId);
    return {
      version: 1,
      revision: 1,
      id: `watch-${activeRoutineId}-${draft.startedAt}`,
      name: routine?.name ?? "Workout",
      startedAt: draft.startedAt,
      activeExerciseIndex: currentIndex(draft.exercises),
      restEndsAt: null,
      exercises: draft.exercises.map((exercise) => ({
        id: exercise.id,
        name: exercise.name,
        restSeconds: exercise.restSeconds ?? 90,
        sets: exercise.sets.map((set) => ({
          id: set.id,
          weight: set.weight ?? null,
          reps: set.reps ?? null,
          completed: Boolean(set.completed),
        })),
      })),
    };
  }, [drafts, routines, activeRoutineId]);

  const completed = session?.exercises.flatMap((exercise) => exercise.sets).filter((set) => set.completed).length ?? 0;
  const total = session?.exercises.flatMap((exercise) => exercise.sets).length ?? 0;

  function exportSession() {
    if (!session) {
      setStatus("No active Gym Mode draft is available to export.");
      return;
    }
    const blob = new Blob([JSON.stringify(session, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `watch-session-${session.name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}.json`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 0);
    setStatus("Watch Session exported. Open it in the native iPhone companion, then start Watch sync.");
  }

  async function importSession(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    try {
      const incoming = JSON.parse(await file.text()) as WatchSession;
      if (incoming.version !== 1 || !Array.isArray(incoming.exercises)) throw new Error("This is not a v0.9 Watch Session file.");
      const draft = drafts[activeRoutineId];
      if (!draft) throw new Error("Open the matching Gym Mode workout on this device before importing.");

      const nextDraft: Draft = {
        ...draft,
        exercises: draft.exercises.map((exercise) => {
          const synced = incoming.exercises.find((item) => item.id === exercise.id);
          if (!synced) return exercise;
          return {
            ...exercise,
            sets: exercise.sets.map((set) => {
              const syncedSet = synced.sets.find((item) => item.id === set.id);
              return syncedSet ? { ...set, weight: syncedSet.weight, reps: syncedSet.reps, completed: syncedSet.completed } : set;
            }),
          };
        }),
      };
      const next = { ...drafts, [activeRoutineId]: nextDraft };
      localStorage.setItem(DRAFTS_KEY, JSON.stringify(next));
      setDrafts(next);
      setStatus("Watch edits imported into the current Gym Mode draft. Return to Gym Mode to continue or finish.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Could not import this Watch Session file.");
    }
  }

  const go = (href: string) => { window.location.href = href; };

  return (
    <PageShell>
      <div className="ds-rise">
        <PageHeader
          eyebrow="V0.9 · Apple Watch"
          eyebrowVolt
          title={<>Watch Session <span className="ds-accent">Bridge</span></>}
          lede="Move the active Gym Mode draft into the native iPhone app, control it live from Apple Watch, then import the updated session back without duplicating sets."
          action={<Button variant="ghost" size="sm" onClick={() => go("/gym")}>← Gym Mode</Button>}
        />
      </div>

      <Card tight className="ds-rise ds-rise--1" role="status">
        <span className="ds-muted">{status}</span>
      </Card>

      <div className="ds-grid-2 ds-rise ds-rise--2">
        <Card>
          <SectionHeader eyebrow="Current draft" title={session?.name ?? "No active workout"} />
          <div style={{ marginTop: 12 }}>
            <StatGrid cols={3}>
              <Stat label="Exercises" value={session?.exercises.length ?? 0} />
              <Stat label="Sets done" value={completed} />
              <Stat label="Total sets" value={total} />
            </StatGrid>
          </div>
          <div className="ds-cluster" style={{ marginTop: 14 }}>
            <Button variant="primary" onClick={exportSession}>Export to iPhone</Button>
            <label className="ds-btn ds-btn--secondary ds-btn--md" style={{ cursor: "pointer" }} htmlFor="watch-session-import">Import Watch edits</label>
            <input
              id="watch-session-import"
              style={{ display: "none" }}
              type="file"
              accept="application/json,.json"
              onChange={importSession}
            />
          </div>
        </Card>

        <Card>
          <SectionHeader eyebrow="Native flow" title="Phone ↔ Watch live sync" />
          <p className="ds-muted" style={{ margin: "8px 0 0" }}>The SwiftUI companion uses WatchConnectivity for live messages and application-context fallback. Every set action has a stable action ID, so a delayed or repeated delivery cannot append a duplicate set.</p>
          <p className="ds-muted" style={{ margin: "8px 0 0" }}>Live Activities show current exercise, set progress, and rest countdown on the iPhone Lock Screen/Dynamic Island. Apple Watch gets the same state plus wrist controls and a rest-end haptic while the Watch app is active.</p>
        </Card>
      </div>

      {session && (
        <Card className="ds-rise ds-rise--3">
          <SectionHeader eyebrow="Session preview" title="Planned exercises" />
          <div className="ds-stack" style={{ marginTop: 12 }}>
            {session.exercises.map((exercise, index) => (
              <ListRow
                key={exercise.id}
                title={<strong>{index + 1}. {exercise.name}</strong>}
                sub={`${exercise.sets.filter((set) => set.completed).length}/${exercise.sets.length} sets · ${exercise.restSeconds}s rest`}
              />
            ))}
          </div>
        </Card>
      )}
    </PageShell>
  );
}
