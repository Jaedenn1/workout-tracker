"use client";

import { useEffect, useMemo, useState } from "react";
import { createSafetySnapshot } from "../lib/database";
import { HYBRID_HISTORY_KEY, kindLabel, pacePerKm, readHybridSessions, type HybridSession, type HybridSessionKind } from "../lib/hybridSessions";
import { Badge, Button, Card, Chip, ChipRow, EmptyState, PageHeader, Stat, StatGrid } from "../ui";

const KIND_FILTERS = ["all", "run", "conditioning", "pool", "recovery"] as const;

function formatDate(value: string) {
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

export default function HybridHistory() {
  const [sessions, setSessions] = useState<HybridSession[]>([]);
  const [filter, setFilter] = useState<"all" | HybridSessionKind>("all");
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const refresh = () => setSessions(readHybridSessions());
    refresh();
    window.addEventListener("workout-tracker:hybrid-session", refresh);
    return () => window.removeEventListener("workout-tracker:hybrid-session", refresh);
  }, []);

  const filtered = useMemo(() => filter === "all" ? sessions : sessions.filter((item) => item.kind === filter), [sessions, filter]);
  const totalMinutes = filtered.reduce((sum, item) => sum + Number(item.durationMinutes || 0), 0);
  const runKm = filtered.filter((item) => item.kind === "run").reduce((sum, item) => sum + Number(item.distanceKm || 0), 0);

  async function clearAll() {
    if (!window.confirm("Clear all hybrid session history? A safety snapshot will be created first. Lifting history will not be touched.")) return;
    setBusy(true);
    try {
      await createSafetySnapshot("Before clearing hybrid session history");
      localStorage.removeItem(HYBRID_HISTORY_KEY);
      setSessions([]);
      setStatus("Hybrid history cleared. A safety snapshot was created first.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Could not clear hybrid history safely.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="ds-stack">
      <div className="ds-rise">
        <PageHeader
          eyebrow="HYBRID HISTORY · V1.9.1"
          eyebrowVolt
          title={<>Cardio &amp; <span className="ds-accent">recovery</span> sessions</>}
          lede="Runs, conditioning, pool, and recovery live here beside your lifting journal."
          action={<a className="ds-btn ds-btn--ghost ds-btn--sm" href="/session">Log session</a>}
        />
      </div>

      <Card className="ds-rise ds-rise--1">
        <StatGrid cols={3}>
          <Stat label="Sessions" value={filtered.length} />
          <Stat label="Time" value={totalMinutes} sub="min" />
          <Stat label="Running" value={runKm.toFixed(1)} sub="km" />
        </StatGrid>
      </Card>

      <div className="ds-rise ds-rise--2">
        <ChipRow>
          {KIND_FILTERS.map((item) => (
            <Chip key={item} selected={filter === item} onClick={() => setFilter(item)}>
              {item === "all" ? "All" : kindLabel(item)}
            </Chip>
          ))}
        </ChipRow>
      </div>

      {status ? <p className="ds-muted ds-rise" role="status" style={{ margin: 0 }}>{status}</p> : null}

      <div className="ds-rise ds-rise--3">
        <div className="ds-stack">
          {filtered.map((item) => {
            const pace = item.kind === "run" ? pacePerKm(item.distanceKm, item.durationMinutes) : null;
            return (
              <Card tight key={item.id}>
                <div className="ds-stack">
                  <div className="ds-cluster" style={{ justifyContent: "space-between" }}>
                    <Badge tone="volt" dot>{kindLabel(item.kind)}</Badge>
                    <span className="ds-muted" style={{ fontSize: "0.78rem" }}>{formatDate(item.completedAt)}</span>
                  </div>
                  <strong style={{ fontSize: "1.05rem", letterSpacing: "-0.01em" }}>{item.title}</strong>
                  <div className="ds-cluster">
                    <strong>{item.durationMinutes} min</strong>
                    {item.distanceKm ? <span className="ds-muted">{item.distanceKm.toFixed(1)} km{pace ? ` · ${pace}` : ""}</span> : null}
                    {item.elevationFeet ? <span className="ds-muted">{Math.round(item.elevationFeet)} ft</span> : null}
                    {item.laps ? <span className="ds-muted">{item.laps} laps</span> : null}
                    {item.poolMeters ? <span className="ds-muted">{Math.round(item.poolMeters)} m</span> : null}
                    {item.rounds ? <span className="ds-muted">{Math.round(item.rounds)} rounds</span> : null}
                    <span className="ds-muted">RPE {item.effort}/10</span>
                  </div>
                  {item.notes ? <p className="ds-muted" style={{ margin: 0 }}>{item.notes}</p> : null}
                </div>
              </Card>
            );
          })}
          {!filtered.length && <EmptyState title="No hybrid sessions logged yet." />}
        </div>
      </div>

      {sessions.length > 0 && (
        <div className="ds-rise ds-rise--4">
          <Button variant="danger" block disabled={busy} onClick={() => void clearAll()}>
            {busy ? "Creating snapshot…" : "Clear hybrid history"}
          </Button>
        </div>
      )}
    </div>
  );
}
