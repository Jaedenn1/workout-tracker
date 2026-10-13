"use client";

import { useEffect, useMemo, useState } from "react";
import { defaultRoutines, type RoutineDefinition } from "../data/training";
import { WEEKLY_PLAN_KEY, defaultWeeklyPlan, normalizeWeeklyPlan, todayPlanIndex, trainingKinds, type TrainingKind, type WeeklyPlanDay } from "../lib/weeklyPlan";
import {
  Badge,
  Button,
  Card,
  Field,
  PageHeader,
  PageShell,
  SelectInput,
  Stat,
  StatGrid,
  Stepper,
  TextInput,
} from "../ui";

const ROUTINES_KEY = "workout-tracker:v0.4:routines";
const ACTIVE_ROUTINE_KEY = "workout-tracker:v0.4:active-routine";

function kindIcon(kind: TrainingKind) {
  if (kind === "lift") return "🏋️";
  if (kind === "run") return "🏃";
  if (kind === "conditioning") return "⚡";
  if (kind === "pool") return "🏊";
  if (kind === "recovery") return "♨️";
  return "○";
}

function sessionHref(item: WeeklyPlanDay) {
  if (item.kind === "rest") return null;
  const routine = item.routineId ? `&routine=${encodeURIComponent(item.routineId)}` : "";
  return `/live?kind=${encodeURIComponent(item.kind)}&title=${encodeURIComponent(item.title)}${routine}`;
}

function readRoutines() {
  try {
    const parsed = JSON.parse(localStorage.getItem(ROUTINES_KEY) ?? "null");
    return Array.isArray(parsed) && parsed.length ? parsed as RoutineDefinition[] : defaultRoutines;
  } catch { return defaultRoutines; }
}

export default function WeeklyPlan() {
  const [plan, setPlan] = useState<WeeklyPlanDay[]>(defaultWeeklyPlan);
  const [routines, setRoutines] = useState<RoutineDefinition[]>(defaultRoutines);
  const [hydrated, setHydrated] = useState(false);
  const today = todayPlanIndex();

  useEffect(() => {
    try { setPlan(normalizeWeeklyPlan(JSON.parse(localStorage.getItem(WEEKLY_PLAN_KEY) ?? "null"))); }
    catch { setPlan(defaultWeeklyPlan); }
    setRoutines(readRoutines());
    setHydrated(true);
  }, []);

  function save(next: WeeklyPlanDay[]) {
    setPlan(next);
    localStorage.setItem(WEEKLY_PLAN_KEY, JSON.stringify(next));
    window.dispatchEvent(new CustomEvent("workout-tracker:weekly-plan"));
  }

  function update(index: number, patch: Partial<WeeklyPlanDay>) {
    save(plan.map((item, itemIndex) => (itemIndex === index ? { ...item, ...patch } : item)));
  }

  function reset() { save(defaultWeeklyPlan); }

  const counts = useMemo(() => plan.reduce<Record<TrainingKind, number>>((acc, item) => ({ ...acc, [item.kind]: acc[item.kind] + 1 }), { lift: 0, run: 0, conditioning: 0, pool: 0, recovery: 0, rest: 0 }), [plan]);

  const go = (href: string) => { window.location.href = href; };

  return (
    <PageShell>
      <div className="ds-rise">
        <PageHeader
          eyebrow="WEEKLY PLAN · V1.9.1"
          eyebrowVolt
          title={<>Hybrid <span className="ds-accent">Week</span></>}
          lede="Give each session a target dose. The coach compares the plan against what you actually complete."
          action={
            <div className="ds-cluster">
              <Button variant="ghost" size="sm" onClick={() => go("/live")}>Live Training OS</Button>
              <Button variant="ghost" size="sm" onClick={() => go("/coach")}>Adaptive coach</Button>
              <Button variant="ghost" size="sm" onClick={() => go("/")}>Today</Button>
            </div>
          }
        />
      </div>

      <div className="ds-rise ds-rise--1">
        <StatGrid cols={4}>
          <Stat label="Lift" value={counts.lift} />
          <Stat label="Run" value={counts.run} />
          <Stat label="Conditioning" value={counts.conditioning} />
          <Stat label="Recovery" value={counts.pool + counts.recovery + counts.rest} />
        </StatGrid>
      </div>

      <div className="ds-rise" aria-busy={!hydrated}>
        <div className="ds-stack">
          {plan.map((item, index) => {
            const href = sessionHref(item);
            const routine = routines.find((value) => value.id === item.routineId);
            const isToday = index === today;
            return (
              <Card key={item.day}>
                <div className="ds-stack">
                  <div className="ds-cluster" style={{ justifyContent: "space-between" }}>
                    <div className="ds-cluster">
                      <span aria-hidden="true" style={{ fontSize: "1.5rem" }}>{kindIcon(item.kind)}</span>
                      <div>
                        <div className="ds-row__title">{isToday ? "Today" : item.day}</div>
                        <div className="ds-row__sub">{item.shortDay}</div>
                      </div>
                    </div>
                    {isToday && <Badge tone="volt" dot>Today</Badge>}
                  </div>

                  <Field label="Session type">
                    <SelectInput value={item.kind} onChange={(event) => update(index, { kind: event.target.value as TrainingKind, routineId: event.target.value === "lift" ? item.routineId ?? null : null })}>
                      {trainingKinds.map((kind) => <option key={kind.value} value={kind.value}>{kind.label}</option>)}
                    </SelectInput>
                  </Field>

                  <Field label="Session">
                    <TextInput value={item.title} onChange={(event) => update(index, { title: event.target.value })} placeholder="Session name" />
                  </Field>

                  <Field label="Goal">
                    <TextInput value={item.detail} onChange={(event) => update(index, { detail: event.target.value })} placeholder="Short goal or focus" />
                  </Field>

                  {item.kind === "lift" && (
                    <Field label="Planned routine">
                      <SelectInput value={item.routineId ?? ""} onChange={(event) => update(index, { routineId: event.target.value || null })}>
                        <option value="">Any lifting routine</option>
                        {routines.map((value) => <option key={value.id} value={value.id}>{value.name}</option>)}
                      </SelectInput>
                    </Field>
                  )}

                  {item.kind !== "rest" && (
                    <div className="ds-grid-2">
                      <Stepper
                        label="Target minutes"
                        unit="min"
                        value={String(item.targetDurationMinutes ?? 45)}
                        editable
                        inputProps={{
                          type: "number",
                          inputMode: "numeric",
                          min: 5,
                          max: 300,
                          step: 5,
                          onChange: (event) => update(index, { targetDurationMinutes: Math.max(5, Math.min(300, Number(event.target.value) || 45)) }),
                        }}
                        onDecrement={() => update(index, { targetDurationMinutes: Math.max(5, Math.min(300, (item.targetDurationMinutes ?? 45) - 5)) })}
                        onIncrement={() => update(index, { targetDurationMinutes: Math.max(5, Math.min(300, (item.targetDurationMinutes ?? 45) + 5)) })}
                        decrementLabel="Decrease target minutes"
                        incrementLabel="Increase target minutes"
                      />
                      <Stepper
                        label="Target RPE"
                        unit="RPE"
                        value={String(item.targetRpe ?? 7)}
                        editable
                        inputProps={{
                          type: "number",
                          inputMode: "decimal",
                          min: 1,
                          max: 10,
                          step: 0.5,
                          onChange: (event) => update(index, { targetRpe: Math.max(1, Math.min(10, Number(event.target.value) || 7)) }),
                        }}
                        onDecrement={() => update(index, { targetRpe: Math.max(1, Math.min(10, (item.targetRpe ?? 7) - 0.5)) })}
                        onIncrement={() => update(index, { targetRpe: Math.max(1, Math.min(10, (item.targetRpe ?? 7) + 0.5)) })}
                        decrementLabel="Decrease target RPE"
                        incrementLabel="Increase target RPE"
                      />
                    </div>
                  )}

                  {href && (
                    <Button
                      variant={isToday ? "primary" : "secondary"}
                      block
                      onClick={() => { if (item.kind === "lift" && item.routineId) localStorage.setItem(ACTIVE_ROUTINE_KEY, item.routineId); go(href); }}
                    >
                      {item.kind === "lift" ? `Run ${routine?.name ?? "lifting session"} live` : "Run this session live"} →
                    </Button>
                  )}
                  {item.kind === "rest" && <span className="ds-muted">Recovery day · no logger needed</span>}
                </div>
              </Card>
            );
          })}
        </div>
      </div>

      <div className="ds-rise">
        <div className="ds-cluster" style={{ justifyContent: "space-between" }}>
          <Button variant="ghost" type="button" onClick={reset}>Reset starter week</Button>
          <div className="ds-cluster">
            <Button variant="ghost" size="sm" onClick={() => go("/coach")}>Weekly intelligence →</Button>
            <Button variant="ghost" size="sm" onClick={() => go("/history")}>All training history →</Button>
          </div>
        </div>
      </div>
    </PageShell>
  );
}
