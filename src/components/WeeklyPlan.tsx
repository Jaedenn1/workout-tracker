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

function sessionHref(item: WeeklyPlanDay) {
  if (item.kind === "lift") return "/gym";
  if (item.kind === "rest") return null;
  return `/session?kind=${encodeURIComponent(item.kind)}&title=${encodeURIComponent(item.title)}`;
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
          <p className="ti-eyebrow">WEEKLY PLAN · V1.7</p>
          <h1>Hybrid Week</h1>
          <p>Plan the week, then launch the correct logger straight from each day.</p>
        </div>
        <div className="ac-top-actions"><a className="ti-secondary" href="/coach">Adaptive coach</a><a className="ti-secondary" href="/">Today</a></div>
      </header>

      <section className="wp-summary">
        <div><span>Lift</span><strong>{counts.lift}</strong></div>
        <div><span>Run</span><strong>{counts.run}</strong></div>
        <div><span>Conditioning</span><strong>{counts.conditioning}</strong></div>
        <div><span>Recovery</span><strong>{counts.pool + counts.recovery + counts.rest}</strong></div>
      </section>

      <section className="wp-list" aria-busy={!hydrated}>
        {plan.map((item, index) => {
          const href = sessionHref(item);
          return <article className={`wp-day ${index === today ? "is-today" : ""}`} key={item.day}>
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

            {href && <a className="wp-action" href={href}>{item.kind === "lift" ? "Open gym logger" : "Track this session"} →</a>}
            {item.kind === "rest" && <span className="wp-rest-label">Recovery day · no logger needed</span>}
          </article>;
        })}
      </section>

      <footer className="wp-footer">
        <button type="button" onClick={reset}>Reset starter week</button>
        <div className="ac-top-actions"><a href="/coach">Weekly intelligence →</a><a href="/history">All training history →</a></div>
      </footer>
    </main>
  );
}
