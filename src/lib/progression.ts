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
  const valid = previous.filter(
    (set) => set.weight >= 0 && set.reps > 0 && Number.isFinite(set.weight) && Number.isFinite(set.reps),
  );
  const totalReps = valid.reduce((sum, set) => sum + set.reps, 0);
  const avgRir = averageRir(valid);

  if (valid.length === 0) {
    return {
      action: "build",
      suggestedWeights: Array.from({ length: setCount }, () => fallbackWeight),
      reason: `Establish a baseline in the ${repMin}–${repMax} rep range.`,
      totalReps: 0,
      averageRir: null,
    };
  }

  const baseWeights = Array.from(
    { length: setCount },
    (_, index) => valid[index]?.weight ?? valid.at(-1)?.weight ?? fallbackWeight,
  );
  const allReachedTop = valid.length >= setCount && valid.every((set) => set.reps >= repMax);
  const anyBelowRange = valid.some((set) => set.reps < repMin);
  const effortAllowsIncrease = avgRir == null || avgRir >= 1;

  if (allReachedTop && effortAllowsIncrease) {
    return {
      action: "increase",
      suggestedWeights: baseWeights.map((weight) => weight + increment),
      reason:
        avgRir == null
          ? `All sets reached ${repMax} reps — add ${increment} lb.`
          : `All sets reached ${repMax} reps at ${avgRir.toFixed(1)} avg RIR — add ${increment} lb.`,
      totalReps,
      averageRir: avgRir,
    };
  }

  if (anyBelowRange || (avgRir != null && avgRir < 1)) {
    return {
      action: "hold",
      suggestedWeights: baseWeights,
      reason:
        avgRir != null && avgRir < 1
          ? `Effort was very high (${avgRir.toFixed(1)} avg RIR). Hold the load and make the reps cleaner.`
          : `At least one set was below ${repMin} reps. Hold the load and bring every set into range.`,
      totalReps,
      averageRir: avgRir,
    };
  }

  return {
    action: "build",
    suggestedWeights: baseWeights,
    reason: `Keep the load and beat ${totalReps} total reps before adding weight.`,
    totalReps,
    averageRir: avgRir,
  };
}
