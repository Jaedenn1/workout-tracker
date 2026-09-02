import Dexie, { type Table } from "dexie";

export const APP_DATA_KEYS = [
  "workout-tracker:v0.2:history",
  "workout-tracker:v0.4:routines",
  "workout-tracker:v0.4:active-routine",
  "workout-tracker:v0.4:drafts",
  "workout-tracker:v0.6:bodyweight",
  "workout-tracker:v0.7:custom-exercises",
  "workout-tracker:v0.7:exercise-notes",
  "workout-tracker:v0.7:rest-seconds",
  "workout-tracker:v0.7:routine-extras",
  "workout-tracker:v0.8:healthkit-imports",
  "workout-tracker:v1.2:rest-sound",
  "workout-tracker:v1.3:readiness",
  "workout-tracker:v1.3:routine-meta",
  "workout-tracker:v1.5:weekly-plan",
  "workout-tracker:v1.6:hybrid-history",
  "workout-tracker:v1.8:coach-feedback",
  "workout-tracker:v1.9:live-session",
] as const;

export type AppDataKey = (typeof APP_DATA_KEYS)[number];

const HISTORY_KEY: AppDataKey = "workout-tracker:v0.2:history";
const ROUTINES_KEY: AppDataKey = "workout-tracker:v0.4:routines";
const BODYWEIGHT_KEY: AppDataKey = "workout-tracker:v0.6:bodyweight";
const META_KEY = "__meta__:schema-version";
const PATCH_FLAG = "__workoutTrackerStorageMirrorInstalled";

export type WorkoutRow = {
  id: string;
  completedAt: string;
  routineId?: string;
  payload: Record<string, unknown>;
};

export type RoutineRow = {
  id: string;
  name: string;
  payload: Record<string, unknown>;
};

export type BodyweightRow = {
  id: string;
  recordedAt: string;
  value: number;
  payload: Record<string, unknown>;
};

export type KeyValueRow = {
  key: string;
  value: string;
  updatedAt: string;
};

export type BackupEnvelope = {
  format: "workout-tracker-backup";
  version: 1;
  schemaVersion: 1;
  appVersion: "1.9.0";
  exportedAt: string;
  data: Record<string, string>;
};

export type BackupRow = {
  id: string;
  createdAt: string;
  label: string;
  envelope: BackupEnvelope;
};

export type SyncQueueRow = {
  id?: number;
  createdAt: string;
  key: string;
  operation: "put" | "delete";
};

class WorkoutTrackerDatabase extends Dexie {
  workouts!: Table<WorkoutRow, string>;
  routines!: Table<RoutineRow, string>;
  bodyweight!: Table<BodyweightRow, string>;
  kv!: Table<KeyValueRow, string>;
  backups!: Table<BackupRow, string>;
  syncQueue!: Table<SyncQueueRow, number>;

  constructor() {
    super("WorkoutTrackerDB");
    this.version(1).stores({
      workouts: "id, completedAt, routineId",
      routines: "id, name",
      bodyweight: "id, recordedAt",
      kv: "key, updatedAt",
      backups: "id, createdAt",
      syncQueue: "++id, createdAt, key, operation",
    });
  }
}

export const db = new WorkoutTrackerDatabase();

function parseJson(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function objectRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function dataKey(key: string): key is AppDataKey {
  return (APP_DATA_KEYS as readonly string[]).includes(key);
}

async function replaceWorkouts(value: string) {
  const parsed = parseJson(value);
  if (!Array.isArray(parsed)) return;
  const rows: WorkoutRow[] = parsed.flatMap((item) => {
    const payload = objectRecord(item);
    if (!payload || typeof payload.id !== "string" || typeof payload.completedAt !== "string") return [];
    return [{
      id: payload.id,
      completedAt: payload.completedAt,
      routineId: typeof payload.routineId === "string" ? payload.routineId : undefined,
      payload,
    }];
  });
  await db.workouts.clear();
  if (rows.length) await db.workouts.bulkPut(rows);
}

async function replaceRoutines(value: string) {
  const parsed = parseJson(value);
  if (!Array.isArray(parsed)) return;
  const rows: RoutineRow[] = parsed.flatMap((item) => {
    const payload = objectRecord(item);
    if (!payload || typeof payload.id !== "string") return [];
    return [{
      id: payload.id,
      name: typeof payload.name === "string" ? payload.name : payload.id,
      payload,
    }];
  });
  await db.routines.clear();
  if (rows.length) await db.routines.bulkPut(rows);
}

async function replaceBodyweight(value: string) {
  const parsed = parseJson(value);
  if (!Array.isArray(parsed)) return;
  const rows: BodyweightRow[] = parsed.flatMap((item) => {
    const payload = objectRecord(item);
    if (!payload) return [];
    const rawValue = Number(payload.value ?? payload.pounds ?? payload.weight);
    const recordedAt = typeof payload.recordedAt === "string" ? payload.recordedAt : "";
    if (!Number.isFinite(rawValue) || rawValue <= 0 || !recordedAt) return [];
    return [{
      id: typeof payload.id === "string" ? payload.id : `weight-${recordedAt}`,
      recordedAt,
      value: rawValue,
      payload,
    }];
  });
  await db.bodyweight.clear();
  if (rows.length) await db.bodyweight.bulkPut(rows);
}

async function replaceQueuedChange(key: AppDataKey, operation: "put" | "delete", createdAt: string) {
  await db.syncQueue.where("key").equals(key).delete();
  await db.syncQueue.add({ createdAt, key, operation });
}

export async function persistLegacyKey(key: AppDataKey, value: string, queue = true) {
  const updatedAt = new Date().toISOString();
  await db.transaction("rw", db.kv, db.workouts, db.routines, db.bodyweight, db.syncQueue, async () => {
    await db.kv.put({ key, value, updatedAt });
    if (key === HISTORY_KEY) await replaceWorkouts(value);
    if (key === ROUTINES_KEY) await replaceRoutines(value);
    if (key === BODYWEIGHT_KEY) await replaceBodyweight(value);
    if (queue) await replaceQueuedChange(key, "put", updatedAt);
  });
}

export async function deleteLegacyKey(key: AppDataKey, queue = true) {
  const createdAt = new Date().toISOString();
  await db.transaction("rw", db.kv, db.workouts, db.routines, db.bodyweight, db.syncQueue, async () => {
    await db.kv.delete(key);
    if (key === HISTORY_KEY) await db.workouts.clear();
    if (key === ROUTINES_KEY) await db.routines.clear();
    if (key === BODYWEIGHT_KEY) await db.bodyweight.clear();
    if (queue) await replaceQueuedChange(key, "delete", createdAt);
  });
}

export async function bootstrapIndexedDb() {
  await db.open();
  const meta = await db.kv.get(META_KEY);

  if (!meta) {
    for (const key of APP_DATA_KEYS) {
      const value = window.localStorage.getItem(key);
      if (value != null) await persistLegacyKey(key, value, false);
    }
    await db.kv.put({ key: META_KEY, value: "1", updatedAt: new Date().toISOString() });
    return;
  }

  for (const key of APP_DATA_KEYS) {
    const local = window.localStorage.getItem(key);
    const stored = await db.kv.get(key);
    if (local != null) {
      if (!stored || stored.value !== local) await persistLegacyKey(key, local, false);
    } else if (stored) {
      window.localStorage.setItem(key, stored.value);
    }
  }
}

export function installStorageMirror() {
  const globalWindow = window as Window & { [PATCH_FLAG]?: boolean };
  if (globalWindow[PATCH_FLAG]) return;
  globalWindow[PATCH_FLAG] = true;

  const originalSetItem = Storage.prototype.setItem;
  const originalRemoveItem = Storage.prototype.removeItem;

  Storage.prototype.setItem = function patchedSetItem(key: string, value: string) {
    originalSetItem.call(this, key, value);
    if (this === window.localStorage && dataKey(key)) {
      void persistLegacyKey(key, value).catch(() => undefined);
    }
  };

  Storage.prototype.removeItem = function patchedRemoveItem(key: string) {
    originalRemoveItem.call(this, key);
    if (this === window.localStorage && dataKey(key)) {
      void deleteLegacyKey(key).catch(() => undefined);
    }
  };
}

export async function getDatabaseStats() {
  return {
    workouts: await db.workouts.count(),
    routines: await db.routines.count(),
    bodyweight: await db.bodyweight.count(),
    backups: await db.backups.count(),
    queuedChanges: await db.syncQueue.count(),
  };
}

export async function exportBackup(): Promise<BackupEnvelope> {
  const data: Record<string, string> = {};
  for (const key of APP_DATA_KEYS) {
    const row = await db.kv.get(key);
    const value = row?.value ?? window.localStorage.getItem(key);
    if (value != null) data[key] = value;
  }
  return {
    format: "workout-tracker-backup",
    version: 1,
    schemaVersion: 1,
    appVersion: "1.9.0",
    exportedAt: new Date().toISOString(),
    data,
  };
}

export function validateBackup(value: unknown): value is BackupEnvelope {
  const item = objectRecord(value);
  return Boolean(
    item &&
    item.format === "workout-tracker-backup" &&
    item.version === 1 &&
    item.schemaVersion === 1 &&
    item.data &&
    typeof item.data === "object",
  );
}

export async function restoreBackup(envelope: BackupEnvelope) {
  for (const key of APP_DATA_KEYS) {
    const value = envelope.data[key];
    if (typeof value === "string") {
      window.localStorage.setItem(key, value);
      await persistLegacyKey(key, value, false);
    } else {
      window.localStorage.removeItem(key);
      await deleteLegacyKey(key, false);
    }
  }
}

export async function createSafetySnapshot(label = "Manual snapshot") {
  const envelope = await exportBackup();
  const row: BackupRow = {
    id: `backup-${Date.now()}`,
    createdAt: new Date().toISOString(),
    label,
    envelope,
  };
  await db.backups.put(row);
  return row;
}

export async function listSafetySnapshots() {
  return db.backups.orderBy("createdAt").reverse().limit(10).toArray();
}

export async function restoreSafetySnapshot(id: string) {
  const snapshot = await db.backups.get(id);
  if (!snapshot) throw new Error("Backup snapshot not found.");
  await restoreBackup(snapshot.envelope);
}

function csvCell(value: unknown) {
  const text = String(value ?? "");
  return `"${text.replaceAll('"', '""')}"`;
}

export async function exportWorkoutCsv() {
  const rows = await db.workouts.orderBy("completedAt").reverse().toArray();
  const lines = [
    ["workout_id", "date", "routine", "exercise", "set", "weight_lb", "reps", "rir", "estimated_1rm"].map(csvCell).join(","),
  ];

  for (const row of rows) {
    const exercises = Array.isArray(row.payload.exercises) ? row.payload.exercises : [];
    for (const exerciseValue of exercises) {
      const exercise = objectRecord(exerciseValue);
      if (!exercise) continue;
      const sets = Array.isArray(exercise.sets) ? exercise.sets : [];
      sets.forEach((setValue, index) => {
        const set = objectRecord(setValue) ?? {};
        lines.push([
          row.id,
          row.completedAt,
          row.payload.name ?? row.routineId ?? "Workout",
          exercise.name ?? exercise.id ?? "Exercise",
          index + 1,
          set.weight ?? "",
          set.reps ?? "",
          set.rir ?? "",
          set.estimated1RM ?? "",
        ].map(csvCell).join(","));
      });
    }
  }

  return lines.join("\n");
}

export async function removeWorkout(workoutId: string) {
  const history = await db.workouts.orderBy("completedAt").reverse().toArray();
  const next = history.filter((row) => row.id !== workoutId).map((row) => row.payload);
  const value = JSON.stringify(next);
  window.localStorage.setItem(HISTORY_KEY, value);
  await persistLegacyKey(HISTORY_KEY, value, false);
}
