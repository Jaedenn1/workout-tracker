import SwiftUI
import UniformTypeIdentifiers

struct WorkoutSessionDocument: FileDocument {
    static var readableContentTypes: [UTType] { [.json] }
    static var writableContentTypes: [UTType] { [.json] }

    var session: SyncedWorkoutSession

    init(session: SyncedWorkoutSession) {
        self.session = session
    }

    init(configuration: ReadConfiguration) throws {
        guard let data = configuration.file.regularFileContents else {
            throw CocoaError(.fileReadCorruptFile)
        }
        let decoded = try JSONDecoder().decode(SyncedWorkoutSession.self, from: data)
        guard decoded.version == 1 else { throw CocoaError(.fileReadCorruptFile) }
        session = decoded
    }

    func fileWrapper(configuration: WriteConfiguration) throws -> FileWrapper {
        let encoder = JSONEncoder()
        encoder.outputFormatting = [.prettyPrinted, .sortedKeys]
        return FileWrapper(regularFileWithContents: try encoder.encode(session))
    }
}
