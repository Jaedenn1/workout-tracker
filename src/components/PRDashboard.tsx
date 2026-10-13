"use client";

import { useEffect, useMemo, useState } from "react";
import { HISTORY_KEY, derivePersonalRecords, formatShortDate, longestTrainingStreak, safeArray, type PersonalRecord, type WorkoutHistoryItem } from "../lib/trainingIntelligence";
import { Card, Chip, ChipRow, EmptyState, ListRow, PageHeader, PageShell, SectionHeader, Stat, StatGrid } from "../ui";

type Filter = "all" | PersonalRecord["category"];

const CATEGORY_FILTERS = ["all", "e1RM", "weight", "reps", "exercise-volume", "workout-volume"] as Filter[];

export default function PRDashboard() {
  const [history, setHistory] = useState<WorkoutHistoryItem[]>([]);
  const [filter, setFilter] = useState<Filter>("all");
  useEffect(() => setHistory(safeArray<WorkoutHistoryItem>(localStorage.getItem(HISTORY_KEY))), []);
  const records = useMemo(() => derivePersonalRecords(history), [history]);
  const filtered = filter === "all" ? records : records.filter((record) => record.category === filter);
  const streak = longestTrainingStreak(history);
  const recentEvents = history.flatMap((workout) => (workout.prs ?? []).map((label) => ({ label, completedAt: workout.completedAt }))).slice(0, 12);
  const workoutVolume = records.find((record) => record.category === "workout-volume");

  return (
    <PageShell>
      <div className="ds-rise">
        <PageHeader
          eyebrow="PERSONAL RECORDS"
          eyebrowVolt
          title={<>PR <span className="ds-accent">Board</span></>}
          lede="Your best strength, rep and volume marks in one place."
          action={
            <div className="ds-cluster">
              <a className="ds-btn ds-btn--ghost ds-btn--sm" href="/progress">← Progress</a>
              <a className="ds-btn ds-btn--ghost ds-btn--sm" href="/gym">Gym</a>
            </div>
          }
        />
      </div>

      <div className="ds-rise ds-rise--1">
        <StatGrid cols={4}>
          <Stat label="Training streak" value={streak} sub="days" />
          <Stat label="Tracked records" value={records.length} />
          <Stat label="Recent PR events" value={recentEvents.length} />
          <Stat label="Best workout volume" value={workoutVolume?.value ?? "—"} tone="amber" />
        </StatGrid>
      </div>

      <Card className="ds-rise ds-rise--2">
        <div className="ds-stack">
          <ChipRow>
            {CATEGORY_FILTERS.map((item) => (
              <Chip key={item} selected={filter === item} onClick={() => setFilter(item)}>
                {item === "all" ? "All" : item.replace("-", " ")}
              </Chip>
            ))}
          </ChipRow>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))", gap: "var(--ds-space-3)" }}>
            {filtered.map((record) => record.exerciseId ? (
              <a key={record.key} className="ds-card ds-card--tight ds-card--pressable" style={{ display: "block", textDecoration: "none", color: "inherit" }} href={`/exercise/${encodeURIComponent(record.exerciseId)}`}>
                <div className="ds-stat__label">{record.label}</div>
                <div className="ds-stat__value ds-stat__value--amber">{record.value}</div>
                <div className="ds-stat__sub" style={{ color: "var(--ds-text-1)", fontWeight: 700 }}>{record.exerciseName}</div>
                <div className="ds-stat__sub">{formatShortDate(record.completedAt)} →</div>
              </a>
            ) : (
              <div key={record.key} className="ds-card ds-card--tight">
                <div className="ds-stat__label">{record.label}</div>
                <div className="ds-stat__value ds-stat__value--amber">{record.value}</div>
                <div className="ds-stat__sub" style={{ color: "var(--ds-text-1)", fontWeight: 700 }}>All workouts</div>
                <div className="ds-stat__sub">{formatShortDate(record.completedAt)}</div>
              </div>
            ))}
          </div>
          {!records.length && <EmptyState title="No PRs yet" body="PRs will populate automatically after completed workouts." />}
        </div>
      </Card>

      <Card className="ds-rise ds-rise--3">
        <div className="ds-stack">
          <SectionHeader eyebrow="RECENT" title="Record moments" />
          <div className="ds-stack">
            {recentEvents.map((event, index) => (
              <ListRow
                key={`${event.completedAt}-${index}`}
                icon={<span style={{ fontSize: "1.25rem" }}>🏆</span>}
                title={event.label}
                sub={formatShortDate(event.completedAt)}
              />
            ))}
            {!recentEvents.length && <EmptyState title="No record moments yet" body="When the logger detects a new e1RM, it will appear here." />}
          </div>
        </div>
      </Card>
    </PageShell>
  );
}
