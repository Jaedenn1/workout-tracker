import SwiftUI

@main
struct WorkoutTrackerNativeApp: App {
    @StateObject private var healthKit = HealthKitManager()
    @StateObject private var workoutSync = WorkoutConnectivityStore()

    var body: some Scene {
        WindowGroup {
            TabView {
                ContentView()
                    .tabItem { Label("Health", systemImage: "heart.fill") }

                WatchSessionView()
                    .tabItem { Label("Watch", systemImage: "applewatch") }
            }
            .environmentObject(healthKit)
            .environmentObject(workoutSync)
        }
    }
}
