import Foundation

struct SyncedWorkoutSet: Codable, Identifiable, Equatable, Hashable {
    let id: String
    var weight: Double?
    var reps: Int?
    var completed: Bool
}

struct SyncedWorkoutExercise: Codable, Identifiable, Equatable, Hashable {
    let id: String
    let name: String
    let restSeconds: Int
    var sets: [SyncedWorkoutSet]
}

struct SyncedWorkoutSession: Codable, Identifiable, Equatable, Hashable {
    let version: Int
    var revision: Int
    let id: String
    let name: String
    let startedAt: String
    var activeExerciseIndex: Int
    var restEndsAt: String?
    var exercises: [SyncedWorkoutExercise]

    var currentExercise: SyncedWorkoutExercise? {
        guard exercises.indices.contains(activeExerciseIndex) else { return nil }
        return exercises[activeExerciseIndex]
    }

    var completedSetCount: Int {
        exercises.flatMap(\.sets).filter(\.completed).count
    }

    var totalSetCount: Int {
        exercises.reduce(0) { $0 + $1.sets.count }
    }
}

enum WorkoutActionKind: String, Codable {
    case completeSet
    case updateSet
    case advanceExercise
    case adjustRest
    case endRest
}

struct WorkoutAction: Codable, Identifiable, Equatable, Hashable {
    let id: String
    let sessionID: String
    let kind: WorkoutActionKind
    let setID: String?
    let weight: Double?
    let reps: Int?
    let deltaSeconds: Int?
    let createdAt: String
}

struct WorkoutSyncEnvelope: Codable, Equatable {
    let revision: Int
    let sender: String
    let session: SyncedWorkoutSession
    let actionID: String?
}

enum SyncISO8601 {
    private static let fractional: ISO8601DateFormatter = {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return formatter
    }()

    private static let basic: ISO8601DateFormatter = {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime]
        return formatter
    }()

    static func string(from date: Date) -> String {
        fractional.string(from: date)
    }

    static func date(from value: String?) -> Date? {
        guard let value else { return nil }
        return fractional.date(from: value) ?? basic.date(from: value)
    }
}

enum WorkoutSessionReducer {
    @discardableResult
    static func apply(_ action: WorkoutAction, to session: inout SyncedWorkoutSession, processed: inout Set<String>) -> Bool {
        guard action.sessionID == session.id else { return false }
        guard !processed.contains(action.id) else { return false }
        processed.insert(action.id)

        switch action.kind {
        case .completeSet:
            guard let setID = action.setID,
                  let exerciseIndex = session.exercises.firstIndex(where: { $0.sets.contains(where: { $0.id == setID }) }),
                  let setIndex = session.exercises[exerciseIndex].sets.firstIndex(where: { $0.id == setID })
            else { return false }

            session.exercises[exerciseIndex].sets[setIndex].completed = true
            session.activeExerciseIndex = exerciseIndex
            let rest = max(0, session.exercises[exerciseIndex].restSeconds)
            session.restEndsAt = rest > 0 ? SyncISO8601.string(from: Date().addingTimeInterval(TimeInterval(rest))) : nil

        case .updateSet:
            guard let setID = action.setID,
                  let exerciseIndex = session.exercises.firstIndex(where: { $0.sets.contains(where: { $0.id == setID }) }),
                  let setIndex = session.exercises[exerciseIndex].sets.firstIndex(where: { $0.id == setID })
            else { return false }

            if let weight = action.weight { session.exercises[exerciseIndex].sets[setIndex].weight = max(0, weight) }
            if let reps = action.reps { session.exercises[exerciseIndex].sets[setIndex].reps = max(0, reps) }

        case .advanceExercise:
            guard !session.exercises.isEmpty else { return false }
            session.activeExerciseIndex = min(session.activeExerciseIndex + 1, session.exercises.count - 1)

        case .adjustRest:
            let delta = action.deltaSeconds ?? 0
            let base = max(Date(), SyncISO8601.date(from: session.restEndsAt) ?? Date())
            session.restEndsAt = SyncISO8601.string(from: base.addingTimeInterval(TimeInterval(delta)))

        case .endRest:
            session.restEndsAt = nil
        }

        session.revision += 1
        return true
    }
}
