import ActivityKit
import SwiftUI
import WidgetKit

@main
struct WorkoutLiveActivity: Widget {
    var body: some WidgetConfiguration {
        ActivityConfiguration(for: WorkoutActivityAttributes.self) { context in
            HStack(spacing: 14) {
                VStack(alignment: .leading, spacing: 4) {
                    Text(context.attributes.workoutName)
                        .font(.caption)
                        .foregroundStyle(.secondary)
                    Text(context.state.currentExercise)
                        .font(.headline)
                    Text("\(context.state.completedSets)/\(context.state.totalSets) sets")
                        .font(.caption2)
                        .foregroundStyle(.secondary)
                }
                Spacer()
                restText(context.state.restEndsAt)
            }
            .padding()
            .activityBackgroundTint(.black.opacity(0.9))
            .activitySystemActionForegroundColor(.white)
        } dynamicIsland: { context in
            DynamicIsland {
                DynamicIslandExpandedRegion(.leading) {
                    VStack(alignment: .leading) {
                        Text("Workout").font(.caption2)
                        Text("\(context.state.completedSets)/\(context.state.totalSets)")
                            .font(.headline)
                    }
                }
                DynamicIslandExpandedRegion(.trailing) {
                    restText(context.state.restEndsAt)
                }
                DynamicIslandExpandedRegion(.bottom) {
                    Text(context.state.currentExercise)
                        .font(.headline)
                        .lineLimit(1)
                }
            } compactLeading: {
                Text("🏋️")
            } compactTrailing: {
                compactRest(context.state.restEndsAt)
            } minimal: {
                Text("🏋️")
            }
        }
    }

    @ViewBuilder
    private func restText(_ end: Date?) -> some View {
        if let end, end > Date() {
            VStack(spacing: 2) {
                Text("REST").font(.caption2).foregroundStyle(.secondary)
                Text(timerInterval: Date()...end, countsDown: true)
                    .monospacedDigit()
                    .font(.headline)
            }
        } else {
            Text("GO")
                .font(.headline)
        }
    }

    @ViewBuilder
    private func compactRest(_ end: Date?) -> some View {
        if let end, end > Date() {
            Text(timerInterval: Date()...end, countsDown: true)
                .monospacedDigit()
                .font(.caption2)
        } else {
            Text("GO").font(.caption2.bold())
        }
    }
}
