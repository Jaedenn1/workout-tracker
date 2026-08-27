import type { WorkoutExercise } from "../domain/workout";

export function nextLoadTarget(exercise: WorkoutExercise): number | null {
  const { repMax, increment = 5 } = exercise;
  const completed = exercise.sets.filter((set) => set.completed && set.weight != null && set.reps != null);
  if (!repMax || completed.length === 0) return null;

  const allReachedTop = completed.every((set) => (set.reps ?? 0) >= repMax);
  const load = completed[0]?.weight ?? null;
  if (load == null) return null;

  return allReachedTop ? load + increment : load;
}
