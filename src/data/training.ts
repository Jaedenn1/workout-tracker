export type MuscleGroup =
  | "Chest"
  | "Back"
  | "Shoulders"
  | "Biceps"
  | "Triceps"
  | "Quads"
  | "Hamstrings"
  | "Glutes"
  | "Calves";

export type SeedSet = {
  weight: number;
  reps: number;
  rir?: number | null;
};

export type ExerciseDefinition = {
  id: string;
  name: string;
  muscle: MuscleGroup;
  repMin: number;
  repMax: number;
  increment: number;
  fallbackWeight: number;
  setCount: number;
  seedPrevious?: SeedSet[];
};

export type RoutineDefinition = {
  id: string;
  name: string;
  exerciseIds: string[];
};

export const exerciseLibrary: ExerciseDefinition[] = [
  {
    id: "leg-extension",
    name: "Leg Extensions",
    muscle: "Quads",
    repMin: 12,
    repMax: 15,
    increment: 5,
    fallbackWeight: 100,
    setCount: 3,
    seedPrevious: [
      { weight: 100, reps: 15 },
      { weight: 100, reps: 15 },
      { weight: 100, reps: 15 },
    ],
  },
  {
    id: "hack-squat",
    name: "Pendulum / Hack Squat",
    muscle: "Quads",
    repMin: 8,
    repMax: 12,
    increment: 5,
    fallbackWeight: 90,
    setCount: 3,
    seedPrevious: [
      { weight: 90, reps: 12 },
      { weight: 90, reps: 12 },
      { weight: 90, reps: 12 },
    ],
  },
  {
    id: "smith-rdl",
    name: "Smith Romanian Deadlift",
    muscle: "Hamstrings",
    repMin: 8,
    repMax: 12,
    increment: 5,
    fallbackWeight: 180,
    setCount: 3,
    seedPrevious: [
      { weight: 180, reps: 12 },
      { weight: 180, reps: 12 },
      { weight: 180, reps: 12 },
    ],
  },
  {
    id: "bulgarian-split-squat",
    name: "Bulgarian Split Squat",
    muscle: "Glutes",
    repMin: 8,
    repMax: 12,
    increment: 5,
    fallbackWeight: 0,
    setCount: 2,
  },
  {
    id: "hamstring-curl",
    name: "Hamstring Curl",
    muscle: "Hamstrings",
    repMin: 12,
    repMax: 15,
    increment: 5,
    fallbackWeight: 45,
    setCount: 3,
    seedPrevious: [
      { weight: 35, reps: 15 },
      { weight: 40, reps: 15 },
      { weight: 45, reps: 15 },
    ],
  },
  {
    id: "leg-press",
    name: "Leg Press",
    muscle: "Quads",
    repMin: 10,
    repMax: 15,
    increment: 10,
    fallbackWeight: 0,
    setCount: 3,
  },
  {
    id: "calf-raise",
    name: "Calf Raises",
    muscle: "Calves",
    repMin: 12,
    repMax: 20,
    increment: 5,
    fallbackWeight: 80,
    setCount: 3,
    seedPrevious: [
      { weight: 80, reps: 15 },
      { weight: 80, reps: 15 },
      { weight: 80, reps: 15 },
    ],
  },
  {
    id: "bench-press",
    name: "Bench Press",
    muscle: "Chest",
    repMin: 6,
    repMax: 10,
    increment: 5,
    fallbackWeight: 95,
    setCount: 3,
  },
  {
    id: "incline-db-press",
    name: "Incline Dumbbell Press",
    muscle: "Chest",
    repMin: 8,
    repMax: 12,
    increment: 5,
    fallbackWeight: 35,
    setCount: 3,
  },
  {
    id: "machine-chest-press",
    name: "Machine Chest Press",
    muscle: "Chest",
    repMin: 8,
    repMax: 12,
    increment: 5,
    fallbackWeight: 70,
    setCount: 3,
  },
  {
    id: "cable-fly",
    name: "Cable Fly",
    muscle: "Chest",
    repMin: 12,
    repMax: 15,
    increment: 5,
    fallbackWeight: 20,
    setCount: 2,
  },
  {
    id: "shoulder-press",
    name: "Shoulder Press",
    muscle: "Shoulders",
    repMin: 8,
    repMax: 12,
    increment: 5,
    fallbackWeight: 30,
    setCount: 3,
  },
  {
    id: "lateral-raise",
    name: "Cable / Dumbbell Lateral Raise",
    muscle: "Shoulders",
    repMin: 12,
    repMax: 20,
    increment: 2.5,
    fallbackWeight: 15,
    setCount: 3,
  },
  {
    id: "triceps-pressdown",
    name: "Triceps Pressdown",
    muscle: "Triceps",
    repMin: 10,
    repMax: 15,
    increment: 5,
    fallbackWeight: 40,
    setCount: 3,
  },
  {
    id: "overhead-triceps-extension",
    name: "Overhead Triceps Extension",
    muscle: "Triceps",
    repMin: 10,
    repMax: 15,
    increment: 5,
    fallbackWeight: 30,
    setCount: 2,
  },
  {
    id: "lat-pulldown",
    name: "Lat Pulldown",
    muscle: "Back",
    repMin: 8,
    repMax: 12,
    increment: 5,
    fallbackWeight: 80,
    setCount: 3,
  },
  {
    id: "seated-cable-row",
    name: "Seated Cable Row",
    muscle: "Back",
    repMin: 8,
    repMax: 12,
    increment: 5,
    fallbackWeight: 80,
    setCount: 3,
  },
  {
    id: "chest-supported-row",
    name: "Chest-Supported Row",
    muscle: "Back",
    repMin: 8,
    repMax: 12,
    increment: 5,
    fallbackWeight: 50,
    setCount: 3,
  },
  {
    id: "rear-delt-fly",
    name: "Rear Delt Fly",
    muscle: "Shoulders",
    repMin: 12,
    repMax: 20,
    increment: 5,
    fallbackWeight: 30,
    setCount: 3,
  },
  {
    id: "preacher-curl",
    name: "Preacher Curl",
    muscle: "Biceps",
    repMin: 8,
    repMax: 12,
    increment: 5,
    fallbackWeight: 30,
    setCount: 3,
  },
  {
    id: "hammer-curl",
    name: "Hammer Curl",
    muscle: "Biceps",
    repMin: 8,
    repMax: 12,
    increment: 5,
    fallbackWeight: 20,
    setCount: 2,
  },
  {
    id: "pull-up",
    name: "Pull-Up",
    muscle: "Back",
    repMin: 6,
    repMax: 10,
    increment: 5,
    fallbackWeight: 0,
    setCount: 3,
  },
];

export const defaultRoutines: RoutineDefinition[] = [
  {
    id: "push",
    name: "Push Day",
    exerciseIds: [
      "bench-press",
      "incline-db-press",
      "shoulder-press",
      "lateral-raise",
      "triceps-pressdown",
      "overhead-triceps-extension",
    ],
  },
  {
    id: "pull",
    name: "Pull Day",
    exerciseIds: [
      "lat-pulldown",
      "seated-cable-row",
      "chest-supported-row",
      "rear-delt-fly",
      "preacher-curl",
      "hammer-curl",
    ],
  },
  {
    id: "legs",
    name: "Leg Day",
    exerciseIds: [
      "leg-extension",
      "hack-squat",
      "smith-rdl",
      "bulgarian-split-squat",
      "hamstring-curl",
      "leg-press",
      "calf-raise",
    ],
  },
];

export function getExerciseDefinition(id: string) {
  return exerciseLibrary.find((exercise) => exercise.id === id) ?? null;
}
