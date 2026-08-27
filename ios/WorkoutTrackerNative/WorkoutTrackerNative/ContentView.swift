import SwiftUI
import UniformTypeIdentifiers

struct ContentView: View {
    @EnvironmentObject private var healthKit: HealthKitManager
    @State private var importedEnvelope: HealthBridgeEnvelope?
    @State private var selectedWorkoutIDs: Set<String> = []
    @State private var selectedBodyweightIDs: Set<String> = []
    @State private var showImporter = false
    @State private var showExporter = false
    @State private var exportDocument: HealthBridgeDocument?
    @State private var bridgeMessage = "Import a bridge file from the web tracker when you want to write selected data into Apple Health."

    var body: some View {
        NavigationStack {
            List {
                Section("Apple Health") {
                    LabeledContent("Permission", value: healthKit.accessState)
                    Text(healthKit.lastMessage)
                        .font(.footnote)
                        .foregroundStyle(.secondary)

                    Button("Connect Apple Health") {
                        Task { await healthKit.requestAccess() }
                    }
                    .disabled(healthKit.isBusy)

                    Button("Refresh Health data") {
                        Task { await healthKit.refresh() }
                    }
                    .disabled(healthKit.isBusy)
                }

                Section("Recent bodyweight") {
                    if healthKit.recentBodyweight.isEmpty {
                        Text("No readable bodyweight samples yet.")
                            .foregroundStyle(.secondary)
                    } else {
                        ForEach(Array(healthKit.recentBodyweight.prefix(6))) { entry in
                            LabeledContent(entry.recordedAt.formatted(date: .abbreviated, time: .omitted)) {
                                Text("\(entry.pounds, specifier: "%.1f") lb")
                            }
                        }
                    }
                }

                Section("Recent strength workouts") {
                    if healthKit.recentWorkouts.isEmpty {
                        Text("No readable strength workouts yet.")
                            .foregroundStyle(.secondary)
                    } else {
                        ForEach(Array(healthKit.recentWorkouts.prefix(8))) { workout in
                            VStack(alignment: .leading, spacing: 4) {
                                Text(workout.name)
                                Text("\(workout.startedAt.formatted(date: .abbreviated, time: .shortened)) · \(Int(workout.durationSeconds / 60)) min")
                                    .font(.caption)
                                    .foregroundStyle(.secondary)
                            }
                        }
                    }
                }

                Section("Workout Tracker bridge") {
                    Text(bridgeMessage)
                        .font(.footnote)
                        .foregroundStyle(.secondary)

                    Button("Import tracker JSON") {
                        showImporter = true
                    }

                    Button("Export Apple Health snapshot") {
                        exportDocument = HealthBridgeDocument(envelope: healthKit.makeExportEnvelope())
                        showExporter = true
                    }
                }

                if let importedEnvelope {
                    Section("Imported workouts") {
                        if importedEnvelope.workouts.isEmpty {
                            Text("No workouts in this bridge file.")
                                .foregroundStyle(.secondary)
                        }

                        ForEach(importedEnvelope.workouts) { workout in
                            Toggle(isOn: selectionBinding(forWorkout: workout.id)) {
                                VStack(alignment: .leading, spacing: 3) {
                                    Text(workout.name)
                                    Text("\(workout.completedSets ?? 0) sets · \(Int(workout.durationSeconds / 60)) min")
                                        .font(.caption)
                                        .foregroundStyle(.secondary)
                                }
                            }
                        }
                    }

                    Section("Imported bodyweight") {
                        if importedEnvelope.bodyweight.isEmpty {
                            Text("No bodyweight entries in this bridge file.")
                                .foregroundStyle(.secondary)
                        }

                        ForEach(importedEnvelope.bodyweight) { entry in
                            Toggle(isOn: selectionBinding(forBodyweight: entry.id)) {
                                Text("\(entry.pounds, specifier: "%.1f") lb · \(shortDate(entry.recordedAt))")
                            }
                        }

                        Button("Write selected to Apple Health") {
                            let workouts = importedEnvelope.workouts.filter { selectedWorkoutIDs.contains($0.id) }
                            let weights = importedEnvelope.bodyweight.filter { selectedBodyweightIDs.contains($0.id) }
                            Task {
                                await healthKit.writeSelected(bodyweight: weights, workouts: workouts)
                            }
                        }
                        .disabled(healthKit.isBusy || (selectedWorkoutIDs.isEmpty && selectedBodyweightIDs.isEmpty))
                    }
                }
            }
            .navigationTitle("Workout Health")
        }
        .fileImporter(isPresented: $showImporter, allowedContentTypes: [.json]) { result in
            switch result {
            case .success(let url):
                importBridge(url)
            case .failure(let error):
                bridgeMessage = error.localizedDescription
            }
        }
        .fileExporter(
            isPresented: $showExporter,
            document: exportDocument,
            contentType: .json,
            defaultFilename: "workout-health-bridge"
        ) { result in
            switch result {
            case .success:
                bridgeMessage = "Exported the current readable Apple Health strength/bodyweight snapshot."
            case .failure(let error):
                bridgeMessage = error.localizedDescription
            }
        }
    }

    private func selectionBinding(forWorkout id: String) -> Binding<Bool> {
        Binding(
            get: { selectedWorkoutIDs.contains(id) },
            set: { selected in
                if selected { selectedWorkoutIDs.insert(id) }
                else { selectedWorkoutIDs.remove(id) }
            }
        )
    }

    private func selectionBinding(forBodyweight id: String) -> Binding<Bool> {
        Binding(
            get: { selectedBodyweightIDs.contains(id) },
            set: { selected in
                if selected { selectedBodyweightIDs.insert(id) }
                else { selectedBodyweightIDs.remove(id) }
            }
        )
    }

    private func importBridge(_ url: URL) {
        let scoped = url.startAccessingSecurityScopedResource()
        defer {
            if scoped { url.stopAccessingSecurityScopedResource() }
        }

        do {
            let envelope = try BridgeCodec.decode(Data(contentsOf: url))
            importedEnvelope = envelope
            selectedWorkoutIDs = Set(envelope.workouts.map(\.id))
            selectedBodyweightIDs = Set(envelope.bodyweight.map(\.id))
            bridgeMessage = "Imported \(envelope.workouts.count) workouts and \(envelope.bodyweight.count) bodyweight entries. Deselect anything you do not want written to Apple Health."
        } catch {
            bridgeMessage = "Could not import this bridge file: \(error.localizedDescription)"
        }
    }

    private func shortDate(_ value: String) -> String {
        guard let date = ISO8601Bridge.date(from: value) else { return value }
        return date.formatted(date: .abbreviated, time: .omitted)
    }
}
