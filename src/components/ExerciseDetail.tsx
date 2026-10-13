"use client";

import { useEffect, useMemo, useState } from "react";
import { getExerciseDefinition } from "../data/training";
import { HISTORY_KEY, formatShortDate, safeArray, summarizeExercise, type WorkoutHistoryItem } from "../lib/trainingIntelligence";
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

function sparkPoints(values: number[], width = 360, height = 90) {
  if (!values.length) return "";
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = Math.max(1, max - min);
  return values.map((value, index) => {
    const x = values.length === 1 ? width / 2 : (index / (values.length - 1)) * width;
    const y = height - ((value - min) / span) * (height - 16) - 8;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(" ");
}

export default function ExerciseDetail({ exerciseId }: { exerciseId: string }) {
  const [history, setHistory] = useState<WorkoutHistoryItem[]>([]);
  useEffect(() => setHistory(safeArray<WorkoutHistoryItem>(localStorage.getItem(HISTORY_KEY))), []);
  const summary = useMemo(() => summarizeExercise(history, exerciseId), [history, exerciseId]);
  const definition = getExerciseDefinition(exerciseId);
  const name = summary?.name ?? definition?.name ?? exerciseId;
  const e1rmValues = summary?.sessions.map((session) => session.bestE1rm) ?? [];
  const volumeValues = summary?.sessions.map((session) => session.volume) ?? [];

  const go = (href: string) => { window.location.href = href; };

  return (
    <PageShell>
      <div className="ds-rise">
        <PageHeader
          eyebrow="Exercise detail"
          eyebrowVolt
          title={name}
          lede={`${summary?.muscle ?? definition?.muscle ?? "Exercise"} · ${summary?.sessionCount ?? 0} logged sessions`}
          action={
            <div className="ds-cluster">
              <Button variant="ghost" size="sm" onClick={() => go("/progress")}>← Progress</Button>
              <Button variant="ghost" size="sm" onClick={() => go("/gym")}>Gym</Button>
            </div>
          }
        />
      </div>

      {!summary ? (
        <Card className="ds-rise ds-rise--1">
          <EmptyState
            title="No history yet"
            body="Log this exercise in Gym Mode and this page will build its trend, records, and progression target."
          />
        </Card>
      ) : (
        <>
          <div className="ds-rise ds-rise--1">
            <StatGrid cols={4}>
              <Stat label="Best e1RM" value={<>{Math.round(summary.bestE1rm)}<small> lb</small></>} />
              <Stat label="Heaviest load" value={<>{summary.bestWeight}<small> lb</small></>} />
              <Stat label="Total sets" value={summary.totalSets} />
              <Stat label="Total volume" value={<>{Math.round(summary.totalVolume).toLocaleString()}<small> lb</small></>} />
            </StatGrid>
          </div>

          <Card glow className="ds-rise ds-rise--2">
            <div className="ds-cluster" style={{ justifyContent: "space-between", alignItems: "flex-start" }}>
              <div>
                <p className="ds-eyebrow">Next target</p>
                <h2 className="ds-section-title" style={{ fontSize: "1.3rem" }}>{summary.progression?.label}</h2>
              </div>
              {summary.progression?.target ? <Badge tone="volt">{summary.progression.target}</Badge> : null}
            </div>
            <p className="ds-muted" style={{ margin: "8px 0 0" }}>{summary.progression?.reason}</p>
            {summary.plateau && (
              <p className="ds-muted" style={{ margin: "10px 0 0", color: "var(--ds-amber)" }}>⚠ Possible plateau: e1RM has been nearly flat across the last three sessions.</p>
            )}
          </Card>

          <div className="ds-grid-2 ds-rise ds-rise--3">
            <Card>
              <SectionHeader eyebrow="Strength trend" title="Estimated 1RM" action={<span className="ds-muted" style={{ fontSize: "0.78rem" }}>{e1rmValues.length} sessions</span>} />
              <svg viewBox="0 0 360 90" role="img" aria-label="Estimated one rep max trend" width="100%" style={{ display: "block", color: "var(--ds-volt)", height: 90, marginTop: 12 }}>
                <polyline points={sparkPoints(e1rmValues)} fill="none" stroke="currentColor" strokeWidth={4} strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              <div className="ds-cluster" style={{ justifyContent: "space-between", marginTop: 8 }}>
                <span className="ds-muted ds-tnum">{Math.round(e1rmValues[0] ?? 0)} lb</span>
                <strong className="ds-tnum">{Math.round(e1rmValues.at(-1) ?? 0)} lb</strong>
              </div>
            </Card>
            <Card>
              <SectionHeader eyebrow="Work trend" title="Exercise volume" action={<span className="ds-muted" style={{ fontSize: "0.78rem" }}>Best {Math.round(summary.bestSessionVolume).toLocaleString()} lb</span>} />
              <svg viewBox="0 0 360 90" role="img" aria-label="Exercise volume trend" width="100%" style={{ display: "block", color: "var(--ds-volt)", height: 90, marginTop: 12 }}>
                <polyline points={sparkPoints(volumeValues)} fill="none" stroke="currentColor" strokeWidth={4} strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              <div className="ds-cluster" style={{ justifyContent: "space-between", marginTop: 8 }}>
                <span className="ds-muted ds-tnum">{Math.round(volumeValues[0] ?? 0).toLocaleString()} lb</span>
                <strong className="ds-tnum">{Math.round(volumeValues.at(-1) ?? 0).toLocaleString()} lb</strong>
              </div>
            </Card>
          </div>

          <Card className="ds-rise ds-rise--4">
            <SectionHeader eyebrow="History" title="Every session" action={<span className="ds-muted" style={{ fontSize: "0.78rem" }}>Newest first</span>} />
            <div className="ds-stack" style={{ marginTop: 12 }}>
              {[...summary.sessions].reverse().map((session) => (
                <ListRow
                  key={session.workoutId}
                  title={<strong>{formatShortDate(session.completedAt)}</strong>}
                  sub={
                    <>
                      <span>{session.workoutName}</span>
                      <span style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 6 }}>
                        {session.sets.map((set, index) => (
                          <Badge key={`${session.workoutId}-${index}`}>{set.weight} × {set.reps}{set.rir == null ? "" : ` @${set.rir}`}</Badge>
                        ))}
                      </span>
                    </>
                  }
                  trailing={
                    <span style={{ textAlign: "right" }}>
                      <b className="ds-tnum">{Math.round(session.bestE1rm)} lb e1RM</b>
                      <span className="ds-muted ds-tnum" style={{ display: "block", fontSize: "0.78rem" }}>{Math.round(session.volume).toLocaleString()} lb volume</span>
                    </span>
                  }
                />
              ))}
            </div>
          </Card>
        </>
      )}
    </PageShell>
  );
}
