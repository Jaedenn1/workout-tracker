"use client";

import type { HTMLAttributes, ReactNode } from "react";

export interface CardProps extends HTMLAttributes<HTMLDivElement> {
  tight?: boolean;
  flush?: boolean;
  glow?: boolean;
  pressable?: boolean;
  onClick?: () => void;
}

/** Elevated surface. `pressable` adds tactile feedback for tappable cards. */
export function Card({ tight = false, flush = false, glow = false, pressable = false, onClick, className = "", children, ...rest }: CardProps) {
  const cls = `ds-card${tight ? " ds-card--tight" : ""}${flush ? " ds-card--flush" : ""}${glow ? " ds-card--glow" : ""}${pressable ? " ds-card--pressable" : ""} ${className}`.trim();
  if (pressable || onClick) {
    return (
      <div className={cls} onClick={onClick} role={onClick ? "button" : undefined} tabIndex={onClick ? 0 : undefined}
        onKeyDown={onClick ? (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onClick(); } } : undefined}
        {...rest}>
        {children}
      </div>
    );
  }
  return <div className={cls} {...rest}>{children}</div>;
}

export function Divider({ className = "" }: { className?: string }) {
  return <hr className={`ds-divider ${className}`.trim()} />;
}

export function Stack({ className = "", children }: { className?: string; children: ReactNode }) {
  return <div className={`ds-stack ${className}`.trim()}>{children}</div>;
}

export function Cluster({ className = "", children }: { className?: string; children: ReactNode }) {
  return <div className={`ds-cluster ${className}`.trim()}>{children}</div>;
}
