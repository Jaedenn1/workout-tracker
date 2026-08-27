# Research Baseline

This project uses the deep-research comparison of Hevy, Liftin', Gravl, Strong, Alpha Progression, Fitbod, JEFIT, Workout.cool, Granite, and wger as its product reference.

## Product principles
1. Logging speed beats feature count.
2. Previous performance must be visible beside every working set.
3. The app must work reliably in the gym, including poor connectivity.
4. Workout history and progression data are first-class product features.
5. Avoid social feeds, coaching marketplaces, subscriptions, and nutrition scope in the core product.
6. Build our own clean product while selectively reusing permissively licensed components only when they materially reduce work.

## UX references
- Hevy: logging flow, previous-set visibility, PRs, routines.
- Liftin': automatic progression and Apple-first polish.
- Gravl: progression logic and performance-based recommendations.
- Strong: minimal logging, timers, Apple ecosystem ideas.
- Alpha Progression: hypertrophy-oriented progression concepts.
- Fitbod: later-stage recovery/adaptive ideas, not MVP.

## Open-source references
- Workout.cool: strongest code/reference candidate due to modern TypeScript/Next.js stack and MIT license.
- Granite: excellent offline-first architecture reference; AGPL means reuse requires care.
- wger: mature feature/reference source, but too large and broad as a foundation.

## Architecture direction
- TypeScript
- Next.js / React web app
- Mobile-first PWA
- Local-first workout session state
- Server persistence/sync later
- Private GitHub repository
- Deploy on Vercel or Cloudflare

## MVP workout flow
1. Pick routine.
2. Start workout.
3. Show previous performance for each exercise.
4. Enter weight + reps quickly.
5. Check off set.
6. Start rest timer automatically.
7. Finish workout.
8. Save session.
9. Detect PRs.
10. Generate next-session progression target.
