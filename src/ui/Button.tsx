"use client";

import type { ButtonHTMLAttributes, ReactNode } from "react";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
export type ButtonSize = "sm" | "md" | "lg" | "xl";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  block?: boolean;
  icon?: ReactNode;
}

const VARIANTS: Record<ButtonVariant, string> = {
  primary: "ds-btn--primary",
  secondary: "ds-btn--secondary",
  ghost: "ds-btn--ghost",
  danger: "ds-btn--danger",
};

const SIZES: Record<ButtonSize, string> = {
  sm: "ds-btn--sm",
  md: "ds-btn--md",
  lg: "ds-btn--lg",
  xl: "ds-btn--xl",
};

/**
 * The system's action button. `primary` gets the full tactile 3D
 * treatment — reserve it for the single most important action per
 * view (Start Workout, Complete Set, Finish). Everything else uses
 * secondary / ghost.
 */
export function Button({
  variant = "secondary",
  size = "md",
  block = false,
  icon,
  className = "",
  children,
  ...rest
}: ButtonProps) {
  return (
    <button
      className={`ds-btn ${VARIANTS[variant]} ${SIZES[size]}${block ? " ds-btn--block" : ""} ${className}`.trim()}
      {...rest}
    >
      {icon ? <span className="ds-btn__icon">{icon}</span> : null}
      {children}
    </button>
  );
}

export interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  label: string;
  small?: boolean;
  volt?: boolean;
}

/** Square tactile icon button for toolbars, cards, and steppers-adjacent actions. */
export function IconButton({ label, small = false, volt = false, className = "", children, ...rest }: IconButtonProps) {
  return (
    <button
      aria-label={label}
      title={label}
      className={`ds-icon-btn${small ? " ds-icon-btn--sm" : ""}${volt ? " ds-icon-btn--volt" : ""} ${className}`.trim()}
      {...rest}
    >
      {children}
    </button>
  );
}
