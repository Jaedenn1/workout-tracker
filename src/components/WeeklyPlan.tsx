"use client";

import { useEffect, useMemo, useState } from "react";
import {
  WEEKLY_PLAN_KEY,
  defaultWeeklyPlan,
  normalizeWeeklyPlan,
  todayPlanIndex,
  trainingKinds,
  type TrainingKind,
  type WeeklyPlanDay,
} from "../lib/weeklyPlan";

function kindIcon(kind: TrainingKind) {
  if (kind === "lift") return "🏋️";
  if (kind === "run") return "🏃";
  if (kind === "conditioning") return "⚡";
  if (kind === "pool") return "🏊";
  if (kind === "recovery") return "♨️";
  return "○";
}

export default function WeeklyPlan() {
  const [plan, setPlan] = useState<WeeklyPlanDay[]>(defaultWeeklyPlan);
  const [hydrated, setHydrated] = useState(false);
  const today = todayPlanIndex();

  useEffect(() => {
    try {
      const parsed = JSON.parse(localStorage.getItem(WEEKLY_PLAN_KEY) ?? "null");
      setPlan(normalizeWeeklyPlan(parsed));
    } catch {
      setPlan(defaultWeeklyPlan);
    }
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

  function reset() {
    save(defaultWeeklyPlan);
  }

  const counts = useMemo(() => {
    return plan.reduce<Record<TrainingKind, number>>(
      (acc, item) => ({ ...acc, [item.kind]: acc[item.kind] + 1 }),
      { lift: 0, run: 0, conditioning: 0, pool: 0, recovery: 0, rest: 0 },
    );
  }, [plan]);

  return (
    <main className="wp-shell">
      <header className="wp-topbar">
        <div>
          <p className="ti-eyebrow">WEEKLY PLAN · V1.5</p>
          <h1>Hybrid Week</h1>
          <p>Build the week once, then open the app and know exactly what today is for.</p>
        </div>
        <a className="ti-secondary" href="/">Today</a>
      </header>

      <section className="wp-summary">
        <div><span>Lift</span><strong>{counts.lift}</strong></div>
        <div><span>Run</span><strong>{counts.run}</strong></div>
        <div><span>Conditioning</span><strong>{counts.conditioning}</strong></div>
        <div><span>Recovery</span><strong>{counts.pool + counts.recovery + counts.rest}</strong></div>
      </section>

      <section className="wp-list" aria-busy={!hydrated}>
        {plan.map((item, index) => (
          <article className={`wp-day ${index === today ? "is-today" : ""}`} key={item.day}>
            <div className="wp-day-head">
              <div className="wp-day-label">
                <span>{item.shortDay}</span>
                <strong>{index === today ? "Today" : item.day}</strong>
              </div>
              <span className="wp-kind-icon" aria-hidden="true">{kindIcon(item.kind)}</span>
            </div>

            <label className="wp-field">
              <span>Session type</span>
              <select value={item.kind} onChange={(event) => update(index, { kind: event.target.value as TrainingKind })}>
                {trainingKinds.map((kind) => <option key={kind.value} value={kind.value}>{kind.label}</option>)}
              </select>
            </label>

            <label className="wp-field">
              <span>Session</span>
              <input value={item.title} onChange={(event) => update(index, { title: event.target.value })} placeholder="Session name" />
            </label>

            <label className="wp-field">
              <span>Goal</span>
              <input value={item.detail} onChange={(event) => update(index, { detail: event.target.value })} placeholder="Short goal or focus" />
            </label>

            {item.kind === "lift" && <a className="wp-action" href="/gym">Open gym logger →</a>}
          </article>
        ))}
      </section>

      <footer className="wp-footer">
        <button type="button" onClick={reset}>Reset starter week</button>
        <a href="/progress">Training intelligence →</a>
      </footer>
    </main>
  );
}
