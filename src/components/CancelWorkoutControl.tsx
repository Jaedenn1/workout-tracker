"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

const ACTIVE_ROUTINE_KEY = "workout-tracker:v0.4:active-routine";
const LEGACY_DRAFTS_KEY = "workout-tracker:v0.4:drafts";
const DRAFTS_KEY = "workout-tracker:v0.7:drafts";

type DraftMap = Record<string, unknown>;

function readDrafts(key: string): DraftMap {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as DraftMap) : {};
  } catch {
    return {};
  }
}

function removeRoutineDraft(key: string, routineId: string) {
  const drafts = readDrafts(key);
  delete drafts[routineId];
  localStorage.setItem(key, JSON.stringify(drafts));
}

export default function CancelWorkoutControl() {
  const [target, setTarget] = useState<HTMLElement | null>(null);
  const [armed, setArmed] = useState(false);
  const resetTimerRef = useRef<number | null>(null);

  useEffect(() => {
    setTarget(document.querySelector<HTMLElement>(".gym-v12-session"));
    return () => {
      if (resetTimerRef.current) window.clearTimeout(resetTimerRef.current);
    };
  }, []);

  function armCancel() {
    setArmed(true);
    if (resetTimerRef.current) window.clearTimeout(resetTimerRef.current);
    resetTimerRef.current = window.setTimeout(() => setArmed(false), 5000);
  }

  function discardWorkout() {
    const routineId = localStorage.getItem(ACTIVE_ROUTINE_KEY) ?? "legs";
    removeRoutineDraft(DRAFTS_KEY, routineId);
    removeRoutineDraft(LEGACY_DRAFTS_KEY, routineId);
    sessionStorage.setItem("workout-tracker:v1.2:cancelled", routineId);
    window.location.replace("/gym");
  }

  function handleCancel() {
    if (!armed) {
      armCancel();
      return;
    }
    discardWorkout();
  }

  if (!target) return null;

  return createPortal(
    <details className="gym-cancel-menu" onToggle={(event) => {
      if (!(event.currentTarget as HTMLDetailsElement).open) setArmed(false);
    }}>
      <summary>Session menu <span>⌄</span></summary>
      <div className="gym-cancel-dropdown">
        <div>
          <strong>Session controls</strong>
          <span>Canceling discards only this in-progress workout.</span>
        </div>
        <div className="gym-cancel-warning">
          <b>Cancel workout</b>
          <p>This session will be discarded and will not be saved to History. Your routine and previous workouts stay intact.</p>
          <button type="button" className={armed ? "armed" : ""} onClick={handleCancel}>
            {armed ? "Tap again to discard" : "Cancel workout"}
          </button>
          {armed && <small>Confirmation resets in 5 seconds.</small>}
        </div>
      </div>
    </details>,
    target,
  );
}
