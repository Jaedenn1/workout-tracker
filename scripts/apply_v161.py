from pathlib import Path


def replace_once(path: str, old: str, new: str) -> None:
    file = Path(path)
    text = file.read_text()
    if old not in text:
        raise SystemExit(f"Expected text not found in {path}: {old[:80]!r}")
    file.write_text(text.replace(old, new, 1))


# 1) Make all meaningful user training data part of IndexedDB mirror/backups/sync.
replace_once(
    "src/lib/database.ts",
    '  "workout-tracker:v0.7:routine-extras",\n  "workout-tracker:v0.7:drafts",\n  "workout-tracker:v0.8:healthkit-imports",\n',
    '  "workout-tracker:v0.7:routine-extras",\n  "workout-tracker:v0.8:healthkit-imports",\n  "workout-tracker:v1.2:rest-sound",\n  "workout-tracker:v1.3:readiness",\n  "workout-tracker:v1.3:routine-meta",\n  "workout-tracker:v1.5:weekly-plan",\n  "workout-tracker:v1.6:hybrid-history",\n',
)
replace_once("src/lib/database.ts", '  appVersion: "1.0.0";', '  appVersion: "1.6.1";')
replace_once("src/lib/database.ts", '    appVersion: "1.0.0",', '    appVersion: "1.6.1",')

# 2) Validate imported/local hybrid rows and make saves idempotent by session id.
replace_once(
    "src/lib/hybridSessions.ts",
    '''export function readHybridSessions(): HybridSession[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(HYBRID_HISTORY_KEY) ?? "[]");
    return Array.isArray(parsed) ? parsed as HybridSession[] : [];
  } catch {
    return [];
  }
}

export function saveHybridSession(session: HybridSession) {
  const next = [session, ...readHybridSessions()].slice(0, 500);
  localStorage.setItem(HYBRID_HISTORY_KEY, JSON.stringify(next));
  window.dispatchEvent(new CustomEvent("workout-tracker:hybrid-session"));
  return next;
}
''',
    '''function finiteNonNegative(value: unknown) {
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
''',
)

# 3) Keep one stable ID for the current logger page so double taps update instead of duplicate.
replace_once(
    "src/components/HybridSessionLogger.tsx",
    '  const [status, setStatus] = useState("");\n',
    '  const [status, setStatus] = useState("");\n  const [sessionId] = useState(() => {\n    const token = typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"\n      ? crypto.randomUUID()\n      : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;\n    return `hybrid-${token}`;\n  });\n',
)
replace_once("src/components/HybridSessionLogger.tsx", '      id: `hybrid-${Date.now()}`,', '      id: sessionId,')
replace_once(
    "src/components/HybridSessionLogger.tsx",
    '    setStatus("Session saved to Hybrid History.");',
    '    setStatus("Session saved to Hybrid History. Saving again updates this session instead of duplicating it.");',
)

# 4) Clearing hybrid history gets the same rollback protection as lifting history.
replace_once(
    "src/components/HybridHistory.tsx",
    'import { HYBRID_HISTORY_KEY, kindLabel, pacePerKm, readHybridSessions, type HybridSession, type HybridSessionKind } from "../lib/hybridSessions";',
    'import { createSafetySnapshot } from "../lib/database";\nimport { HYBRID_HISTORY_KEY, kindLabel, pacePerKm, readHybridSessions, type HybridSession, type HybridSessionKind } from "../lib/hybridSessions";',
)
replace_once(
    "src/components/HybridHistory.tsx",
    '  const [filter, setFilter] = useState<"all" | HybridSessionKind>("all");\n',
    '  const [filter, setFilter] = useState<"all" | HybridSessionKind>("all");\n  const [status, setStatus] = useState("");\n  const [busy, setBusy] = useState(false);\n',
)
replace_once(
    "src/components/HybridHistory.tsx",
    '''  function clearAll() {
    if (!window.confirm("Clear all hybrid session history? Lifting history will not be touched.")) return;
    localStorage.removeItem(HYBRID_HISTORY_KEY);
    setSessions([]);
  }
''',
    '''  async function clearAll() {
    if (!window.confirm("Clear all hybrid session history? A safety snapshot will be created first. Lifting history will not be touched.")) return;
    setBusy(true);
    try {
      await createSafetySnapshot("Before clearing hybrid session history");
      localStorage.removeItem(HYBRID_HISTORY_KEY);
      setSessions([]);
      setStatus("Hybrid history cleared. A safety snapshot was created first.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Could not clear hybrid history safely.");
    } finally {
      setBusy(false);
    }
  }
''',
)
replace_once(
    "src/components/HybridHistory.tsx",
    '      <div className="hh-list">',
    '      {status && <div className="ti-status" role="status">{status}</div>}\n      <div className="hh-list">',
)
replace_once(
    "src/components/HybridHistory.tsx",
    '<button className="hh-clear" onClick={clearAll}>Clear hybrid history</button>',
    '<button className="hh-clear" disabled={busy} onClick={() => void clearAll()}>{busy ? "Creating snapshot…" : "Clear hybrid history"}</button>',
)

# 5) Force installed PWAs onto a fresh shell and make v1.6 routes available offline.
replace_once("public/sw.js", 'const CACHE = "workout-tracker-v1.4-workout-flow";', 'const CACHE = "workout-tracker-v1.6.1-stability";')
replace_once(
    "public/sw.js",
    'const OPTIONAL_SHELL = ["/gym", "/history", "/progress", "/bodyweight", "/prs", "/routines", "/data", "/health", "/watch"];',
    'const OPTIONAL_SHELL = ["/gym", "/history", "/progress", "/bodyweight", "/prs", "/routines", "/data", "/health", "/watch", "/plan", "/session"];',
)

# 6) Release metadata should match the actual app version.
replace_once("package.json", '"version": "1.4.0"', '"version": "1.6.1"')
replace_once("package-lock.json", '"version": "1.4.0"', '"version": "1.6.1"')
replace_once("package-lock.json", '"version": "1.4.0"', '"version": "1.6.1"')

print("v1.6.1 stability patch applied")
