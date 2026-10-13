"use client";

import { useEffect, type ReactNode } from "react";
import { IconButton } from "./Button";

export function ProgressBar({ value, label }: { value: number; label?: string }) {
  const pct = Math.max(0, Math.min(1, value)) * 100;
  return (
    <div className="ds-progress" role="progressbar" aria-valuenow={Math.round(pct)} aria-valuemin={0} aria-valuemax={100} aria-label={label}>
      <div className="ds-progress__fill" style={{ width: `${pct}%` }} />
    </div>
  );
}

export interface EmptyStateProps {
  icon?: ReactNode;
  title: string;
  body?: ReactNode;
  action?: ReactNode;
}

export function EmptyState({ icon, title, body, action }: EmptyStateProps) {
  return (
    <div className="ds-empty">
      {icon ? <div className="ds-empty__icon">{icon}</div> : null}
      <h3 className="ds-empty__title">{title}</h3>
      {body ? <p className="ds-empty__body">{body}</p> : null}
      {action ? <div>{action}</div> : null}
    </div>
  );
}

export interface SheetProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode;
}

/** Bottom sheet with backdrop. Render conditionally on `open`. */
export function Sheet({ open, onClose, title, children }: SheetProps) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;
  return (
    <>
      <div className="ds-sheet-backdrop" onClick={onClose} aria-hidden="true" />
      <div className="ds-sheet" role="dialog" aria-modal="true" aria-label={title}>
        <div className="ds-sheet__grab" aria-hidden="true" />
        <div className="ds-sheet__head">
          {title ? <h2 className="ds-sheet__title">{title}</h2> : <span />}
          <IconButton label="Close" small onClick={onClose}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round">
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </IconButton>
        </div>
        {children}
      </div>
    </>
  );
}

export interface ListRowProps {
  icon?: ReactNode;
  title: ReactNode;
  sub?: ReactNode;
  trailing?: ReactNode;
  chevron?: boolean;
  danger?: boolean;
  onClick?: () => void;
  /** Renders a native link row. Takes precedence over onClick. */
  href?: string;
}

/** Tappable settings/history row. Omit onClick/href for a static row. */
export function ListRow({ icon, title, sub, trailing, chevron = false, danger = false, onClick, href }: ListRowProps) {
  const cls = `ds-row${danger ? " ds-row--danger" : ""}`;
  const inner = (
    <>
      {icon ? <span className="ds-row__icon">{icon}</span> : null}
      <span className="ds-row__body">
        <span className="ds-row__title">{title}</span>
        {sub ? <span className="ds-row__sub" style={{ display: "block" }}>{sub}</span> : null}
      </span>
      <span className="ds-row__trail">
        {trailing}
        {chevron ? (
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round">
            <path d="M9 6l6 6-6 6" />
          </svg>
        ) : null}
      </span>
    </>
  );
  if (href) {
    return (
      <a className={cls} href={href}>
        {inner}
      </a>
    );
  }
  if (onClick) {
    return (
      <button type="button" className={cls} onClick={onClick}>
        {inner}
      </button>
    );
  }
  return <div className={cls}>{inner}</div>;
}

export interface TimerFaceProps {
  digits: string;
  label: string;
  volt?: boolean;
  pulse?: boolean;
}

/** Big tabular countdown readout (rest timer, session clock). */
export function TimerFace({ digits, label, volt = false, pulse = false }: TimerFaceProps) {
  return (
    <div className="ds-timer">
      <div className={`ds-timer__digits ds-tnum${volt ? " ds-timer__digits--volt" : ""}${pulse ? " ds-pulse" : ""}`}>{digits}</div>
      <div className="ds-timer__label">{label}</div>
    </div>
  );
}
