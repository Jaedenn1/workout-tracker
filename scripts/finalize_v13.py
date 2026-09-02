from pathlib import Path

root = Path('.')

package = root / 'package.json'
text = package.read_text()
if '"version": "1.2.3"' not in text:
    raise SystemExit('package.json version marker not found')
package.write_text(text.replace('"version": "1.2.3"', '"version": "1.3.0"', 1))

lock = root / 'package-lock.json'
text = lock.read_text()
count = text.count('"version": "1.2.3"')
if count < 2:
    raise SystemExit(f'package-lock version markers unexpected: {count}')
text = text.replace('"version": "1.2.3"', '"version": "1.3.0"', 2)
lock.write_text(text)

logger = root / 'src/components/FirstWorkoutGymLogger.tsx'
text = logger.read_text()
if 'Copy previous' not in text:
    raise SystemExit('Copy previous marker not found')
text = text.replace('Copy previous', 'Use previous')
text = text.replace('FIRST WORKOUT READY', 'TRAINING INTELLIGENCE')
logger.write_text(text)

watch = root / 'ios/WorkoutTrackerNative/WorkoutTrackerWatchApp/WatchContentView.swift'
watch.write_text(r'''import SwiftUI
import WatchKit

struct WatchContentView: View {
    @EnvironmentObject private var store: WorkoutConnectivityStore

    private var currentSetInfo: (set: SyncedWorkoutSet, index: Int, total: Int)? {
        guard let exercise = store.session?.currentExercise, !exercise.sets.isEmpty else { return nil }
        let index = exercise.sets.firstIndex(where: { !$0.completed }) ?? max(0, exercise.sets.count - 1)
        return (exercise.sets[index], index, exercise.sets.count)
    }

    var body: some View {
        ScrollView {
            VStack(spacing: 10) {
                if let session = store.session, let exercise = session.currentExercise {
                    VStack(spacing: 3) {
                        Text(store.connectivityLabel)
                            .font(.caption2)
                            .foregroundStyle(.secondary)
                        Text(session.name)
                            .font(.caption2)
                            .foregroundStyle(.secondary)
                        Text(exercise.name)
                            .font(.headline)
                            .multilineTextAlignment(.center)
                            .lineLimit(2)
                    }

                    VStack(spacing: 4) {
                        HStack {
                            Text("WORKOUT")
                                .font(.caption2)
                                .foregroundStyle(.secondary)
                            Spacer()
                            Text("\(session.completedSetCount)/\(session.totalSetCount)")
                                .font(.caption2.monospacedDigit())
                        }
                        ProgressView(
                            value: Double(session.completedSetCount),
                            total: Double(max(session.totalSetCount, 1))
                        )
                    }

                    if let info = currentSetInfo {
                        let set = info.set
                        VStack(spacing: 8) {
                            Text("SET \(info.index + 1) OF \(info.total)")
                                .font(.caption2.weight(.semibold))
                                .foregroundStyle(.secondary)

                            HStack(alignment: .firstTextBaseline, spacing: 6) {
                                Text("\(set.weight ?? 0, specifier: \"%.0f\")")
                                    .font(.system(size: 30, weight: .bold, design: .rounded))
                                    .monospacedDigit()
                                Text("lb")
                                    .font(.caption)
                                    .foregroundStyle(.secondary)
                            }

                            Text("\(set.reps ?? 0) reps")
                                .font(.title3.bold())
                                .monospacedDigit()

                            HStack(spacing: 6) {
                                Button { store.adjustWeight(set.id, delta: -5) } label: {
                                    VStack(spacing: 1) { Text("−5").font(.headline); Text("LB").font(.system(size: 8)) }
                                }
                                Button { store.adjustWeight(set.id, delta: 5) } label: {
                                    VStack(spacing: 1) { Text("+5").font(.headline); Text("LB").font(.system(size: 8)) }
                                }
                            }

                            HStack(spacing: 6) {
                                Button { store.adjustReps(set.id, delta: -1) } label: {
                                    VStack(spacing: 1) { Text("−1").font(.headline); Text("REP").font(.system(size: 8)) }
                                }
                                Button { store.adjustReps(set.id, delta: 1) } label: {
                                    VStack(spacing: 1) { Text("+1").font(.headline); Text("REP").font(.system(size: 8)) }
                                }
                            }

                            Button {
                                guard !set.completed else { return }
                                WKInterfaceDevice.current().play(.success)
                                store.completeSet(set.id)
                            } label: {
                                Label(set.completed ? "Completed" : "Complete set", systemImage: set.completed ? "checkmark.circle.fill" : "checkmark.circle")
                                    .frame(maxWidth: .infinity)
                            }
                            .buttonStyle(.borderedProminent)
                            .disabled(set.completed)
                        }
                    }

                    if let end = SyncISO8601.date(from: session.restEndsAt), end > Date() {
                        RestCountdown(end: end)
                            .environmentObject(store)
                    }

                    Button {
                        WKInterfaceDevice.current().play(.click)
                        store.advanceExercise()
                    } label: {
                        Label("Next exercise", systemImage: "arrow.right.circle")
                    }
                    .buttonStyle(.bordered)
                } else {
                    Image(systemName: "iphone.and.arrow.forward")
                        .font(.largeTitle)
                    Text("No active workout")
                        .font(.headline)
                    Text("Start or import a session on iPhone. Your active exercise will appear here automatically.")
                        .multilineTextAlignment(.center)
                        .font(.footnote)
                        .foregroundStyle(.secondary)
                }
            }
            .padding(.horizontal, 6)
        }
    }
}

private struct RestCountdown: View {
    let end: Date
    @EnvironmentObject private var store: WorkoutConnectivityStore
    @State private var fired = false

    var body: some View {
        TimelineView(.periodic(from: .now, by: 1)) { context in
            let remaining = max(0, Int(end.timeIntervalSince(context.date).rounded(.up)))
            VStack(spacing: 6) {
                Text("REST")
                    .font(.caption2.weight(.semibold))
                    .foregroundStyle(.secondary)
                Text("\(remaining)s")
                    .font(.title2.monospacedDigit().bold())
                ProgressView(value: Double(remaining), total: Double(max(remaining, 1)))
                HStack {
                    Button("Skip") { store.endRest() }
                    Button("+30") { store.adjustRest(30) }
                }
            }
            .onChange(of: remaining) { value in
                guard value == 0, !fired else { return }
                fired = true
                WKInterfaceDevice.current().play(.notification)
                DispatchQueue.main.async { store.endRest() }
            }
        }
        .onChange(of: end) { _ in fired = false }
    }
}
''')

print('v1.3 final patch applied')
