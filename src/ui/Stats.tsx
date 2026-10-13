"use client";

import type { ReactNode } from "react";

export type StatTone = "default" | "volt" | "amber" | "mint" | "red" | "blue";

export interface StatProps {
  label: string;
  value: ReactNode;
  sub?: ReactNode;
  tone?: StatTone;
}

const TONE_CLASS: Record<StatTone, string> = {
  default: "",
  volt: "ds-stat__value--volt",
  amber: "ds-stat__value--amber",
  mint: "ds-stat__value--mint",
  red: "ds-stat__value--red",
  blue: "ds-stat__value--blue",
};

/** Single metric tile. Compose inside .ds-stat-grid (2/3/4 cols). */
export function Stat({ label, value, sub, tone = "default" }: StatProps) {
  return (
    <div className="ds-stat">
      <div className="ds-stat__label">{label}</div>
      <div className={`ds-stat__value ds-tnum ${TONE_CLASS[tone]}`.trim()}>{value}</div>
      {sub ? <div className="ds-stat__sub">{sub}</div> : null}
    </div>
  );
}

export function StatGrid({ cols = 2, children }: { cols?: 2 | 3 | 4; children: ReactNode }) {
  const mod = cols === 3 ? " ds-stat-grid--3" : cols === 4 ? " ds-stat-grid--4" : "";
  return <div className={`ds-stat-grid${mod}`}>{children}</div>;
}

export type BadgeTone = "neutral" | "volt" | "amber" | "red" | "mint" | "blue";

const BADGE_TONE: Record<BadgeTone, string> = {
  neutral: "",
  volt: "ds-badge--volt",
  amber: "ds-badge--amber",
  red: "ds-badge--red",
  mint: "ds-badge--mint",
  blue: "ds-badge--blue",
};

/** Status pill. Non-interactive. */
export function Badge({ tone = "neutral", dot = false, children }: { tone?: BadgeTone; dot?: boolean; children: ReactNode }) {
  return (
    <span className={`ds-badge ${BADGE_TONE[tone]}`.trim()}>
      {dot ? <span className="ds-badge__dot" /> : null}
      {children}
    </span>
  );
}

export interface ChipProps {
  selected?: boolean;
  onClick?: () => void;
  children: ReactNode;
}

/** Selectable filter chip. */
export function Chip({ selected = false, onClick, children }: ChipProps) {
  return (
    <button type="button" className={`ds-chip${selected ? " ds-chip--on" : ""}`} onClick={onClick} aria-pressed={selected}>
      {children}
    </button>
  );
}

export function ChipRow({ children }: { children: ReactNode }) {
  return <div className="ds-chip-row">{children}</div>;
}
