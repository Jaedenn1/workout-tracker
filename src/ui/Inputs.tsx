"use client";

import type { InputHTMLAttributes, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes } from "react";

export interface StepperProps {
  label: string;
  value: string;
  unit?: string;
  onDecrement: () => void;
  onIncrement: () => void;
  /** Render an editable input instead of a static value. */
  editable?: boolean;
  inputProps?: InputHTMLAttributes<HTMLInputElement>;
  decrementDisabled?: boolean;
  incrementDisabled?: boolean;
  decrementLabel?: string;
  incrementLabel?: string;
}

/**
 * Gym-optimized number stepper: big tactile - / + targets with an
 * inset readout. Used for weight and reps entry.
 */
export function Stepper({
  label,
  value,
  unit,
  onDecrement,
  onIncrement,
  editable = false,
  inputProps,
  decrementDisabled = false,
  incrementDisabled = false,
  decrementLabel = "Decrease",
  incrementLabel = "Increase",
}: StepperProps) {
  return (
    <div>
      <div className="ds-field__label" style={{ marginBottom: 6 }}>{label}</div>
      <div className="ds-stepper">
        <button type="button" className="ds-stepper__btn" onClick={onDecrement} disabled={decrementDisabled} aria-label={`${decrementLabel} ${label}`}>
          −
        </button>
        <div className="ds-stepper__field">
          {editable ? (
            <input className="ds-stepper__input ds-tnum" value={value} {...inputProps} aria-label={label} />
          ) : (
            <span className="ds-stepper__value ds-tnum">{value}</span>
          )}
          {unit ? <span className="ds-stepper__unit">{unit}</span> : null}
        </div>
        <button type="button" className="ds-stepper__btn" onClick={onIncrement} disabled={incrementDisabled} aria-label={`${incrementLabel} ${label}`}>
          +
        </button>
      </div>
    </div>
  );
}

export interface FieldProps {
  label: string;
  suffix?: string;
  children: ReactNode;
}

/** Labeled wrapper for a single input / select / textarea. */
export function Field({ label, suffix, children }: FieldProps) {
  return (
    <label className="ds-field">
      <span className="ds-field__label">{label}</span>
      <span className="ds-field__control">
        {children}
        {suffix ? <span className="ds-field__suffix">{suffix}</span> : null}
      </span>
    </label>
  );
}

export function TextInput(props: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} />;
}

export function SelectInput(props: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...props} />;
}

export function TextAreaInput(props: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...props} rows={props.rows ?? 3} />;
}

export interface SegmentedOption<T extends string> {
  value: T;
  label: string;
}

export interface SegmentedControlProps<T extends string> {
  options: readonly SegmentedOption<T>[];
  value: T;
  onChange: (value: T) => void;
  label?: string;
}

/** iOS-style segmented control for 2–4 mutually exclusive options. */
export function SegmentedControl<T extends string>({ options, value, onChange, label }: SegmentedControlProps<T>) {
  return (
    <div className="ds-segmented" role="group" aria-label={label}>
      {options.map((opt) => (
        <button
          key={opt.value}
          type="button"
          className={`ds-segmented__opt${opt.value === value ? " ds-segmented__opt--on" : ""}`}
          aria-pressed={opt.value === value}
          onClick={() => onChange(opt.value)}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}
