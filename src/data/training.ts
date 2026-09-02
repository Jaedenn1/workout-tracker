export type MuscleGroup =
  | "Chest"
  | "Back"
  | "Shoulders"
  | "Biceps"
  | "Triceps"
  | "Quads"
  | "Hamstrings"
  | "Glutes"
  | "Calves"
  | "Core"
  | "Forearms"
  | "Traps"
  | "Adductors"
  | "Abductors";

export type SeedSet = { weight: number; reps: number; rir?: number | null };

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

export type RoutineDefinition = { id: string; name: string; exerciseIds: string[] };

const ex = (
  id: string,
  name: string,
  muscle: MuscleGroup,
  repMin: number,
  repMax: number,
  increment = 5,
  setCount = 3,
  fallbackWeight = 0,
): ExerciseDefinition => ({ id, name, muscle, repMin, repMax, increment, fallbackWeight, setCount });

export const exerciseLibrary: ExerciseDefinition[] = [
  {
    id: "leg-extension", name: "Leg Extensions", muscle: "Quads", repMin: 12, repMax: 15, increment: 5, fallbackWeight: 100, setCount: 3,
    seedPrevious: [{ weight: 100, reps: 15 }, { weight: 100, reps: 15 }, { weight: 100, reps: 15 }],
  },
  {
    id: "hack-squat", name: "Pendulum / Hack Squat", muscle: "Quads", repMin: 8, repMax: 12, increment: 5, fallbackWeight: 90, setCount: 3,
    seedPrevious: [{ weight: 90, reps: 12 }, { weight: 90, reps: 12 }, { weight: 90, reps: 12 }],
  },
  {
    id: "smith-rdl", name: "Smith Romanian Deadlift", muscle: "Hamstrings", repMin: 8, repMax: 12, increment: 5, fallbackWeight: 180, setCount: 3,
    seedPrevious: [{ weight: 180, reps: 12 }, { weight: 180, reps: 12 }, { weight: 180, reps: 12 }],
  },
  ex("bulgarian-split-squat", "Bulgarian Split Squat", "Glutes", 8, 12, 5, 2),
  {
    id: "hamstring-curl", name: "Hamstring Curl", muscle: "Hamstrings", repMin: 12, repMax: 15, increment: 5, fallbackWeight: 45, setCount: 3,
    seedPrevious: [{ weight: 35, reps: 15 }, { weight: 40, reps: 15 }, { weight: 45, reps: 15 }],
  },
  ex("leg-press", "Leg Press", "Quads", 10, 15, 10),
  {
    id: "calf-raise", name: "Calf Raises", muscle: "Calves", repMin: 12, repMax: 20, increment: 5, fallbackWeight: 80, setCount: 3,
    seedPrevious: [{ weight: 80, reps: 15 }, { weight: 80, reps: 15 }, { weight: 80, reps: 15 }],
  },
  ex("bench-press", "Bench Press", "Chest", 6, 10, 5, 3, 95),
  ex("incline-db-press", "Incline Dumbbell Press", "Chest", 8, 12, 5, 3, 35),
  ex("machine-chest-press", "Machine Chest Press", "Chest", 8, 12, 5, 3, 70),
  ex("cable-fly", "Cable Fly", "Chest", 12, 15, 5, 2, 20),
  ex("shoulder-press", "Shoulder Press", "Shoulders", 8, 12, 5, 3, 30),
  ex("lateral-raise", "Cable / Dumbbell Lateral Raise", "Shoulders", 12, 20, 2.5, 3, 15),
  ex("triceps-pressdown", "Triceps Pressdown", "Triceps", 10, 15, 5, 3, 40),
  ex("overhead-triceps-extension", "Overhead Triceps Extension", "Triceps", 10, 15, 5, 2, 30),
  ex("lat-pulldown", "Lat Pulldown", "Back", 8, 12, 5, 3, 80),
  ex("seated-cable-row", "Seated Cable Row", "Back", 8, 12, 5, 3, 80),
  ex("chest-supported-row", "Chest-Supported Row", "Back", 8, 12, 5, 3, 50),
  ex("rear-delt-fly", "Rear Delt Fly", "Shoulders", 12, 20, 5, 3, 30),
  ex("preacher-curl", "Preacher Curl", "Biceps", 8, 12, 5, 3, 30),
  ex("hammer-curl", "Hammer Curl", "Biceps", 8, 12, 5, 2, 20),
  ex("pull-up", "Pull-Up", "Back", 6, 10),

  // Chest
  ex("db-bench-press", "Dumbbell Bench Press", "Chest", 8, 12),
  ex("incline-barbell-press", "Incline Barbell Press", "Chest", 6, 10),
  ex("decline-bench-press", "Decline Bench Press", "Chest", 6, 10),
  ex("smith-bench-press", "Smith Machine Bench Press", "Chest", 8, 12),
  ex("smith-incline-press", "Smith Machine Incline Press", "Chest", 8, 12),
  ex("incline-machine-press", "Incline Machine Press", "Chest", 8, 12),
  ex("pec-deck", "Pec Deck", "Chest", 10, 15),
  ex("low-high-cable-fly", "Low-to-High Cable Fly", "Chest", 12, 20, 2.5),
  ex("high-low-cable-fly", "High-to-Low Cable Fly", "Chest", 12, 20, 2.5),
  ex("db-fly", "Dumbbell Fly", "Chest", 10, 15, 2.5),
  ex("push-up", "Push-Up", "Chest", 8, 20),
  ex("chest-dip", "Chest-Focused Dip", "Chest", 6, 12),

  // Back
  ex("barbell-row", "Barbell Row", "Back", 6, 10),
  ex("t-bar-row", "T-Bar Row", "Back", 8, 12),
  ex("one-arm-db-row", "One-Arm Dumbbell Row", "Back", 8, 12),
  ex("machine-high-row", "Machine High Row", "Back", 8, 12),
  ex("iso-lateral-row", "Iso-Lateral Machine Row", "Back", 8, 12),
  ex("close-grip-pulldown", "Close-Grip Lat Pulldown", "Back", 8, 12),
  ex("neutral-grip-pulldown", "Neutral-Grip Lat Pulldown", "Back", 8, 12),
  ex("straight-arm-pulldown", "Straight-Arm Pulldown", "Back", 10, 15),
  ex("cable-pullover", "Cable Pullover", "Back", 10, 15),
  ex("assisted-pull-up", "Assisted Pull-Up", "Back", 6, 12),
  ex("chin-up", "Chin-Up", "Back", 6, 10),
  ex("inverted-row", "Inverted Row", "Back", 8, 15),

  // Shoulders + traps
  ex("db-shoulder-press", "Dumbbell Shoulder Press", "Shoulders", 8, 12),
  ex("arnold-press", "Arnold Press", "Shoulders", 8, 12),
  ex("machine-shoulder-press", "Machine Shoulder Press", "Shoulders", 8, 12),
  ex("single-arm-cable-lateral", "Single-Arm Cable Lateral Raise", "Shoulders", 12, 20, 2.5),
  ex("machine-lateral-raise", "Machine Lateral Raise", "Shoulders", 12, 20),
  ex("front-raise", "Front Raise", "Shoulders", 10, 15, 2.5),
  ex("cable-y-raise", "Cable Y-Raise", "Shoulders", 12, 20, 2.5),
  ex("face-pull", "Face Pull", "Shoulders", 12, 20),
  ex("reverse-pec-deck", "Reverse Pec Deck", "Shoulders", 12, 20),
  ex("upright-row", "Upright Row", "Shoulders", 8, 12),
  ex("db-shrug", "Dumbbell Shrug", "Traps", 8, 15),
  ex("barbell-shrug", "Barbell Shrug", "Traps", 8, 15),
  ex("machine-shrug", "Machine Shrug", "Traps", 8, 15),

  // Biceps
  ex("barbell-curl", "Barbell Curl", "Biceps", 8, 12),
  ex("ez-bar-curl", "EZ-Bar Curl", "Biceps", 8, 12),
  ex("incline-db-curl", "Incline Dumbbell Curl", "Biceps", 8, 12, 2.5),
  ex("cable-curl", "Cable Curl", "Biceps", 10, 15),
  ex("bayesian-curl", "Bayesian Cable Curl", "Biceps", 10, 15, 2.5),
  ex("concentration-curl", "Concentration Curl", "Biceps", 10, 15, 2.5),
  ex("spider-curl", "Spider Curl", "Biceps", 8, 12, 2.5),
  ex("machine-biceps-curl", "Machine Biceps Curl", "Biceps", 8, 12),
  ex("reverse-curl", "Reverse Curl", "Biceps", 10, 15, 2.5),

  // Triceps
  ex("rope-pressdown", "Rope Triceps Pressdown", "Triceps", 10, 15),
  ex("single-arm-pressdown", "Single-Arm Cable Pressdown", "Triceps", 10, 15, 2.5),
  ex("skull-crusher", "EZ-Bar Skull Crusher", "Triceps", 8, 12),
  ex("close-grip-bench", "Close-Grip Bench Press", "Triceps", 6, 10),
  ex("db-overhead-triceps", "Dumbbell Overhead Triceps Extension", "Triceps", 10, 15),
  ex("machine-triceps-extension", "Machine Triceps Extension", "Triceps", 8, 12),
  ex("triceps-dip", "Triceps-Focused Dip", "Triceps", 6, 12),

  // Quads
  ex("barbell-back-squat", "Barbell Back Squat", "Quads", 5, 10),
  ex("front-squat", "Front Squat", "Quads", 5, 10),
  ex("smith-squat", "Smith Machine Squat", "Quads", 8, 12),
  ex("goblet-squat", "Goblet Squat", "Quads", 8, 15),
  ex("belt-squat", "Belt Squat", "Quads", 8, 15),
  ex("sissy-squat", "Sissy Squat", "Quads", 10, 20),
  ex("reverse-lunge", "Reverse Lunge", "Quads", 8, 12),
  ex("walking-lunge", "Walking Lunge", "Quads", 10, 16),
  ex("step-up", "Dumbbell Step-Up", "Quads", 8, 12),
  ex("single-leg-press", "Single-Leg Press", "Quads", 10, 15),

  // Hamstrings + glutes
  ex("conventional-deadlift", "Conventional Deadlift", "Hamstrings", 3, 6),
  ex("trap-bar-deadlift", "Trap Bar Deadlift", "Glutes", 4, 8),
  ex("barbell-rdl", "Barbell Romanian Deadlift", "Hamstrings", 6, 10),
  ex("db-rdl", "Dumbbell Romanian Deadlift", "Hamstrings", 8, 12),
  ex("good-morning", "Good Morning", "Hamstrings", 8, 12),
  ex("seated-leg-curl", "Seated Leg Curl", "Hamstrings", 10, 15),
  ex("lying-leg-curl", "Lying Leg Curl", "Hamstrings", 10, 15),
  ex("single-leg-curl", "Single-Leg Hamstring Curl", "Hamstrings", 10, 15),
  ex("nordic-curl", "Nordic Hamstring Curl", "Hamstrings", 4, 10),
  ex("barbell-hip-thrust", "Barbell Hip Thrust", "Glutes", 6, 12),
  ex("machine-hip-thrust", "Machine Hip Thrust", "Glutes", 8, 15),
  ex("glute-bridge", "Glute Bridge", "Glutes", 10, 20),
  ex("cable-pull-through", "Cable Pull-Through", "Glutes", 10, 15),
  ex("back-extension", "45° Back Extension", "Glutes", 10, 15),
  ex("cable-kickback", "Cable Glute Kickback", "Glutes", 12, 20, 2.5),

  // Calves
  ex("standing-calf-raise", "Standing Calf Raise", "Calves", 10, 20),
  ex("seated-calf-raise", "Seated Calf Raise", "Calves", 12, 20),
  ex("leg-press-calf-raise", "Leg Press Calf Raise", "Calves", 12, 20),
  ex("single-leg-calf-raise", "Single-Leg Calf Raise", "Calves", 12, 20),

  // Adductors + abductors
  ex("hip-adduction-machine", "Hip Adduction Machine", "Adductors", 12, 20),
  ex("cable-hip-adduction", "Cable Hip Adduction", "Adductors", 12, 20, 2.5),
  ex("hip-abduction-machine", "Hip Abduction Machine", "Abductors", 12, 20),
  ex("cable-hip-abduction", "Cable Hip Abduction", "Abductors", 12, 20, 2.5),

  // Core
  ex("cable-crunch", "Cable Crunch", "Core", 10, 20),
  ex("ab-crunch-machine", "Ab Crunch Machine", "Core", 10, 20),
  ex("hanging-leg-raise", "Hanging Leg Raise", "Core", 8, 15),
  ex("captains-chair-knee-raise", "Captain's Chair Knee Raise", "Core", 10, 20),
  ex("decline-sit-up", "Decline Sit-Up", "Core", 10, 20),
  ex("ab-wheel", "Ab Wheel Rollout", "Core", 6, 15),
  ex("pallof-press", "Pallof Press", "Core", 10, 15, 2.5),
  ex("weighted-russian-twist", "Weighted Russian Twist", "Core", 12, 24),
  ex("plank", "Plank", "Core", 20, 60),
  ex("side-plank", "Side Plank", "Core", 20, 60),

  // Forearms
  ex("wrist-curl", "Wrist Curl", "Forearms", 12, 20, 2.5),
  ex("reverse-wrist-curl", "Reverse Wrist Curl", "Forearms", 12, 20, 2.5),
  ex("behind-back-wrist-curl", "Behind-the-Back Wrist Curl", "Forearms", 12, 20, 2.5),
];

export const defaultRoutines: RoutineDefinition[] = [
  {
    id: "push",
    name: "Push Day",
    exerciseIds: ["bench-press", "incline-db-press", "shoulder-press", "lateral-raise", "triceps-pressdown", "overhead-triceps-extension"],
  },
  {
    id: "pull",
    name: "Pull Day",
    exerciseIds: ["lat-pulldown", "seated-cable-row", "chest-supported-row", "rear-delt-fly", "preacher-curl", "hammer-curl"],
  },
  {
    id: "legs",
    name: "Leg Day",
    exerciseIds: ["leg-extension", "hack-squat", "smith-rdl", "bulgarian-split-squat", "hamstring-curl", "leg-press", "calf-raise"],
  },
];

export function getExerciseDefinition(id: string) {
  return exerciseLibrary.find((exercise) => exercise.id === id) ?? null;
}
