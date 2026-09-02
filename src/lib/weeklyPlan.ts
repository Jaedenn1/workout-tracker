export const WEEKLY_PLAN_KEY = "workout-tracker:v1.5:weekly-plan";

export type TrainingKind = "lift" | "run" | "conditioning" | "pool" | "recovery" | "rest";

export type WeeklyPlanDay = {
  day: string;
  shortDay: string;
  kind: TrainingKind;
  title: string;
  detail: string;
  targetDurationMinutes?: number | null;
  targetRpe?: number | null;
  routineId?: string | null;
};

export const trainingKinds: Array<{ value: TrainingKind; label: string }> = [
  { value: "lift", label: "Lift" },
  { value: "run", label: "Run" },
  { value: "conditioning", label: "Conditioning" },
  { value: "pool", label: "Pool" },
  { value: "recovery", label: "Recovery" },
  { value: "rest", label: "Rest" },
];

export const defaultWeeklyPlan: WeeklyPlanDay[] = [
  { day: "Monday", shortDay: "MON", kind: "lift", title: "Push Day", detail: "Primary strength session", targetDurationMinutes: 55, targetRpe: 7, routineId: "push" },
  { day: "Tuesday", shortDay: "TUE", kind: "run", title: "Easy Run", detail: "Easy aerobic work", targetDurationMinutes: 35, targetRpe: 5, routineId: null },
  { day: "Wednesday", shortDay: "WED", kind: "lift", title: "Pull Day", detail: "Primary strength session", targetDurationMinutes: 55, targetRpe: 7, routineId: "pull" },
  { day: "Thursday", shortDay: "THU", kind: "conditioning", title: "Conditioning", detail: "Intervals or Jacob's Ladder", targetDurationMinutes: 20, targetRpe: 8, routineId: null },
  { day: "Friday", shortDay: "FRI", kind: "lift", title: "Leg Day", detail: "Primary strength session", targetDurationMinutes: 60, targetRpe: 8, routineId: "legs" },
  { day: "Saturday", shortDay: "SAT", kind: "pool", title: "Pool + Recovery", detail: "Easy swim and recovery work", targetDurationMinutes: 30, targetRpe: 4, routineId: null },
  { day: "Sunday", shortDay: "SUN", kind: "rest", title: "Rest", detail: "Full recovery or easy walk", targetDurationMinutes: null, targetRpe: null, routineId: null },
];

function finiteTarget(value: unknown, min: number, max: number) {
  const number = Number(value);
  if (!Number.isFinite(number)) return null;
  return Math.min(max, Math.max(min, number));
}

export function normalizeWeeklyPlan(value: unknown): WeeklyPlanDay[] {
  if (!Array.isArray(value) || value.length !== 7) return defaultWeeklyPlan;
  return defaultWeeklyPlan.map((fallback, index) => {
    const candidate = value[index] as Partial<WeeklyPlanDay> | undefined;
    const validKind = trainingKinds.some((kind) => kind.value === candidate?.kind);
    const kind = validKind ? (candidate?.kind as TrainingKind) : fallback.kind;
    const targetDurationMinutes = kind === "rest"
      ? null
      : finiteTarget(candidate?.targetDurationMinutes, 5, 300) ?? (kind === fallback.kind ? fallback.targetDurationMinutes ?? null : 45);
    const targetRpe = kind === "rest"
      ? null
      : finiteTarget(candidate?.targetRpe, 1, 10) ?? (kind === fallback.kind ? fallback.targetRpe ?? null : kind === "recovery" || kind === "pool" ? 4 : 7);
    const routineId = kind === "lift"
      ? typeof candidate?.routineId === "string" && candidate.routineId.trim()
        ? candidate.routineId.trim()
        : fallback.kind === "lift" ? fallback.routineId ?? null : null
      : null;
    return {
      day: fallback.day,
      shortDay: fallback.shortDay,
      kind,
      title: typeof candidate?.title === "string" && candidate.title.trim() ? candidate.title.trim() : fallback.title,
      detail: typeof candidate?.detail === "string" ? candidate.detail.trim() : fallback.detail,
      targetDurationMinutes,
      targetRpe,
      routineId,
    };
  });
}

export function todayPlanIndex(date = new Date()) {
  const jsDay = date.getDay();
  return jsDay === 0 ? 6 : jsDay - 1;
}
