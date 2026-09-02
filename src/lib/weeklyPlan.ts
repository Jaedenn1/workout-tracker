export const WEEKLY_PLAN_KEY = "workout-tracker:v1.5:weekly-plan";

export type TrainingKind = "lift" | "run" | "conditioning" | "pool" | "recovery" | "rest";

export type WeeklyPlanDay = {
  day: string;
  shortDay: string;
  kind: TrainingKind;
  title: string;
  detail: string;
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
  { day: "Monday", shortDay: "MON", kind: "lift", title: "Strength", detail: "Primary lifting session" },
  { day: "Tuesday", shortDay: "TUE", kind: "run", title: "Run", detail: "Easy aerobic work" },
  { day: "Wednesday", shortDay: "WED", kind: "lift", title: "Strength", detail: "Primary lifting session" },
  { day: "Thursday", shortDay: "THU", kind: "conditioning", title: "Conditioning", detail: "Intervals or Jacob's Ladder" },
  { day: "Friday", shortDay: "FRI", kind: "lift", title: "Strength", detail: "Primary lifting session" },
  { day: "Saturday", shortDay: "SAT", kind: "pool", title: "Pool + Recovery", detail: "Easy swim and recovery work" },
  { day: "Sunday", shortDay: "SUN", kind: "rest", title: "Rest", detail: "Full recovery or easy walk" },
];

export function normalizeWeeklyPlan(value: unknown): WeeklyPlanDay[] {
  if (!Array.isArray(value) || value.length !== 7) return defaultWeeklyPlan;
  return defaultWeeklyPlan.map((fallback, index) => {
    const candidate = value[index] as Partial<WeeklyPlanDay> | undefined;
    const validKind = trainingKinds.some((kind) => kind.value === candidate?.kind);
    return {
      day: fallback.day,
      shortDay: fallback.shortDay,
      kind: validKind ? (candidate?.kind as TrainingKind) : fallback.kind,
      title: typeof candidate?.title === "string" && candidate.title.trim() ? candidate.title.trim() : fallback.title,
      detail: typeof candidate?.detail === "string" ? candidate.detail.trim() : fallback.detail,
    };
  });
}

export function todayPlanIndex(date = new Date()) {
  const jsDay = date.getDay();
  return jsDay === 0 ? 6 : jsDay - 1;
}
