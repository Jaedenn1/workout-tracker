# Workout Tracker

A fast, personal, offline-first lifting tracker.

## Core product goal
Open app → start routine → see previous performance → log weight/reps → complete sets → rest timer → finish workout → persistent history → PRs → simple progression.

## Current version: v0.2.0

v0.2 turns the original static scaffold into a usable local workout logger.

### Included now
- Interactive weight and rep entry for every working set
- Set completion checkboxes
- Previous-performance display beside each set
- Suggested load based on the previous session and rep range
- Automatic 90-second rest timer after completing a set
- Live workout duration
- Live completed-set and volume totals
- Add-set control for each exercise
- Automatic draft saving in browser localStorage
- Resume the current workout after refreshing or reopening the page
- Finish Workout flow
- Persistent local workout history
- Most recent completed workout becomes the next session's previous performance
- Mobile-first gym UI

### Current starter routine
- Leg Extensions
- Pendulum / Hack Squat
- Smith Romanian Deadlift
- Bulgarian Split Squat
- Hamstring Curl
- Leg Press
- Calf Raises

## Storage in v0.2
Workout drafts and history currently live in the browser using `localStorage`. This is intentionally local-first for the first functional version. Cross-device sync and a server database come later.

## Next direction
The next major work is to separate the logger into reusable routine/workout components, add editable routines and exercise selection, improve PR detection/progression, then add a real sync layer and PWA installation.

See `docs/RESEARCH_BASELINE.md` for the research and product decisions guiding the build.
