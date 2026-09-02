from pathlib import Path
import re

root = Path('.')
logger = root / 'src/components/FirstWorkoutGymLogger.tsx'
text = logger.read_text()

# Imports
progression_import = '} from "../lib/progression";\n'
if progression_import not in text:
    raise SystemExit('progression import marker not found')
flow_imports = '''} from "../lib/progression";\nimport { READINESS_KEY, safeArray, type ReadinessRecord } from "../lib/trainingIntelligence";\nimport {\n  beatLastTimeTarget,\n  completedWorkoutComparison,\n  liveMatchedDelta,\n  nextSetCue,\n  previousWorkoutForRoutine,\n  readinessForToday,\n  readinessGuidance,\n  recentExerciseHistory,\n} from "../lib/workoutFlow";\n'''
text = text.replace(progression_import, flow_imports, 1)

# Summary shape
summary_marker = '''type WorkoutSummary = {\n  name: string;\n  sets: number;\n  volume: number;\n  duration: number;\n  prs: string[];\n  nextTarget?: string;\n};'''
if summary_marker not in text:
    raise SystemExit('WorkoutSummary marker not found')
text = text.replace(summary_marker, summary_marker.replace('  nextTarget?: string;\n', '  nextTarget?: string;\n  comparison?: string[];\n'), 1)

# Readiness state
state_marker = '  const [lastSummary, setLastSummary] = useState<WorkoutSummary | null>(null);\n'
if state_marker not in text:
    raise SystemExit('lastSummary state marker not found')
text = text.replace(state_marker, state_marker + '  const [todayReadiness, setTodayReadiness] = useState<ReadinessRecord | null>(null);\n', 1)

# Readiness hydrate
hydrate_marker = '    setRestSound(localStorage.getItem(REST_SOUND_KEY) === "1");\n'
if hydrate_marker not in text:
    raise SystemExit('rest sound hydrate marker not found')
text = text.replace(hydrate_marker, hydrate_marker + '    setTodayReadiness(readinessForToday(safeArray<ReadinessRecord>(localStorage.getItem(READINESS_KEY))));\n', 1)

# Live workout comparison memos
stats_end = '  }, [exercises]);\n\n  const filteredDefinitions = useMemo(() => {'
if stats_end not in text:
    raise SystemExit('stats end marker not found')
flow_memos = '''  }, [exercises]);\n\n  const previousRoutineWorkout = useMemo(\n    () => previousWorkoutForRoutine(history, activeRoutine.id, activeRoutine.name),\n    [history, activeRoutine.id, activeRoutine.name],\n  );\n  const liveDelta = useMemo(\n    () => liveMatchedDelta(exercises, previousRoutineWorkout),\n    [exercises, previousRoutineWorkout],\n  );\n  const readinessNote = useMemo(() => readinessGuidance(todayReadiness), [todayReadiness]);\n\n  const filteredDefinitions = useMemo(() => {'''
text = text.replace(stats_end, flow_memos, 1)

# Prefilling is setup, not a logged set: it must not start the timer.
copy_pattern = re.compile(r'(  function copyPrevious\(exerciseId: string, setId: string, index: number\) \{)\n    ensureSessionStarted\(\);')
text, count = copy_pattern.subn(r'\1', text, count=1)
if count != 1:
    raise SystemExit(f'copyPrevious patch count {count}')

# Full exercise previous-session autofill
focus_marker = '  function focusNextSet(exerciseId: string, setId: string) {'
if focus_marker not in text:
    raise SystemExit('focusNextSet marker not found')
use_all = '''  function useAllPrevious(exerciseId: string) {\n    const target = exercises.find((exercise) => exercise.id === exerciseId);\n    if (!target?.previous.length) {\n      setNotice("No previous performance is available for this exercise yet.");\n      return;\n    }\n    snapshotUndo("Used previous exercise values");\n    setExercises((current) =>\n      current.map((exercise) =>\n        exercise.id !== exerciseId\n          ? exercise\n          : {\n              ...exercise,\n              sets: exercise.sets.map((set, index) => {\n                if (set.completed) return set;\n                const previous = exercise.previous[index];\n                if (!previous) return set;\n                return { ...set, weight: previous.weight, reps: previous.reps, rir: previous.rir ?? null };\n              }),\n            },\n      ),\n    );\n    setCollapsed((current) => ({ ...current, [exerciseId]: false }));\n    setNotice(`Loaded last session values for ${target.name}. Timer stays at 0:00 until you actually start/log a set.`);\n  }\n\n'''
text = text.replace(focus_marker, use_all + focus_marker, 1)

# Post-workout comparison baseline
finish_marker = '''  function finishWorkout() {\n    const working = exercises.flatMap((exercise) => workingPerformance(exercise.sets));'''
if finish_marker not in text:
    raise SystemExit('finishWorkout marker not found')
text = text.replace(finish_marker, '''  function finishWorkout() {\n    const previousRoutine = previousWorkoutForRoutine(history, activeRoutine.id, activeRoutine.name);\n    const working = exercises.flatMap((exercise) => workingPerformance(exercise.sets));''', 1)

summary_set_marker = '''      prs,\n      nextTarget: nextExercises[0]?.recommendation,\n    });'''
if summary_set_marker not in text:
    raise SystemExit('setLastSummary marker not found')
text = text.replace(summary_set_marker, '''      prs,\n      nextTarget: nextExercises[0]?.recommendation,\n      comparison: completedWorkoutComparison(item, previousRoutine),\n    });''', 1)

# Header flow strips before rest timer
rest_marker = '      <section className={`gym-rest-strip ${restRemaining ? "active" : ""} ${pausedAt ? "paused" : ""}`}>\n'
if rest_marker not in text:
    raise SystemExit('rest strip marker not found')
flow_header = '''      {readinessNote && readinessNote.tone !== "good" && (\n        <section className={`flow-readiness flow-${readinessNote.tone}`}>\n          <div><span>READINESS</span><strong>{readinessNote.title}</strong></div>\n          <p>{readinessNote.message}</p>\n        </section>\n      )}\n\n      {previousRoutineWorkout && (\n        <section className="flow-live-compare">\n          <div>\n            <span>LIVE VS LAST {activeRoutine.name.toUpperCase()}</span>\n            <strong>{liveDelta ? `${liveDelta.matchedSets} matched sets` : "Waiting for your first completed set"}</strong>\n          </div>\n          {liveDelta ? (\n            <div className="flow-live-metrics">\n              <span><b>{liveDelta.repDelta >= 0 ? "+" : ""}{liveDelta.repDelta}</b> reps</span>\n              <span><b>{liveDelta.volumeDelta >= 0 ? "+" : ""}{Math.round(liveDelta.volumeDelta).toLocaleString()}</b> lb</span>\n              <span><b>{liveDelta.e1rmDelta == null ? "—" : `${liveDelta.e1rmDelta >= 0 ? "+" : ""}${Math.round(liveDelta.e1rmDelta)}`}</b> e1RM</span>\n            </div>\n          ) : <small>Comparison activates as working sets are completed.</small>}\n        </section>\n      )}\n\n'''
text = text.replace(rest_marker, flow_header + rest_marker, 1)

# Per-exercise flow calculations
collapse_marker = '          const isCollapsed = Boolean(collapsed[exercise.id]);\n'
if collapse_marker not in text:
    raise SystemExit('exercise calculated marker not found')
text = text.replace(collapse_marker, collapse_marker + '''          const beatTarget = beatLastTimeTarget(exercise);\n          const nextCue = nextSetCue(exercise);\n          const recentSessions = recentExerciseHistory(history, exercise.id, 3);\n''', 1)

# Replace the old target strip with actionable workout flow guidance.
target_marker = '                  <div className="gym-target"><strong>{exercise.recommendation}</strong><span>Previous workout: {exercise.previous.length ? exercise.previous.map(previousLabel).join(" · ") : "none"}</span></div>\n'
if target_marker not in text:
    raise SystemExit('gym target marker not found')
flow_target = '''                  <div className="flow-progression-card">\n                    <span>{actionLabel(exercise.progressionAction)}</span>\n                    <strong>{exercise.recommendation}</strong>\n                  </div>\n\n                  <div className="flow-beat-card">\n                    <div>\n                      <span>BEAT LAST TIME</span>\n                      <strong>{beatTarget.label}</strong>\n                      <small>{beatTarget.detail}</small>\n                    </div>\n                    <button onClick={() => useAllPrevious(exercise.id)} disabled={!exercise.previous.length}>Use all previous</button>\n                  </div>\n\n                  {nextCue && (\n                    <div className="flow-next-cue">\n                      <span>NEXT · SET {nextCue.setNumber}</span>\n                      <strong>{nextCue.target}</strong>\n                      <small>Previous: {nextCue.previous} · aim for honest RIR, not forced reps.</small>\n                    </div>\n                  )}\n\n                  <details className="flow-history-dropdown">\n                    <summary>Last 3 sessions <span>{recentSessions.length ? `${recentSessions.length} logged` : "No history"}</span></summary>\n                    <div className="flow-history-list">\n                      {recentSessions.length ? recentSessions.map((row) => (\n                        <div className="flow-history-row" key={row.workoutId}>\n                          <span>{new Date(row.completedAt).toLocaleDateString(undefined, { month: "short", day: "numeric" })}</span>\n                          <strong>{row.sets.map((set) => `${set.weight}×${set.reps}${set.rir == null ? "" : ` @${set.rir}`}`).join(" · ")}</strong>\n                        </div>\n                      )) : <p>No previous sessions for this exercise yet.</p>}\n                    </div>\n                  </details>\n'''
text = text.replace(target_marker, flow_target, 1)

# Richer post-workout review
summary_target_marker = '          {lastSummary.nextTarget && <p className="gym-summary-next"><span>Next target</span><strong>{lastSummary.nextTarget}</strong></p>}\n'
if summary_target_marker not in text:
    raise SystemExit('post summary target marker not found')
text = text.replace(summary_target_marker, summary_target_marker + '''          {lastSummary.comparison && lastSummary.comparison.length > 0 && (\n            <div className="flow-summary-compare">\n              <span>VS LAST MATCHING WORKOUT</span>\n              <div>{lastSummary.comparison.map((line) => <strong key={line}>{line}</strong>)}</div>\n            </div>\n          )}\n''', 1)

logger.write_text(text)

# V1.4 styling
(root / 'app/v19.css').write_text(r'''.flow-readiness,.flow-live-compare,.flow-beat-card,.flow-next-cue,.flow-progression-card,.flow-summary-compare{border:1px solid rgba(255,255,255,.08);border-radius:18px;background:linear-gradient(180deg,rgba(255,255,255,.045),rgba(255,255,255,.018));box-shadow:inset 0 1px 0 rgba(255,255,255,.045),0 12px 28px rgba(0,0,0,.18)}
.flow-readiness{display:grid;grid-template-columns:minmax(150px,.65fr) 1.35fr;gap:18px;align-items:center;padding:14px 16px;margin:0 0 12px}.flow-readiness div{display:flex;flex-direction:column;gap:3px}.flow-readiness span,.flow-live-compare span,.flow-beat-card span,.flow-next-cue span,.flow-progression-card span,.flow-summary-compare>span{font-size:10px;letter-spacing:.13em;font-weight:800;color:#a9b09f}.flow-readiness strong{font-size:15px}.flow-readiness p{margin:0;color:#d8dacd;font-size:13px;line-height:1.45}.flow-readiness.flow-caution{border-color:rgba(255,188,75,.28)}.flow-readiness.flow-watch{border-color:rgba(216,255,74,.18)}
.flow-live-compare{display:flex;justify-content:space-between;align-items:center;gap:18px;padding:14px 16px;margin:0 0 12px}.flow-live-compare>div:first-child{display:flex;flex-direction:column;gap:4px}.flow-live-compare>div:first-child strong{font-size:16px}.flow-live-compare small{color:#a8ad9e}.flow-live-metrics{display:grid;grid-template-columns:repeat(3,minmax(72px,1fr));gap:7px}.flow-live-metrics span{display:flex;flex-direction:column;gap:2px;padding:7px 9px;border-radius:12px;background:rgba(0,0,0,.28);letter-spacing:0;color:#969d8c;font-weight:600}.flow-live-metrics b{font-size:14px;color:#e7ff72}
.flow-progression-card{display:flex;align-items:center;gap:10px;padding:10px 12px;margin:8px 0}.flow-progression-card span{flex:0 0 auto;color:#d9ff4f}.flow-progression-card strong{font-size:12px;color:#d9dccf;font-weight:650}
.flow-beat-card{display:flex;justify-content:space-between;align-items:center;gap:14px;padding:14px;margin:8px 0;border-color:rgba(216,255,74,.17);background:radial-gradient(circle at 12% 0,rgba(216,255,74,.09),transparent 46%),rgba(255,255,255,.025)}.flow-beat-card>div{display:flex;flex-direction:column;gap:3px}.flow-beat-card span{color:#d9ff4f}.flow-beat-card strong{font-size:20px;letter-spacing:-.025em}.flow-beat-card small{color:#aab09f;line-height:1.35}.flow-beat-card button{min-height:40px;border-radius:12px;padding:0 13px;border:1px solid rgba(216,255,74,.28);background:#d9ff4f;color:#0a0b08;font-weight:850}.flow-beat-card button:disabled{opacity:.35}
.flow-next-cue{display:grid;grid-template-columns:auto 1fr;gap:2px 12px;align-items:center;padding:11px 13px;margin:8px 0}.flow-next-cue strong{font-size:15px;color:#f2f4e8}.flow-next-cue small{grid-column:1/-1;color:#999f90}
.flow-history-dropdown{margin:8px 0;border:1px solid rgba(255,255,255,.075);border-radius:14px;background:rgba(0,0,0,.16);overflow:hidden}.flow-history-dropdown summary{display:flex;justify-content:space-between;gap:10px;padding:11px 13px;cursor:pointer;font-size:12px;font-weight:800}.flow-history-dropdown summary span{font-size:10px;color:#8f9686}.flow-history-list{padding:0 10px 10px;display:grid;gap:6px}.flow-history-row{display:grid;grid-template-columns:65px 1fr;gap:10px;align-items:start;padding:8px 9px;border-radius:10px;background:rgba(255,255,255,.027)}.flow-history-row span{font-size:10px;color:#92998a}.flow-history-row strong{font-size:11px;line-height:1.4;color:#dfe2d5}.flow-history-list p{margin:0;padding:8px;color:#92998a;font-size:11px}
.flow-summary-compare{margin-top:10px;padding:13px}.flow-summary-compare>span{color:#d9ff4f}.flow-summary-compare>div{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:7px;margin-top:8px}.flow-summary-compare strong{padding:8px 10px;border-radius:11px;background:rgba(0,0,0,.28);font-size:12px}
@media(max-width:700px){.flow-readiness{grid-template-columns:1fr;gap:8px}.flow-live-compare{align-items:stretch;flex-direction:column}.flow-live-metrics{width:100%}.flow-beat-card{align-items:stretch;flex-direction:column}.flow-beat-card button{width:100%}.flow-summary-compare>div{grid-template-columns:1fr}}
''')

# Import v19
layout = root / 'app/layout.tsx'
layout_text = layout.read_text()
if 'import "./v18.css";' not in layout_text:
    raise SystemExit('v18 layout import marker missing')
layout.write_text(layout_text.replace('import "./v18.css";', 'import "./v18.css";\nimport "./v19.css";', 1))

# Home release label
home = root / 'src/components/TodayDashboard.tsx'
home_text = home.read_text()
if 'TODAY · V1.3' not in home_text:
    raise SystemExit('Today v1.3 marker missing')
home.write_text(home_text.replace('TODAY · V1.3', 'TODAY · V1.4', 1))

# Package + lock release version
package = root / 'package.json'
pkg = package.read_text()
if '"version": "1.3.0"' not in pkg:
    raise SystemExit('package v1.3 marker missing')
package.write_text(pkg.replace('"version": "1.3.0"', '"version": "1.4.0"', 1))

lock = root / 'package-lock.json'
lock_text = lock.read_text()
if lock_text.count('"version": "1.3.0"') < 2:
    raise SystemExit('package-lock v1.3 markers missing')
lock.write_text(lock_text.replace('"version": "1.3.0"', '"version": "1.4.0"', 2))

# PWA release cache
sw = root / 'public/sw.js'
sw_text = sw.read_text()
old_cache = 'workout-tracker-v1.3-training-intelligence'
if old_cache not in sw_text:
    raise SystemExit('v1.3 cache marker missing')
sw.write_text(sw_text.replace(old_cache, 'workout-tracker-v1.4-workout-flow', 1))

print('v1.4 Workout Flow patch applied')
