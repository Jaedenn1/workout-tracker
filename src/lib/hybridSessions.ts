import type { TrainingKind } from "./weeklyPlan";

export const HYBRID_HISTORY_KEY = "workout-tracker:v1.6:hybrid-history";

export type HybridSessionKind = Exclude<TrainingKind, "lift" | "rest">;

export type HybridSession = {
  id: string;
  kind: HybridSessionKind;
  title: string;
  completedAt: string;
  durationMinutes: number;
  effort: number;
  notes: string;
  distanceKm?: number | null;
  elevationFeet?: number | null;
  laps?: number | null;
};

export function readHybridSessions(): HybridSession[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(HYBRID_HISTORY_KEY) ?? "[]");
    return Array.isArray(parsed) ? parsed as HybridSession[] : [];
  } catch {
    return [];
  }
}

export function saveHybridSession(session: HybridSession) {
  const next = [session, ...readHybridSessions()].slice(0, 500);
  localStorage.setItem(HYBRID_HISTORY_KEY, JSON.stringify(next));
  window.dispatchEvent(new CustomEvent("workout-tracker:hybrid-session"));
  return next;
}

export function kindLabel(kind: HybridSessionKind) {
  if (kind === "run") return "Run";
  if (kind === "conditioning") return "Conditioning";
  if (kind === "pool") return "Pool";
  return "Recovery";
}

export function pacePerKm(distanceKm?: number | null, durationMinutes?: number | null) {
  if (!distanceKm || distanceKm <= 0 || !durationMinutes || durationMinutes <= 0) return null;
  const totalSeconds = Math.round((durationMinutes * 60) / distanceKm);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}/km`;
}
