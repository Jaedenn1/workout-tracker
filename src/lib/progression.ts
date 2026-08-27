export type PerformanceSet = {
  weight: number;
  reps: number;
  rir?: number | null;
};

export type ProgressionAction = "increase" | "hold" | "build";

export type ProgressionDecision = {
  action: ProgressionAction;
  suggestedWeights: number[];
  reason: string;
  totalReps: number;
  averageRir: number | null;
};

export function estimateOneRepMax(weight: number, reps: number): number {
  if (!Number.isFinite(weight) || !Number.isFinite(reps) || weight <= 0 || reps <= 0) {
    return 0;
  }
  if (reps === 1) return weight;
  return weight * (1 + reps / 30);
}

export function bestEstimatedOneRepMax(sets: PerformanceSet[]): number {
  return sets.reduce(
    (best, set) => Math.max(best, estimateOneRepMax(set.weight, set.reps)),
    0,
  );
}

export function averageRir(sets: PerformanceSet[]): number | null {
  const values = sets
    .map((set) => set.rir)
    .filter((value): value is number => value != null && Number.isFinite(value));

  if (values.length === 0) return null;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

export function progressionDecision(
  previous: PerformanceSet[],
  repMin: number,
  repMax: number,
  increment: number,
  fallbackWeight: number,
  setCount: number,
): ProgressionDecision {
  const plannedSets = Math.max(1, setCount);
  const valid = previous
    .filter(
      (set) =>
        set.weight >= 0 &&
        set.reps > 0 &&
        Number.isFinite(set.weight) &&
        Number.isFinite(set.reps),
    )
    .slice(0, plannedSets);

  const totalReps = valid.reduce((sum, set) => sum + set.reps, 0);
  const avgRir = averageRir(valid);

  if (valid.length === 0) {
    return {
      action: "build",
      suggestedWeights: Array.from({ length: plannedSets }, () => fallbackWeight),
      reason: `Establish a baseline in the ${repMin}–${repMax} rep range.`,
      totalReps: 0,
      averageRir: null,
    };
  }

  const lastKnownWeight = valid.at(-1)?.weight ?? fallbackWeight;
  const baseWeights = Array.from(
    { length: plannedSets },
    (_, index) => valid[index]?.weight ?? lastKnownWeight,
  );

  const completedPlannedSets = valid.length >= plannedSets;
  const allReachedTop = completedPlannedSets && valid.every((set) => set.reps >= repMax);
  const anyBelowRange = valid.some((set) => set.reps < repMin);
  const severeMiss = valid.some((set) => set.reps < Math.max(1, repMin - 2));
  const veryHighEffort = avgRir != null && avgRir < 0.5;
  const highEffort = avgRir != null && avgRir < 1;
  const comfortableTopEnd = avgRir == null || avgRir >= 1.5;

  if (allReachedTop && comfortableTopEnd) {
    return {
      action: "increase",
      suggestedWeights: baseWeights.map((weight) => weight + increment),
      reason:
        avgRir == null
          ? `All ${plannedSets} sets reached ${repMax} reps — add ${increment} lb while preserving the set-by-set loading pattern.`
          : `All ${plannedSets} sets reached ${repMax} reps at ${avgRir.toFixed(1)} avg RIR — add ${increment} lb to each work set.`,
      totalReps,
      averageRir: avgRir,
    };
  }

  if (allReachedTop && !comfortableTopEnd) {
    return {
      action: "hold",
      suggestedWeights: baseWeights,
      reason: `You reached the top of the rep range, but effort was ${avgRir?.toFixed(1)} avg RIR. Repeat the load with cleaner reps before increasing.`,
      totalReps,
      averageRir: avgRir,
    };
  }

  if (!completedPlannedSets) {
    return {
      action: "build",
      suggestedWeights: baseWeights,
      reason: `Only ${valid.length} of ${plannedSets} planned work sets were completed. Keep the load pattern and complete the prescription before adding weight.`,
      totalReps,
      averageRir: avgRir,
    };
  }

  if (severeMiss || veryHighEffort) {
    return {
      action: "hold",
      suggestedWeights: baseWeights,
      reason: veryHighEffort
        ? `Effort was extremely high (${avgRir?.toFixed(1)} avg RIR). Keep the load and prioritize clean reps before progression.`
        : `A set missed the bottom of the rep range by more than 2 reps. Keep the load and rebuild the full set quality first.`,
      totalReps,
      averageRir: avgRir,
    };
  }

  if (anyBelowRange || highEffort) {
    return {
      action: "hold",
      suggestedWeights: baseWeights,
      reason:
        highEffort
          ? `Effort was high (${avgRir?.toFixed(1)} avg RIR). Hold the load and improve reps before increasing.`
          : `At least one work set was below ${repMin} reps. Hold the set-by-set loads until every set is back in range.`,
      totalReps,
      averageRir: avgRir,
    };
  }

  const topTarget = plannedSets * repMax;
  const repsToTop = Math.max(1, topTarget - totalReps);
  return {
    action: "build",
    suggestedWeights: baseWeights,
    reason: `Keep the load pattern and add ${repsToTop} total rep${repsToTop === 1 ? "" : "s"} before the automatic load increase.`,
    totalReps,
    averageRir: avgRir,
  };
}
