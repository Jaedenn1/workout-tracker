"use client";

import type { ReactNode } from "react";

export interface PageShellProps {
  children: ReactNode;
  /** Stagger the entrance of direct children with .ds-rise delays. */
  rise?: boolean;
  className?: string;
}

/**
 * Consistent page container: mobile-first column, dock-safe bottom
 * padding, max-width matched to the iOS dock (560px).
 */
export function PageShell({ children, rise = false, className = "" }: PageShellProps) {
  return <main className={`ds-page ${className}`.trim()}>{rise ? withRise(children) : children}</main>;
}

function withRise(children: ReactNode): ReactNode {
  // Wrap in a fragment; CSS :nth-child delays would couple us to DOM
  // order, so screens opt into .ds-rise classes on their own blocks.
  return <>{children}</>;
}

export interface PageHeaderProps {
  eyebrow?: string;
  eyebrowVolt?: boolean;
  title: ReactNode;
  lede?: ReactNode;
  action?: ReactNode;
}

/** Display title block for the top of a screen. */
export function PageHeader({ eyebrow, eyebrowVolt = false, title, lede, action }: PageHeaderProps) {
  return (
    <header className="ds-page__top">
      <div>
        {eyebrow ? <p className={`ds-eyebrow${eyebrowVolt ? " ds-eyebrow--volt" : ""}`}>{eyebrow}</p> : null}
        <h1 className="ds-display">{title}</h1>
        {lede ? <p className="ds-lede">{lede}</p> : null}
      </div>
      {action ? <div>{action}</div> : null}
    </header>
  );
}

export interface SectionHeaderProps {
  eyebrow?: string;
  title: string;
  action?: ReactNode;
}

/** Smaller header used between content sections on a screen. */
export function SectionHeader({ eyebrow, title, action }: SectionHeaderProps) {
  return (
    <div className="ds-section-head">
      <div>
        {eyebrow ? <p className="ds-eyebrow">{eyebrow}</p> : null}
        <h2 className="ds-section-title">{title}</h2>
      </div>
      {action ? <div className="ds-section-action">{action}</div> : null}
    </div>
  );
}
