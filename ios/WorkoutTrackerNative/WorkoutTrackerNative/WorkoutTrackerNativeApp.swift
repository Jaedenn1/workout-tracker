import SwiftUI

@main
struct WorkoutTrackerNativeApp: App {
    @StateObject private var healthKit = HealthKitManager()

    var body: some Scene {
        WindowGroup {
            ContentView()
                .environmentObject(healthKit)
        }
    }
}
