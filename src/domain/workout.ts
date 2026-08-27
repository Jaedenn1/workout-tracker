export type WeightUnit = "lb" | "kg";

export interface WorkoutSet {
  id: string;
  setNumber: number;
  weight: number | null;
  reps: number | null;
  completed: boolean;
  rir?: number | null;
  note?: string;
}

export interface WorkoutExercise {
  id: string;
  exerciseId: string;
  exerciseName: string;
  order: number;
  repMin?: number;
  repMax?: number;
  increment?: number;
  sets: WorkoutSet[];
}

export interface WorkoutSession {
  id: string;
  routineId?: string;
  name: string;
  startedAt: string;
  completedAt?: string;
  unit: WeightUnit;
  exercises: WorkoutExercise[];
}
