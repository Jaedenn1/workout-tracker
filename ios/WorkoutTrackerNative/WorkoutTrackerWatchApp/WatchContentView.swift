import SwiftUI
import WatchKit

struct WatchContentView: View {
    @EnvironmentObject private var store: WorkoutConnectivityStore

    private var currentSet: SyncedWorkoutSet? {
        guard let exercise = store.session?.currentExercise else { return nil }
        return exercise.sets.first(where: { !$0.completed }) ?? exercise.sets.last
    }

    var body: some View {
        ScrollView {
            VStack(spacing: 10) {
                Text(store.connectivityLabel)
                    .font(.caption2)
                    .foregroundStyle(.secondary)

                if let session = store.session, let exercise = session.currentExercise {
                    Text(session.name)
                        .font(.caption)
                        .foregroundStyle(.secondary)
                    Text(exercise.name)
                        .font(.headline)
                        .multilineTextAlignment(.center)

                    Text("\(session.completedSetCount)/\(session.totalSetCount) sets")
                        .font(.caption2)
                        .foregroundStyle(.secondary)

                    if let set = currentSet {
                        VStack(spacing: 8) {
                            Text("\(set.weight ?? 0, specifier: "%.0f") lb")
                                .font(.title2.bold())
                            Text("\(set.reps ?? 0) reps")
                                .font(.headline)

                            HStack {
                                Button("−5") { store.adjustWeight(set.id, delta: -5) }
                                Button("+5") { store.adjustWeight(set.id, delta: 5) }
                            }
                            HStack {
                                Button("−1") { store.adjustReps(set.id, delta: -1) }
                                Button("+1") { store.adjustReps(set.id, delta: 1) }
                            }

                            Button(set.completed ? "Completed" : "Complete set") {
                                if !set.completed { store.completeSet(set.id) }
                            }
                            .buttonStyle(.borderedProminent)
                            .disabled(set.completed)
                        }
                    }

                    if let end = SyncISO8601.date(from: session.restEndsAt), end > Date() {
                        RestCountdown(end: end)
                            .environmentObject(store)
                    }

                    Button("Next exercise") { store.advanceExercise() }
                        .buttonStyle(.bordered)
                } else {
                    Image(systemName: "iphone.and.arrow.forward")
                        .font(.largeTitle)
                    Text("Open the iPhone Workout app and import a Watch Session.")
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
                    .font(.caption2)
                    .foregroundStyle(.secondary)
                Text("\(remaining)s")
                    .font(.title2.monospacedDigit().bold())
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
