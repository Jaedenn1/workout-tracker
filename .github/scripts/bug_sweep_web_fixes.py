from pathlib import Path


def replace_once(path: str, old: str, new: str) -> None:
    p = Path(path)
    text = p.read_text()
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"Expected exactly one match in {path}, found {count}:\n{old}")
    p.write_text(text.replace(old, new, 1))


# Home: an inactive READY draft must not be advertised as an active workout.
replace_once(
    "app/page.tsx",
    'type DraftMap = Record<string, { startedAt?: string; exercises?: unknown[]; pausedAt?: string | null }>;',
    'type DraftMap = Record<string, { startedAt?: string | null; sessionActive?: boolean; exercises?: unknown[]; pausedAt?: string | null }>;',
)
replace_once(
    "app/page.tsx",
    '''function formatDuration(seconds = 0) {\n  const minutes = Math.max(0, Math.round(seconds / 60));\n  return `${minutes} min`;\n}\n''',
    '''function formatDuration(seconds = 0) {\n  const minutes = Math.max(0, Math.round(seconds / 60));\n  return `${minutes} min`;\n}\n\nfunction draftIsActive(draft: DraftMap[string] | null | undefined) {\n  if (!draft?.startedAt) return false;\n  const declaredActive = draft.sessionActive ?? true;\n  if (!declaredActive) return false;\n  const started = new Date(draft.startedAt).getTime();\n  const age = Date.now() - started;\n  return Number.isFinite(started) && age >= 0 && age <= 6 * 60 * 60 * 1000;\n}\n''',
)
replace_once(
    "app/page.tsx",
    '''  const recentWorkout = history[0] ?? null;\n  const currentDraft = activeRoutine ? drafts[activeRoutine.id] : null;\n''',
    '''  const recentWorkout = history[0] ?? null;\n  const currentDraft = activeRoutine ? drafts[activeRoutine.id] : null;\n  const activeDraft = draftIsActive(currentDraft) ? currentDraft : null;\n''',
)
for old, new in [
    ('            {currentDraft\n              ? currentDraft.pausedAt', '            {activeDraft\n              ? activeDraft.pausedAt'),
    ('          {currentDraft ? (currentDraft.pausedAt ? "Resume paused workout" : "Resume workout") : "Start workout"}', '          {activeDraft ? (activeDraft.pausedAt ? "Resume paused workout" : "Resume workout") : "Start workout"}'),
]:
    replace_once("app/page.tsx", old, new)

# History: await the durable IndexedDB mirror instead of sleeping for an arbitrary 40 ms.
replace_once(
    "src/components/HistoryManager.tsx",
    'import { createSafetySnapshot, db, removeWorkout } from "../lib/database";',
    'import { createSafetySnapshot, db, persistLegacyKey, removeWorkout } from "../lib/database";',
)
replace_once(
    "src/components/HistoryManager.tsx",
    '''      const history = rows.map((row) => row.id === corrected.id ? corrected : row.payload);\n      localStorage.setItem(HISTORY_KEY, JSON.stringify(history));\n      setStatus("Corrections saved. Volume/e1RM were recalculated; old PR labels were cleared for this edited workout.");\n      await new Promise((resolve) => window.setTimeout(resolve, 40));\n      await refresh(corrected.id);\n''',
    '''      const history = rows.map((row) => row.id === corrected.id ? corrected : row.payload);\n      const value = JSON.stringify(history);\n      localStorage.setItem(HISTORY_KEY, value);\n      await persistLegacyKey(HISTORY_KEY, value);\n      setStatus("Corrections saved. Volume/e1RM were recalculated; old PR labels were cleared for this edited workout.");\n      await refresh(corrected.id);\n''',
)

# Sync: use React state so enabling autosync actually starts the interval immediately.
replace_once(
    "src/components/AppTools.tsx",
    '  const autoSyncRef = useRef(false);\n  const lastSnapshotRef = useRef("");',
    '  const [autoSync, setAutoSync] = useState(false);\n  const lastSnapshotRef = useRef("");',
)
replace_once(
    "src/components/AppTools.tsx",
    '    autoSyncRef.current = localStorage.getItem(AUTO_SYNC_STORAGE) === "1";',
    '    setAutoSync(localStorage.getItem(AUTO_SYNC_STORAGE) === "1");',
)
replace_once(
    "src/components/AppTools.tsx",
    '    if (!syncKey || !autoSyncRef.current) return;',
    '    if (!syncKey || !autoSync) return;',
)
replace_once(
    "src/components/AppTools.tsx",
    '''          autoSyncRef.current = false;\n          setStatus("Cloud database not connected yet · IndexedDB data is safe");''',
    '''          setAutoSync(false);\n          localStorage.setItem(AUTO_SYNC_STORAGE, "0");\n          setStatus("Cloud database not connected yet · IndexedDB data is safe");''',
)
replace_once(
    "src/components/AppTools.tsx",
    '  }, [syncKey]);',
    '  }, [syncKey, autoSync]);',
)
replace_once(
    "src/components/AppTools.tsx",
    '''        autoSyncRef.current = true;\n        localStorage.setItem(AUTO_SYNC_STORAGE, "1");\n        lastSnapshotRef.current = JSON.stringify(payload.state);''',
    '''        setAutoSync(true);\n        localStorage.setItem(AUTO_SYNC_STORAGE, "1");\n        lastSnapshotRef.current = JSON.stringify(payload.state);''',
)
replace_once(
    "src/components/AppTools.tsx",
    '''      autoSyncRef.current = true;\n      localStorage.setItem(AUTO_SYNC_STORAGE, "1");\n      setStatus("Cloud backup restored");''',
    '''      setAutoSync(true);\n      localStorage.setItem(AUTO_SYNC_STORAGE, "1");\n      setStatus("Cloud backup restored");''',
)
if "autoSyncRef" in Path("src/components/AppTools.tsx").read_text():
    raise SystemExit("autoSyncRef references remain after patch")

# A cloud payload with no active routine must clear stale device selection.
replace_once(
    "src/components/AppTools.tsx",
    '  if (payload.state.activeRoutineId) localStorage.setItem(ACTIVE_ROUTINE_KEY, payload.state.activeRoutineId);',
    '  if (payload.state.activeRoutineId) localStorage.setItem(ACTIVE_ROUTINE_KEY, payload.state.activeRoutineId);\n  else localStorage.removeItem(ACTIVE_ROUTINE_KEY);',
)

# Navigation animation: cancel both RAFs and clear the leaving class after a route changes.
replace_once(
    "src/components/InteractionLayer.tsx",
    '''  useEffect(() => {\n    document.body.classList.remove("pc-route-enter");\n    const first = window.requestAnimationFrame(() => {\n      const second = window.requestAnimationFrame(() => document.body.classList.add("pc-route-enter"));\n      return () => window.cancelAnimationFrame(second);\n    });\n    return () => window.cancelAnimationFrame(first);\n  }, [pathname]);\n''',
    '''  useEffect(() => {\n    document.body.classList.remove("pc-route-enter", "pc-route-leave");\n    let second: number | null = null;\n    const first = window.requestAnimationFrame(() => {\n      second = window.requestAnimationFrame(() => document.body.classList.add("pc-route-enter"));\n    });\n    return () => {\n      window.cancelAnimationFrame(first);\n      if (second != null) window.cancelAnimationFrame(second);\n    };\n  }, [pathname]);\n''',
)

# Release marker + PWA cache bump.
replace_once("package.json", '  "version": "1.2.2",', '  "version": "1.2.3",')
replace_once("public/sw.js", 'const CACHE = "workout-tracker-v1.2.2";', 'const CACHE = "workout-tracker-v1.2.3";')

print("Patched confirmed web bugs for v1.2.3")
