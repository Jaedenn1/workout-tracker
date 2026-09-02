"use client";

import { useEffect, useMemo, useState } from "react";
import { defaultRoutines, type RoutineDefinition } from "../data/training";
import { WEEKLY_PLAN_KEY, defaultWeeklyPlan, normalizeWeeklyPlan, todayPlanIndex, trainingKinds, type TrainingKind, type WeeklyPlanDay } from "../lib/weeklyPlan";

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

  return (
    <main className="wp-shell">
      <header className="wp-topbar">
        <div><p className="ti-eyebrow">WEEKLY PLAN · V1.9.1</p><h1>Hybrid Week</h1><p>Give each session a target dose. The coach compares the plan against what you actually complete.</p></div>
        <div className="ac-top-actions"><a className="ti-secondary" href="/live">Live Training OS</a><a className="ti-secondary" href="/coach">Adaptive coach</a><a className="ti-secondary" href="/">Today</a></div>
      </header>

      <section className="wp-summary">
        <div><span>Lift</span><strong>{counts.lift}</strong></div><div><span>Run</span><strong>{counts.run}</strong></div><div><span>Conditioning</span><strong>{counts.conditioning}</strong></div><div><span>Recovery</span><strong>{counts.pool + counts.recovery + counts.rest}</strong></div>
      </section>

      <section className="wp-list" aria-busy={!hydrated}>
        {plan.map((item, index) => {
          const href = sessionHref(item);
          const routine = routines.find((value) => value.id === item.routineId);
          return <article className={`wp-day ${index === today ? "is-today" : ""}`} key={item.day}>
            <div className="wp-day-head"><div className="wp-day-label"><span>{item.shortDay}</span><strong>{index === today ? "Today" : item.day}</strong></div><span className="wp-kind-icon" aria-hidden="true">{kindIcon(item.kind)}</span></div>
            <label className="wp-field"><span>Session type</span><select value={item.kind} onChange={(event) => update(index, { kind: event.target.value as TrainingKind, routineId: event.target.value === "lift" ? item.routineId ?? null : null })}>{trainingKinds.map((kind) => <option key={kind.value} value={kind.value}>{kind.label}</option>)}</select></label>
            <label className="wp-field"><span>Session</span><input value={item.title} onChange={(event) => update(index, { title: event.target.value })} placeholder="Session name" /></label>
            <label className="wp-field"><span>Goal</span><input value={item.detail} onChange={(event) => update(index, { detail: event.target.value })} placeholder="Short goal or focus" /></label>
            {item.kind === "lift" && <label className="wp-field"><span>Planned routine</span><select value={item.routineId ?? ""} onChange={(event) => update(index, { routineId: event.target.value || null })}><option value="">Any lifting routine</option>{routines.map((value) => <option key={value.id} value={value.id}>{value.name}</option>)}</select></label>}
            {item.kind !== "rest" && <div className="wp-target-grid">
              <label className="wp-field"><span>Target minutes</span><input type="number" inputMode="numeric" min="5" max="300" step="5" value={item.targetDurationMinutes ?? 45} onChange={(event) => update(index, { targetDurationMinutes: Math.max(5, Math.min(300, Number(event.target.value) || 45)) })} /></label>
              <label className="wp-field"><span>Target RPE</span><input type="number" inputMode="decimal" min="1" max="10" step="0.5" value={item.targetRpe ?? 7} onChange={(event) => update(index, { targetRpe: Math.max(1, Math.min(10, Number(event.target.value) || 7)) })} /></label>
            </div>}
            {href && <a className="wp-action" href={href} onClick={() => { if (item.kind === "lift" && item.routineId) localStorage.setItem(ACTIVE_ROUTINE_KEY, item.routineId); }}>{item.kind === "lift" ? `Run ${routine?.name ?? "lifting session"} live` : "Run this session live"} →</a>}
            {item.kind === "rest" && <span className="wp-rest-label">Recovery day · no logger needed</span>}
          </article>;
        })}
      </section>
      <footer className="wp-footer"><button type="button" onClick={reset}>Reset starter week</button><div className="ac-top-actions"><a href="/coach">Weekly intelligence →</a><a href="/history">All training history →</a></div></footer>
    </main>
  );
}
