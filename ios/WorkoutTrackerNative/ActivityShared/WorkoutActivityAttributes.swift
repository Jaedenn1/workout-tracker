import ActivityKit
import Foundation

struct WorkoutActivityAttributes: ActivityAttributes {
    struct ContentState: Codable, Hashable {
        var currentExercise: String
        var completedSets: Int
        var totalSets: Int
        var restEndsAt: Date?
    }

    let sessionID: String
    let workoutName: String
}
