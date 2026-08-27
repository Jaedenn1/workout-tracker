import SwiftUI

@main
struct WorkoutTrackerWatchApp: App {
    @StateObject private var store = WorkoutConnectivityStore()

    var body: some Scene {
        WindowGroup {
            WatchContentView()
                .environmentObject(store)
        }
    }
}
