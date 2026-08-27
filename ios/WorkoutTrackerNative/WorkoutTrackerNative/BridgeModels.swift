import Foundation
import SwiftUI
import UniformTypeIdentifiers

struct BridgeBodyweight: Codable, Identifiable, Hashable {
    let id: String
    let recordedAt: String
    let pounds: Double
}

struct BridgeWorkout: Codable, Identifiable, Hashable {
    let id: String
    let name: String
    let startedAt: String
    let completedAt: String
    let durationSeconds: Double
    let totalVolume: Double?
    let completedSets: Int?
}

struct HealthBridgeEnvelope: Codable, Hashable {
    let version: Int
    let exportedAt: String
    let source: String
    let bodyweight: [BridgeBodyweight]
    let workouts: [BridgeWorkout]

    static let empty = HealthBridgeEnvelope(
        version: 1,
        exportedAt: ISO8601Bridge.string(from: Date()),
        source: "workout-tracker-native-v0.8",
        bodyweight: [],
        workouts: []
    )
}

struct HealthBodyweight: Identifiable, Hashable {
    let id: String
    let recordedAt: Date
    let pounds: Double
}

struct HealthWorkout: Identifiable, Hashable {
    let id: String
    let name: String
    let startedAt: Date
    let completedAt: Date
    let durationSeconds: Double
}

enum ISO8601Bridge {
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

    static func date(from value: String) -> Date? {
        fractional.date(from: value) ?? basic.date(from: value)
    }
}

enum BridgeCodec {
    static func decode(_ data: Data) throws -> HealthBridgeEnvelope {
        let envelope = try JSONDecoder().decode(HealthBridgeEnvelope.self, from: data)
        guard envelope.version == 1 else {
            throw CocoaError(.fileReadCorruptFile)
        }
        return envelope
    }

    static func encode(_ envelope: HealthBridgeEnvelope) throws -> Data {
        let encoder = JSONEncoder()
        encoder.outputFormatting = [.prettyPrinted, .sortedKeys]
        return try encoder.encode(envelope)
    }
}

struct HealthBridgeDocument: FileDocument {
    static var readableContentTypes: [UTType] { [.json] }
    static var writableContentTypes: [UTType] { [.json] }

    var envelope: HealthBridgeEnvelope

    init(envelope: HealthBridgeEnvelope) {
        self.envelope = envelope
    }

    init(configuration: ReadConfiguration) throws {
        guard let data = configuration.file.regularFileContents else {
            throw CocoaError(.fileReadCorruptFile)
        }
        envelope = try BridgeCodec.decode(data)
    }

    func fileWrapper(configuration: WriteConfiguration) throws -> FileWrapper {
        FileWrapper(regularFileWithContents: try BridgeCodec.encode(envelope))
    }
}
