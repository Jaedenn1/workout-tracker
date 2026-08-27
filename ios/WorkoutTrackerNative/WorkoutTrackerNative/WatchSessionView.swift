import SwiftUI
import UniformTypeIdentifiers

struct WatchSessionView: View {
    @EnvironmentObject private var store: WorkoutConnectivityStore
    @State private var showImporter = false
    @State private var showExporter = false
    @State private var exportDocument: WorkoutSessionDocument?
    @State private var message = "Import the Watch Session JSON exported by /watch in the PWA."

    var body: some View {
        NavigationStack {
            List {
                Section("Connection") {
                    LabeledContent("Watch", value: store.connectivityLabel)
                    Text(message)
                        .font(.footnote)
                        .foregroundStyle(.secondary)
                    Button("Import Watch Session") { showImporter = true }
                }

                if let session = store.session {
                    Section("Current workout") {
                        LabeledContent("Workout", value: session.name)
                        LabeledContent("Progress", value: "\(session.completedSetCount)/\(session.totalSetCount) sets")
                        LabeledContent("Exercise", value: session.currentExercise?.name ?? "Finished")

                        if let end = SyncISO8601.date(from: session.restEndsAt), end > Date() {
                            HStack {
                                Text("Rest")
                                Spacer()
                                Text(timerInterval: Date()...end, countsDown: true)
                                    .monospacedDigit()
                            }
                        }
                    }

                    if let exercise = session.currentExercise {
                        Section(exercise.name) {
                            ForEach(exercise.sets) { set in
                                VStack(alignment: .leading, spacing: 8) {
                                    HStack {
                                        Image(systemName: set.completed ? "checkmark.circle.fill" : "circle")
                                        Text("\(set.weight ?? 0, specifier: "%.0f") lb × \(set.reps ?? 0)")
                                        Spacer()
                                    }
                                    if !set.completed {
                                        HStack {
                                            Button("−5") { store.adjustWeight(set.id, delta: -5) }
                                            Button("+5") { store.adjustWeight(set.id, delta: 5) }
                                            Button("+1 rep") { store.adjustReps(set.id, delta: 1) }
                                            Button("Done") { store.completeSet(set.id) }
                                                .buttonStyle(.borderedProminent)
                                        }
                                        .buttonStyle(.bordered)
                                    }
                                }
                            }

                            Button("Next exercise") { store.advanceExercise() }
                            Button("Skip rest") { store.endRest() }
                        }
                    }

                    Section("Session file") {
                        Button("Export updated Watch Session") {
                            exportDocument = WorkoutSessionDocument(session: session)
                            showExporter = true
                        }
                        Button("End Watch session", role: .destructive) {
                            store.clearSession()
                            message = "Watch session ended."
                        }
                    }
                }
            }
            .navigationTitle("Apple Watch")
        }
        .fileImporter(isPresented: $showImporter, allowedContentTypes: [.json]) { result in
            switch result {
            case .success(let url): importSession(url)
            case .failure(let error): message = error.localizedDescription
            }
        }
        .fileExporter(
            isPresented: $showExporter,
            document: exportDocument,
            contentType: .json,
            defaultFilename: "watch-session-updated"
        ) { result in
            switch result {
            case .success: message = "Exported the current phone/Watch session state."
            case .failure(let error): message = error.localizedDescription
            }
        }
    }

    private func importSession(_ url: URL) {
        let scoped = url.startAccessingSecurityScopedResource()
        defer { if scoped { url.stopAccessingSecurityScopedResource() } }

        do {
            let data = try Data(contentsOf: url)
            let session = try JSONDecoder().decode(SyncedWorkoutSession.self, from: data)
            guard session.version == 1 else { throw CocoaError(.fileReadCorruptFile) }
            store.replaceSession(session)
            message = "Session loaded. The iPhone and Watch now share this workout state."
        } catch {
            message = "Could not import this Watch Session: \(error.localizedDescription)"
        }
    }
}
