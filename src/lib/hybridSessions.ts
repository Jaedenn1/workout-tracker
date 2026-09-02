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

function finiteNonNegative(value: unknown) {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : null;
}

function normalizeHybridSession(value: unknown): HybridSession | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const item = value as Partial<HybridSession>;
  if (item.kind !== "run" && item.kind !== "conditioning" && item.kind !== "pool" && item.kind !== "recovery") return null;
  if (typeof item.id !== "string" || !item.id.trim()) return null;
  if (typeof item.title !== "string" || !item.title.trim()) return null;
  if (typeof item.completedAt !== "string" || !Number.isFinite(new Date(item.completedAt).getTime())) return null;
  const durationMinutes = Number(item.durationMinutes);
  const effort = Number(item.effort);
  if (!Number.isFinite(durationMinutes) || durationMinutes <= 0 || !Number.isFinite(effort)) return null;
  return {
    id: item.id,
    kind: item.kind,
    title: item.title.trim(),
    completedAt: item.completedAt,
    durationMinutes: Math.max(1, Math.round(durationMinutes)),
    effort: Math.min(10, Math.max(1, Math.round(effort))),
    notes: typeof item.notes === "string" ? item.notes : "",
    distanceKm: finiteNonNegative(item.distanceKm),
    elevationFeet: finiteNonNegative(item.elevationFeet),
    laps: finiteNonNegative(item.laps),
  };
}

export function readHybridSessions(): HybridSession[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(HYBRID_HISTORY_KEY) ?? "[]");
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map(normalizeHybridSession)
      .filter((item): item is HybridSession => Boolean(item))
      .sort((a, b) => b.completedAt.localeCompare(a.completedAt));
  } catch {
    return [];
  }
}

export function saveHybridSession(session: HybridSession) {
  const normalized = normalizeHybridSession(session);
  if (!normalized) throw new Error("Invalid hybrid session data.");
  const next = [normalized, ...readHybridSessions().filter((item) => item.id !== normalized.id)].slice(0, 500);
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
