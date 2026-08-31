import Combine
import Foundation
import HealthKit

@MainActor
final class HealthKitManager: ObservableObject {
    @Published var accessState = "Not requested"
    @Published var recentBodyweight: [HealthBodyweight] = []
    @Published var recentWorkouts: [HealthWorkout] = []
    @Published var lastMessage = "HealthKit is optional. Gym Mode works without it."
    @Published var isBusy = false

    private let store = HKHealthStore()
    private let sourceIDKey = "com.jaedenn.workouttracker.sourceID"
    private let sourceNameKey = "com.jaedenn.workouttracker.name"
    private let writtenIDsKey = "com.jaedenn.workouttracker.healthkit.writtenIDs"

    private var bodyMassType: HKQuantityType? {
        HKQuantityType.quantityType(forIdentifier: .bodyMass)
    }

    func requestAccess() async {
        guard HKHealthStore.isHealthDataAvailable() else {
            accessState = "Unavailable"
            lastMessage = "Apple Health data is not available on this device."
            return
        }
        guard let bodyMassType else {
            accessState = "Unavailable"
            lastMessage = "Body-mass HealthKit type is unavailable."
            return
        }

        isBusy = true
        defer { isBusy = false }

        let workoutType = HKObjectType.workoutType()
        let share: Set<HKSampleType> = [bodyMassType, workoutType]
        let read: Set<HKObjectType> = [bodyMassType, workoutType]

        do {
            try await store.requestAuthorization(toShare: share, read: read)
            accessState = "Request completed"
            lastMessage = "Health permission request completed. Apple keeps read-denial status private, so refresh to see available data."
            await refresh()
        } catch {
            accessState = "Request failed"
            lastMessage = error.localizedDescription
        }
    }

    func refresh() async {
        guard HKHealthStore.isHealthDataAvailable() else { return }
        isBusy = true
        defer { isBusy = false }

        do {
            async let weights = fetchBodyweight(limit: 100)
            async let workouts = fetchStrengthWorkouts(limit: 100)
            recentBodyweight = try await weights
            recentWorkouts = try await workouts
            lastMessage = "Loaded \(recentWorkouts.count) recent strength workouts and \(recentBodyweight.count) bodyweight samples."
        } catch {
            lastMessage = "Could not refresh Health data: \(error.localizedDescription)"
        }
    }

    func writeSelected(bodyweight: [BridgeBodyweight], workouts: [BridgeWorkout]) async {
        guard HKHealthStore.isHealthDataAvailable() else {
            lastMessage = "Apple Health data is not available on this device."
            return
        }

        isBusy = true
        defer { isBusy = false }

        var writtenWeights = 0
        var writtenWorkouts = 0
        var invalidEntries = 0
        var duplicateEntries = 0

        do {
            for entry in bodyweight {
                guard let date = ISO8601Bridge.date(from: entry.recordedAt) else {
                    invalidEntries += 1
                    continue
                }
                if try await saveBodyweight(entry, at: date) {
                    writtenWeights += 1
                } else {
                    duplicateEntries += 1
                }
            }

            for entry in workouts {
                guard
                    let start = ISO8601Bridge.date(from: entry.startedAt),
                    let end = ISO8601Bridge.date(from: entry.completedAt),
                    end > start
                else {
                    invalidEntries += 1
                    continue
                }
                if try await saveWorkout(entry, start: start, end: end) {
                    writtenWorkouts += 1
                } else {
                    duplicateEntries += 1
                }
            }

            var suffixes: [String] = []
            if duplicateEntries > 0 { suffixes.append("skipped \(duplicateEntries) already-saved entries") }
            if invalidEntries > 0 { suffixes.append("skipped \(invalidEntries) invalid entries") }
            let suffix = suffixes.isEmpty ? "" : "; " + suffixes.joined(separator: ", ")
            lastMessage = "Saved \(writtenWorkouts) workouts and \(writtenWeights) bodyweight entries to Apple Health\(suffix)."
            await refresh()
        } catch {
            lastMessage = "Apple Health write failed: \(error.localizedDescription)"
        }
    }

    func makeExportEnvelope() -> HealthBridgeEnvelope {
        HealthBridgeEnvelope(
            version: 1,
            exportedAt: ISO8601Bridge.string(from: Date()),
            source: "apple-health-v0.8",
            bodyweight: recentBodyweight.map {
                BridgeBodyweight(
                    id: $0.id,
                    recordedAt: ISO8601Bridge.string(from: $0.recordedAt),
                    pounds: $0.pounds
                )
            },
            workouts: recentWorkouts.map {
                BridgeWorkout(
                    id: $0.id,
                    name: $0.name,
                    startedAt: ISO8601Bridge.string(from: $0.startedAt),
                    completedAt: ISO8601Bridge.string(from: $0.completedAt),
                    durationSeconds: $0.durationSeconds,
                    totalVolume: nil,
                    completedSets: nil
                )
            }
        )
    }

    private func saveBodyweight(_ entry: BridgeBodyweight, at date: Date) async throws -> Bool {
        guard let bodyMassType else { return false }
        let localID = "bodyweight:\(entry.id)"
        if try await alreadySaved(sampleType: bodyMassType, sourceID: entry.id, localID: localID) {
            return false
        }

        let quantity = HKQuantity(unit: HKUnit.pound(), doubleValue: entry.pounds)
        let sample = HKQuantitySample(
            type: bodyMassType,
            quantity: quantity,
            start: date,
            end: date,
            metadata: [sourceIDKey: entry.id]
        )
        try await store.save(sample)
        rememberWritten(localID)
        return true
    }

    private func saveWorkout(_ entry: BridgeWorkout, start: Date, end: Date) async throws -> Bool {
        let workoutType = HKObjectType.workoutType()
        let localID = "workout:\(entry.id)"
        if try await alreadySaved(sampleType: workoutType, sourceID: entry.id, localID: localID) {
            return false
        }

        let configuration = HKWorkoutConfiguration()
        configuration.activityType = .traditionalStrengthTraining
        configuration.locationType = .indoor

        let builder = HKWorkoutBuilder(
            healthStore: store,
            configuration: configuration,
            device: HKDevice.local()
        )

        try await builder.beginCollection(at: start)
        var metadata: [String: Any] = [
            sourceIDKey: entry.id,
            sourceNameKey: entry.name
        ]
        if let totalVolume = entry.totalVolume { metadata["com.jaedenn.workouttracker.totalVolume"] = totalVolume }
        if let completedSets = entry.completedSets { metadata["com.jaedenn.workouttracker.completedSets"] = completedSets }
        try await builder.addMetadata(metadata)
        try await builder.endCollection(at: end)
        _ = try await builder.finishWorkout()
        rememberWritten(localID)
        return true
    }

    private func alreadySaved(sampleType: HKSampleType, sourceID: String, localID: String) async throws -> Bool {
        if locallyWrittenIDs.contains(localID) {
            return true
        }

        let predicate = HKQuery.predicateForObjects(
            withMetadataKey: sourceIDKey,
            allowedValues: [sourceID]
        )

        let exists: Bool = try await withCheckedThrowingContinuation { continuation in
            let query = HKSampleQuery(
                sampleType: sampleType,
                predicate: predicate,
                limit: 1,
                sortDescriptors: nil
            ) { _, samples, error in
                if let error {
                    continuation.resume(throwing: error)
                    return
                }
                continuation.resume(returning: !(samples?.isEmpty ?? true))
            }
            store.execute(query)
        }

        if exists {
            rememberWritten(localID)
        }
        return exists
    }

    private var locallyWrittenIDs: Set<String> {
        Set(UserDefaults.standard.stringArray(forKey: writtenIDsKey) ?? [])
    }

    private func rememberWritten(_ id: String) {
        var ids = locallyWrittenIDs
        ids.insert(id)
        UserDefaults.standard.set(Array(ids).sorted(), forKey: writtenIDsKey)
    }

    private func fetchBodyweight(limit: Int) async throws -> [HealthBodyweight] {
        guard let bodyMassType else { return [] }
        let samples: [HKQuantitySample] = try await withCheckedThrowingContinuation { continuation in
            let sort = NSSortDescriptor(key: HKSampleSortIdentifierEndDate, ascending: false)
            let query = HKSampleQuery(
                sampleType: bodyMassType,
                predicate: nil,
                limit: limit,
                sortDescriptors: [sort]
            ) { _, samples, error in
                if let error {
                    continuation.resume(throwing: error)
                    return
                }
                continuation.resume(returning: (samples as? [HKQuantitySample]) ?? [])
            }
            store.execute(query)
        }

        return samples.map {
            HealthBodyweight(
                id: $0.uuid.uuidString,
                recordedAt: $0.endDate,
                pounds: $0.quantity.doubleValue(for: HKUnit.pound())
            )
        }
    }

    private func fetchStrengthWorkouts(limit: Int) async throws -> [HealthWorkout] {
        let workoutType = HKObjectType.workoutType()
        let samples: [HKWorkout] = try await withCheckedThrowingContinuation { continuation in
            let sort = NSSortDescriptor(key: HKSampleSortIdentifierEndDate, ascending: false)
            let query = HKSampleQuery(
                sampleType: workoutType,
                predicate: nil,
                limit: limit,
                sortDescriptors: [sort]
            ) { _, samples, error in
                if let error {
                    continuation.resume(throwing: error)
                    return
                }
                continuation.resume(returning: (samples as? [HKWorkout]) ?? [])
            }
            store.execute(query)
        }

        return samples.compactMap { workout in
            let name: String
            switch workout.workoutActivityType {
            case .traditionalStrengthTraining:
                name = "Traditional Strength Training"
            case .functionalStrengthTraining:
                name = "Functional Strength Training"
            default:
                return nil
            }

            return HealthWorkout(
                id: workout.uuid.uuidString,
                name: name,
                startedAt: workout.startDate,
                completedAt: workout.endDate,
                durationSeconds: workout.duration
            )
        }
    }
}
