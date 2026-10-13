"use client";

import { useEffect, useMemo, useState } from "react";
import {
  BODYWEIGHT_KEY,
  HISTORY_KEY,
  READINESS_KEY,
  allExerciseSummaries,
  compareLatestWorkout,
  deltaLabel,
  formatDuration,
  formatShortDate,
  readinessForWorkout,
  readinessScore,
  safeArray,
  weeklyStats,
  type BodyweightEntry,
  type ReadinessRecord,
  type WorkoutHistoryItem,
} from "../lib/trainingIntelligence";
import {
  Badge,
  Button,
  Card,
  EmptyState,
  ListRow,
  PageHeader,
  PageShell,
  SectionHeader,
  Stat,
  StatGrid,
} from "../ui";

function signedDuration(seconds: number) {
  if (!seconds) return "0m";
  return `${seconds > 0 ? "+" : "−"}${formatDuration(Math.abs(seconds))}`;
}

function progressionTone(action: string | undefined): "volt" | "blue" | "neutral" {
  if (action === "increase") return "volt";
  if (action === "build") return "blue";
  return "neutral";
}

export default function TrainingIntelligenceDashboard() {
  const [history, setHistory] = useState<WorkoutHistoryItem[]>([]);
  const [bodyweight, setBodyweight] = useState<BodyweightEntry[]>([]);
  const [readiness, setReadiness] = useState<ReadinessRecord[]>([]);

  useEffect(() => {
    setHistory(safeArray<WorkoutHistoryItem>(localStorage.getItem(HISTORY_KEY)));
    setBodyweight(safeArray<BodyweightEntry>(localStorage.getItem(BODYWEIGHT_KEY)));
    setReadiness(safeArray<ReadinessRecord>(localStorage.getItem(READINESS_KEY)));
  }, []);

  const week = useMemo(() => weeklyStats(history), [history]);
  const comparison = useMemo(() => compareLatestWorkout(history), [history]);
  const summaries = useMemo(() => allExerciseSummaries(history), [history]);
  const ready = summaries.filter((item) => item.progression?.action === "increase");
  const plateaus = summaries.filter((item) => item.plateau);
  const latestWeight = [...bodyweight].sort((a, b) => String(b.recordedAt).localeCompare(String(a.recordedAt)))[0];
  const latestReadiness = readiness[0] ?? null;
  const scored = history
    .map((workout) => ({ workout, score: readinessScore(readinessForWorkout(readiness, workout)) }))
    .filter((item): item is { workout: WorkoutHistoryItem; score: number } => item.score != null);
  const highReady = scored.filter((item) => item.score >= 5);
  const lowReady = scored.filter((item) => item.score <= 2);
  const avgHigh = highReady.length ? highReady.reduce((sum, item) => sum + item.workout.totalVolume, 0) / highReady.length : null;
  const avgLow = lowReady.length ? lowReady.reduce((sum, item) => sum + item.workout.totalVolume, 0) / lowReady.length : null;

  const go = (href: string) => { window.location.href = href; };

  return (
    <PageShell>
      <div className="ds-rise">
        <PageHeader
          eyebrow="TRAINING INTELLIGENCE · V1.3"
          eyebrowVolt
          title="Progress"
          lede="Targets first. Details one level deeper."
          action={
            <div className="ds-cluster">
              <Button variant="ghost" size="sm" onClick={() => go("/prs")}>PR board</Button>
              <Button variant="ghost" size="sm" onClick={() => go("/gym")}>Gym</Button>
            </div>
          }
        />
      </div>

      <div className="ds-rise ds-rise--1">
        <SectionHeader eyebrow="THIS WEEK" title="Seven-day output" />
        <div style={{ marginTop: 12 }}>
          <StatGrid cols={2}>
            <Stat label="7-day sessions" value={week.sessions} />
            <Stat label="Working sets" value={week.sets} />
            <Stat label="Volume" value={`${Math.round(week.volume).toLocaleString()} lb`} />
            <Stat label="Training time" value={formatDuration(week.duration)} />
          </StatGrid>
        </div>
      </div>

      {comparison && (
        <div className="ds-rise ds-rise--2">
          <Card>
            <SectionHeader
              eyebrow={`VS LAST ${comparison.current.name.toUpperCase()}`}
              title={comparison.current.name}
              action={<span className="ds-muted" style={{ fontSize: "0.78rem" }}>{formatShortDate(comparison.current.completedAt)}</span>}
            />
            <div style={{ marginTop: 12 }}>
              <StatGrid cols={2}>
                <Stat label="Volume" value={deltaLabel(comparison.volumePct, "%")} sub={`${Math.round(comparison.current.totalVolume).toLocaleString()} lb today`} />
                <Stat label="Sets" value={deltaLabel(comparison.setDelta)} sub={`${comparison.current.completedSets} completed`} />
                <Stat label="Duration" value={signedDuration(comparison.durationDeltaSeconds)} sub={formatDuration(comparison.current.durationSeconds)} />
                <Stat label="Avg RIR" value={deltaLabel(comparison.rirDelta)} sub={typeof comparison.current.averageRir === "number" ? comparison.current.averageRir.toFixed(1) : "Not rated"} />
              </StatGrid>
            </div>
          </Card>
        </div>
      )}

      <div className="ds-rise ds-rise--3">
        <SectionHeader
          eyebrow="NEXT SESSION"
          title="Progression targets"
          action={<span className="ds-muted" style={{ fontSize: "0.78rem" }}>{ready.length} load increases ready</span>}
        />
        <div style={{ marginTop: 12 }}>
          <Card tight>
            <div className="ds-stack">
              {summaries.slice(0, 8).map((exercise) => (
                <ListRow
                    key={exercise.id}
                    href={`/exercise/${encodeURIComponent(exercise.id)}`}
                    title={exercise.name}
                    sub={exercise.progression?.reason}
                    trailing={
                      <span style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4 }}>
                        <Badge tone={progressionTone(exercise.progression?.action)}>{exercise.progression?.label}</Badge>
                        <span className="ds-row__sub">{exercise.progression?.target}</span>
                      </span>
                    }
                  />
              ))}
              {!summaries.length && (
                <EmptyState
                  title="No targets yet"
                  body="Complete your first workout and the app will build targets automatically."
                />
              )}
            </div>
          </Card>
        </div>
      </div>

      <div className="ds-rise ds-rise--4">
        <SectionHeader eyebrow="SIGNALS" title="What needs attention" />
        <div style={{ marginTop: 12 }}>
          <Card tight>
            <div className="ds-stack">
              <ListRow
                title={ready.length ? `${ready.length} exercise${ready.length === 1 ? "" : "s"} ready for more load` : "No forced load increases"}
                sub={ready.length ? ready.slice(0, 3).map((item) => item.name).join(" · ") : "Keep accumulating clean reps."}
              />
              <ListRow
                title={plateaus.length ? `${plateaus.length} possible plateau${plateaus.length === 1 ? "" : "s"}` : "No obvious plateaus"}
                sub={plateaus.length ? `${plateaus.slice(0, 3).map((item) => item.name).join(" · ")} have been nearly flat across 3 sessions.` : "Recent e1RM trends are still moving."}
              />
              <ListRow
                title={latestWeight ? `Bodyweight ${Number(latestWeight.value).toFixed(1)} lb` : "Bodyweight not logged"}
                sub={<a href="/bodyweight" style={{ color: "var(--ds-volt)" }}>Open bodyweight manager →</a>}
              />
            </div>
          </Card>
        </div>
      </div>

      <div className="ds-rise">
        <SectionHeader eyebrow="EXERCISES" title="Performance library" action={<span className="ds-muted" style={{ fontSize: "0.78rem" }}>Tap any exercise for its full page</span>} />
        <div style={{ marginTop: 12 }}>
          {summaries.length > 0 && (
            <div className="ds-grid-2">
              {summaries.map((exercise) => (
                <ListRow
                    key={exercise.id}
                    href={`/exercise/${encodeURIComponent(exercise.id)}`}
                    title={<><span className="ds-row__sub" style={{ display: "block" }}>{exercise.muscle}</span>{exercise.name}</>}
                    sub={<><b>{Math.round(exercise.bestE1rm)} lb e1RM</b> · {exercise.sessionCount} sessions</>}
                  />
              ))}
            </div>
          )}
          {!summaries.length && (
            <Card tight>
              <EmptyState
                title="No exercises yet"
                body="Exercise pages populate automatically from completed workouts."
              />
            </Card>
          )}
        </div>
      </div>

      <div className="ds-rise">
        <div className="ds-grid-2">
          <Card tight pressable onClick={() => go("/prs")}>
            <div className="ds-stat__label">Personal records</div>
            <div className="ds-stat__value" style={{ fontSize: "1.15rem" }}>Open PR board</div>
            <div className="ds-stat__sub">Load · reps · e1RM · volume · streaks →</div>
          </Card>
          <Card tight>
            <div className="ds-stat__label">Readiness relationship</div>
            <div className="ds-stat__value" style={{ fontSize: "1.15rem" }}>{latestReadiness ? `${latestReadiness.sleep} sleep · ${latestReadiness.energy} energy` : "Start tagging readiness"}</div>
            <div className="ds-stat__sub">{avgHigh != null && avgLow != null ? `High-readiness sessions average ${Math.round(((avgHigh - avgLow) / Math.max(1, avgLow)) * 100)}% different volume vs low-readiness sessions.` : "After a few tagged workouts, this card will compare performance by readiness."}</div>
          </Card>
        </div>
      </div>
    </PageShell>
  );
}
