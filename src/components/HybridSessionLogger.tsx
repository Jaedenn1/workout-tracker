"use client";

import { useEffect, useMemo, useState } from "react";
import { kindLabel, pacePerKm, saveHybridSession, type HybridSessionKind } from "../lib/hybridSessions";
import { WEEKLY_PLAN_KEY, defaultWeeklyPlan, normalizeWeeklyPlan, todayPlanIndex } from "../lib/weeklyPlan";

function validKind(value: string | null): HybridSessionKind {
  return value === "run" || value === "conditioning" || value === "pool" || value === "recovery" ? value : "run";
}

export default function HybridSessionLogger() {
  const [kind, setKind] = useState<HybridSessionKind>("run");
  const [title, setTitle] = useState("Run");
  const [durationMinutes, setDurationMinutes] = useState(30);
  const [distanceKm, setDistanceKm] = useState<number | null>(5);
  const [elevationFeet, setElevationFeet] = useState<number | null>(null);
  const [laps, setLaps] = useState<number | null>(null);
  const [effort, setEffort] = useState(5);
  const [notes, setNotes] = useState("");
  const [status, setStatus] = useState("");

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const queryKind = validKind(params.get("kind"));
    let plan = defaultWeeklyPlan;
    try { plan = normalizeWeeklyPlan(JSON.parse(localStorage.getItem(WEEKLY_PLAN_KEY) ?? "null")); } catch { plan = defaultWeeklyPlan; }
    const todayPlan = plan[todayPlanIndex()];
    const chosen = params.has("kind") ? queryKind : validKind(todayPlan.kind);
    setKind(chosen);
    setTitle(params.get("title")?.trim() || (todayPlan.kind === chosen ? todayPlan.title : kindLabel(chosen)));
    if (chosen !== "run") setDistanceKm(null);
  }, []);

  const pace = useMemo(() => pacePerKm(distanceKm, durationMinutes), [distanceKm, durationMinutes]);

  function changeKind(next: HybridSessionKind) {
    setKind(next);
    setTitle(kindLabel(next));
    if (next === "run" && distanceKm == null) setDistanceKm(5);
    if (next !== "run") setDistanceKm(null);
  }

  function finish() {
    if (!title.trim() || durationMinutes <= 0) {
      setStatus("Add a session name and duration before saving.");
      return;
    }
    saveHybridSession({
      id: `hybrid-${Date.now()}`,
      kind,
      title: title.trim(),
      completedAt: new Date().toISOString(),
      durationMinutes: Math.max(1, Math.round(durationMinutes)),
      effort: Math.min(10, Math.max(1, Math.round(effort))),
      notes: notes.trim(),
      distanceKm: kind === "run" ? distanceKm : null,
      elevationFeet: kind === "conditioning" ? elevationFeet : null,
      laps: kind === "pool" ? laps : null,
    });
    setStatus("Session saved to Hybrid History.");
  }

  return (
    <main className="hs-shell">
      <header className="hs-topbar">
        <div><p className="ti-eyebrow">HYBRID SESSION · V1.6</p><h1>Track Session</h1><p>Log cardio, conditioning, pool work, and recovery without forcing it into lifting data.</p></div>
        <a className="ti-secondary" href="/plan">Weekly plan</a>
      </header>

      <section className="hs-card hs-type-grid">
        {(["run", "conditioning", "pool", "recovery"] as HybridSessionKind[]).map((item) => (
          <button key={item} className={kind === item ? "active" : ""} onClick={() => changeKind(item)}>{kindLabel(item)}</button>
        ))}
      </section>

      <section className="hs-card hs-form">
        <label><span>Session name</span><input value={title} onChange={(event) => setTitle(event.target.value)} /></label>
        <label><span>Duration</span><div className="hs-number"><input type="number" inputMode="numeric" min="1" value={durationMinutes} onChange={(event) => setDurationMinutes(Number(event.target.value))}/><small>min</small></div></label>

        {kind === "run" && <>
          <label><span>Distance</span><div className="hs-number"><input type="number" inputMode="decimal" min="0" step="0.1" value={distanceKm ?? ""} onChange={(event) => setDistanceKm(event.target.value === "" ? null : Number(event.target.value))}/><small>km</small></div></label>
          <div className="hs-metric"><span>Average pace</span><strong>{pace ?? "—"}</strong></div>
        </>}

        {kind === "conditioning" && <label><span>Vertical / climb</span><div className="hs-number"><input type="number" inputMode="numeric" min="0" value={elevationFeet ?? ""} onChange={(event) => setElevationFeet(event.target.value === "" ? null : Number(event.target.value))}/><small>ft</small></div></label>}
        {kind === "pool" && <label><span>Laps</span><input type="number" inputMode="numeric" min="0" value={laps ?? ""} onChange={(event) => setLaps(event.target.value === "" ? null : Number(event.target.value))}/></label>}

        <label><span>Effort · RPE {effort}/10</span><input type="range" min="1" max="10" value={effort} onChange={(event) => setEffort(Number(event.target.value))}/></label>
        <label className="hs-wide"><span>Notes</span><textarea rows={4} value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="How it felt, intervals, recovery work, anything worth remembering…"/></label>
      </section>

      <div className="hs-actions"><button className="ti-primary" onClick={finish}>Complete session</button><a className="ti-secondary" href="/history">View history</a></div>
      {status && <div className="ti-status" role="status">{status}</div>}
    </main>
  );
}
