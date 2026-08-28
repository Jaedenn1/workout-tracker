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

const styles = `
.gym-v12-session{position:relative}.gym-cancel-menu{width:100%;margin-top:7px}.gym-cancel-menu>summary{list-style:none;cursor:pointer;min-height:42px;width:100%;display:flex;align-items:center;justify-content:center;gap:7px;border:1px solid #ffffff16;border-radius:12px;background:linear-gradient(#18191d,#101115);color:#d9dcd5;font-size:.74rem;font-weight:850;box-shadow:inset 0 1px #ffffff0d,0 3px #050506;user-select:none}.gym-cancel-menu>summary::-webkit-details-marker{display:none}.gym-cancel-menu>summary span{color:#858990;transition:transform .18s ease}.gym-cancel-menu[open]>summary span{transform:rotate(180deg)}.gym-cancel-dropdown{position:absolute;right:0;top:calc(100% + 9px);z-index:90;width:min(330px,calc(100vw - 24px));padding:13px;background:linear-gradient(145deg,#191a1e,#101115 58%,#090a0c);border:1px solid #ffffff18;border-radius:17px;box-shadow:inset 0 1px #ffffff12,0 18px 42px #0009;text-align:left}.gym-cancel-dropdown>div:first-child{padding:2px 2px 11px}.gym-cancel-dropdown strong,.gym-cancel-dropdown span{display:block}.gym-cancel-dropdown strong{font-size:.88rem}.gym-cancel-dropdown span{margin-top:4px;color:#858990;font-size:.72rem;line-height:1.4}.gym-cancel-warning{padding:11px;border:1px solid #5b2b2b;background:#2a1114;border-radius:13px}.gym-cancel-warning b{display:block;color:#ffb0b0;font-size:.82rem}.gym-cancel-warning p{margin:5px 0 10px;color:#d3a1a5;font-size:.72rem;line-height:1.45}.gym-cancel-warning button{width:100%;min-height:44px;border:1px solid #744047;border-radius:11px;background:linear-gradient(#4a2026,#321318);color:#ffd9dc;font:inherit;font-size:.78rem;font-weight:900;box-shadow:inset 0 1px #ffffff0d,0 3px #17090b}.gym-cancel-warning button.armed{background:linear-gradient(#d55b69,#a93443);border-color:#ee7c88;color:#fff}.gym-cancel-warning small{display:block;margin-top:7px;color:#bb858a;font-size:.66rem;text-align:center}@media(max-width:560px){.gym-cancel-dropdown{right:-4px}.gym-cancel-menu>summary{min-height:40px;font-size:.7rem}}@media(prefers-reduced-motion:reduce){.gym-cancel-menu>summary span{transition:none}}
`;

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
    <>
      <style>{styles}</style>
      <details
        className="gym-cancel-menu"
        onToggle={(event) => {
          if (!event.currentTarget.open) setArmed(false);
        }}
      >
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
      </details>
    </>,
    target,
  );
}
