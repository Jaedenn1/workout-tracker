"use client";

import { useEffect, useMemo, useState } from "react";
import { HYBRID_HISTORY_KEY, kindLabel, pacePerKm, readHybridSessions, type HybridSession, type HybridSessionKind } from "../lib/hybridSessions";

function formatDate(value: string) {
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

export default function HybridHistory() {
  const [sessions, setSessions] = useState<HybridSession[]>([]);
  const [filter, setFilter] = useState<"all" | HybridSessionKind>("all");

  useEffect(() => {
    const refresh = () => setSessions(readHybridSessions());
    refresh();
    window.addEventListener("workout-tracker:hybrid-session", refresh);
    return () => window.removeEventListener("workout-tracker:hybrid-session", refresh);
  }, []);

  const filtered = useMemo(() => filter === "all" ? sessions : sessions.filter((item) => item.kind === filter), [sessions, filter]);
  const totalMinutes = filtered.reduce((sum, item) => sum + Number(item.durationMinutes || 0), 0);
  const runKm = filtered.filter((item) => item.kind === "run").reduce((sum, item) => sum + Number(item.distanceKm || 0), 0);

  function clearAll() {
    if (!window.confirm("Clear all hybrid session history? Lifting history will not be touched.")) return;
    localStorage.removeItem(HYBRID_HISTORY_KEY);
    setSessions([]);
  }

  return (
    <section className="hh-shell">
      <div className="ti-section-head"><div><p className="ti-eyebrow">HYBRID HISTORY · V1.6</p><h2>Cardio & recovery sessions</h2><span>Runs, conditioning, pool, and recovery live here beside your lifting journal.</span></div><a className="ti-secondary" href="/session">Log session</a></div>
      <div className="hh-summary"><div><span>Sessions</span><strong>{filtered.length}</strong></div><div><span>Time</span><strong>{totalMinutes}<small> min</small></strong></div><div><span>Running</span><strong>{runKm.toFixed(1)}<small> km</small></strong></div></div>
      <div className="hh-filters">
        {(["all", "run", "conditioning", "pool", "recovery"] as const).map((item) => <button key={item} className={filter === item ? "active" : ""} onClick={() => setFilter(item)}>{item === "all" ? "All" : kindLabel(item)}</button>)}
      </div>
      <div className="hh-list">
        {filtered.map((item) => {
          const pace = item.kind === "run" ? pacePerKm(item.distanceKm, item.durationMinutes) : null;
          return <article key={item.id} className="hh-item"><div><span>{kindLabel(item.kind)}</span><strong>{item.title}</strong><small>{formatDate(item.completedAt)}</small></div><div className="hh-metrics"><strong>{item.durationMinutes} min</strong>{item.distanceKm ? <span>{item.distanceKm.toFixed(1)} km{pace ? ` · ${pace}` : ""}</span> : null}{item.elevationFeet ? <span>{Math.round(item.elevationFeet)} ft</span> : null}{item.laps ? <span>{item.laps} laps</span> : null}<span>RPE {item.effort}/10</span></div>{item.notes && <p>{item.notes}</p>}</article>;
        })}
        {!filtered.length && <p className="ti-empty">No hybrid sessions logged yet.</p>}
      </div>
      {sessions.length > 0 && <button className="hh-clear" onClick={clearAll}>Clear hybrid history</button>}
    </section>
  );
}
