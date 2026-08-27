import ActivityKit
import Foundation

final class LiveActivityManager {
    private var activity: Activity<WorkoutActivityAttributes>?

    func sync(with session: SyncedWorkoutSession?) {
        guard #available(iOS 16.2, *) else { return }
        Task { await syncAsync(with: session) }
    }

    @available(iOS 16.2, *)
    private func syncAsync(with session: SyncedWorkoutSession?) async {
        guard let session else {
            if let activity {
                await activity.end(nil, dismissalPolicy: .immediate)
                self.activity = nil
            }
            return
        }

        let state = WorkoutActivityAttributes.ContentState(
            currentExercise: session.currentExercise?.name ?? "Workout",
            completedSets: session.completedSetCount,
            totalSets: session.totalSetCount,
            restEndsAt: SyncISO8601.date(from: session.restEndsAt)
        )
        let content = ActivityContent(state: state, staleDate: state.restEndsAt)

        if let activity {
            await activity.update(content)
        } else {
            let attributes = WorkoutActivityAttributes(sessionID: session.id, workoutName: session.name)
            self.activity = try? Activity.request(attributes: attributes, content: content, pushType: nil)
        }
    }
}
