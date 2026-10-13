"use client";

import { useEffect, useMemo, useState } from "react";
import { kindLabel, pacePerKm, saveHybridSession, type HybridSessionKind } from "../lib/hybridSessions";
import { WEEKLY_PLAN_KEY, defaultWeeklyPlan, normalizeWeeklyPlan, todayPlanIndex } from "../lib/weeklyPlan";
import {
  Button,
  Card,
  Field,
  PageHeader,
  PageShell,
  SectionHeader,
  SegmentedControl,
  TextAreaInput,
  TextInput,
} from "../ui";

function validKind(value: string | null): HybridSessionKind {
  return value === "run" || value === "conditioning" || value === "pool" || value === "recovery" ? value : "run";
}

const KIND_OPTIONS = (["run", "conditioning", "pool", "recovery"] as HybridSessionKind[]).map((item) => ({
  value: item,
  label: kindLabel(item),
}));

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
  const [sessionId] = useState(() => {
    const token = typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
      ? crypto.randomUUID()
      : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
    return `hybrid-${token}`;
  });

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
      id: sessionId,
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
    setStatus("Session saved to Hybrid History. Saving again updates this session instead of duplicating it.");
  }

  return (
    <PageShell>
      <div className="ds-rise">
        <PageHeader
          eyebrow="Hybrid session · V1.6"
          title="Track Session"
          lede="Log cardio, conditioning, pool work, and recovery without forcing it into lifting data."
          action={<a className="ds-btn ds-btn--secondary ds-btn--sm" href="/plan">Weekly plan</a>}
        />
      </div>

      <Card tight className="ds-rise ds-rise--1">
        <div className="ds-field__label" style={{ marginBottom: 8 }}>Session type</div>
        <SegmentedControl<HybridSessionKind>
          label="Session type"
          options={KIND_OPTIONS}
          value={kind}
          onChange={changeKind}
        />
      </Card>

      <Card className="ds-rise ds-rise--2">
        <div className="ds-stack">
          <SectionHeader eyebrow="Details" title="Session details" />
          <Field label="Session name">
            <TextInput value={title} onChange={(event) => setTitle(event.target.value)} />
          </Field>
          <div className="ds-grid-2">
            <Field label="Duration" suffix="min">
              <TextInput type="number" inputMode="numeric" min={1} value={durationMinutes} onChange={(event) => setDurationMinutes(Number(event.target.value))} />
            </Field>
            {kind === "run" && (
              <Field label="Distance" suffix="km">
                <TextInput type="number" inputMode="decimal" min={0} step={0.1} value={distanceKm ?? ""} onChange={(event) => setDistanceKm(event.target.value === "" ? null : Number(event.target.value))} />
              </Field>
            )}
            {kind === "conditioning" && (
              <Field label="Vertical / climb" suffix="ft">
                <TextInput type="number" inputMode="numeric" min={0} value={elevationFeet ?? ""} onChange={(event) => setElevationFeet(event.target.value === "" ? null : Number(event.target.value))} />
              </Field>
            )}
            {kind === "pool" && (
              <Field label="Laps">
                <TextInput type="number" inputMode="numeric" min={0} value={laps ?? ""} onChange={(event) => setLaps(event.target.value === "" ? null : Number(event.target.value))} />
              </Field>
            )}
            {kind === "run" && (
              <div className="ds-stat">
                <div className="ds-stat__label">Average pace</div>
                <div className="ds-stat__value ds-tnum">{pace ?? "—"}</div>
              </div>
            )}
          </div>
          <div>
            <div className="ds-field__label" style={{ marginBottom: 6 }}>Effort · RPE {effort}/10</div>
            <input
              type="range"
              min={1}
              max={10}
              value={effort}
              onChange={(event) => setEffort(Number(event.target.value))}
              style={{ width: "100%" }}
              aria-label={`Effort, RPE ${effort} of 10`}
            />
          </div>
          <Field label="Notes">
            <TextAreaInput rows={4} value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="How it felt, intervals, recovery work, anything worth remembering…" />
          </Field>
        </div>
      </Card>

      <div className="ds-grid-2 ds-rise ds-rise--3">
        <Button variant="primary" size="lg" block onClick={finish}>Complete session</Button>
        <a className="ds-btn ds-btn--secondary ds-btn--lg ds-btn--block" href="/history">View history</a>
      </div>
      {status && <Card tight className="ds-rise" role="status"><p className="ds-muted" style={{ margin: 0 }}>{status}</p></Card>}
    </PageShell>
  );
}
