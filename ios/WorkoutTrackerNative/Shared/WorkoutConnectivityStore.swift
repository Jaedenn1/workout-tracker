import Combine
import Foundation
import WatchConnectivity

final class WorkoutConnectivityStore: NSObject, ObservableObject, WCSessionDelegate {
    @Published private(set) var session: SyncedWorkoutSession?
    @Published private(set) var connectivityLabel = "Watch not connected"

    private var processedActionIDs: Set<String> = []
    private var wcSession: WCSession?
    private var lastRevision = -1

    #if os(iOS)
    private let liveActivity = LiveActivityManager()
    #endif

    override init() {
        super.init()
        guard WCSession.isSupported() else { return }
        let session = WCSession.default
        session.delegate = self
        wcSession = session
        session.activate()
    }

    func replaceSession(_ newSession: SyncedWorkoutSession) {
        DispatchQueue.main.async {
            self.processedActionIDs.removeAll()
            self.session = newSession
            self.lastRevision = newSession.revision
            self.connectivityLabel = self.reachabilityLabel()
            self.publish(session: newSession, revision: newSession.revision)
            self.syncLiveActivity()
        }
    }

    func clearSession() {
        DispatchQueue.main.async {
            let clearRevision = max(self.lastRevision, self.session?.revision ?? -1) + 1
            self.session = nil
            self.lastRevision = clearRevision
            self.processedActionIDs.removeAll()
            self.publish(session: nil, revision: clearRevision, cleared: true)
            self.syncLiveActivity()
        }
    }

    func completeSet(_ setID: String) {
        applyLocal(kind: .completeSet, setID: setID)
    }

    func updateSet(_ setID: String, weight: Double?, reps: Int?) {
        applyLocal(kind: .updateSet, setID: setID, weight: weight, reps: reps)
    }

    func adjustWeight(_ setID: String, delta: Double) {
        guard let set = findSet(setID) else { return }
        updateSet(setID, weight: max(0, (set.weight ?? 0) + delta), reps: nil)
    }

    func adjustReps(_ setID: String, delta: Int) {
        guard let set = findSet(setID) else { return }
        updateSet(setID, weight: nil, reps: max(0, (set.reps ?? 0) + delta))
    }

    func advanceExercise() {
        applyLocal(kind: .advanceExercise)
    }

    func adjustRest(_ seconds: Int) {
        applyLocal(kind: .adjustRest, deltaSeconds: seconds)
    }

    func endRest() {
        applyLocal(kind: .endRest)
    }

    private func applyLocal(kind: WorkoutActionKind, setID: String? = nil, weight: Double? = nil, reps: Int? = nil, deltaSeconds: Int? = nil) {
        DispatchQueue.main.async {
            guard var current = self.session else { return }
            let action = WorkoutAction(
                id: UUID().uuidString,
                sessionID: current.id,
                kind: kind,
                setID: setID,
                weight: weight,
                reps: reps,
                deltaSeconds: deltaSeconds,
                createdAt: SyncISO8601.string(from: Date())
            )
            guard WorkoutSessionReducer.apply(action, to: &current, processed: &self.processedActionIDs) else { return }
            self.session = current
            self.lastRevision = current.revision
            self.publish(session: current, revision: current.revision, action: action)
            self.syncLiveActivity()
        }
    }

    private func findSet(_ id: String) -> SyncedWorkoutSet? {
        session?.exercises.lazy.flatMap(\.sets).first(where: { $0.id == id })
    }

    private func publish(
        session current: SyncedWorkoutSession?,
        revision: Int,
        action: WorkoutAction? = nil,
        cleared: Bool = false
    ) {
        guard let wcSession,
              wcSession.activationState == .activated,
              let data = try? JSONEncoder().encode(WorkoutSyncEnvelope(
                revision: revision,
                sender: senderName,
                session: current,
                actionID: action?.id,
                action: action,
                cleared: cleared
              ))
        else { return }

        let payload: [String: Any] = ["payload": data]
        try? wcSession.updateApplicationContext(payload)

        if wcSession.isReachable {
            wcSession.sendMessage(payload, replyHandler: nil, errorHandler: nil)
        } else {
            wcSession.transferUserInfo(payload)
        }
        connectivityLabel = reachabilityLabel()
    }

    private func ingest(_ userInfo: [String: Any]) {
        guard let data = userInfo["payload"] as? Data,
              let envelope = try? JSONDecoder().decode(WorkoutSyncEnvelope.self, from: data)
        else { return }

        DispatchQueue.main.async {
            let currentRevision = max(self.lastRevision, self.session?.revision ?? -1)

            if envelope.cleared == true {
                guard envelope.revision >= currentRevision else { return }
                self.session = nil
                self.lastRevision = envelope.revision
                self.processedActionIDs.removeAll()
                self.connectivityLabel = self.reachabilityLabel()
                self.syncLiveActivity()
                return
            }

            guard let incomingSession = envelope.session else { return }

            if let action = envelope.action,
               var current = self.session,
               current.id == action.sessionID,
               !self.processedActionIDs.contains(action.id),
               envelope.revision <= current.revision {
                if WorkoutSessionReducer.apply(action, to: &current, processed: &self.processedActionIDs) {
                    self.session = current
                    self.lastRevision = current.revision
                    self.connectivityLabel = self.reachabilityLabel()
                    self.publish(session: current, revision: current.revision)
                    self.syncLiveActivity()
                }
                return
            }

            if let actionID = envelope.actionID,
               self.processedActionIDs.contains(actionID),
               envelope.revision <= currentRevision {
                return
            }
            if let actionID = envelope.actionID {
                self.processedActionIDs.insert(actionID)
            }

            guard envelope.revision >= currentRevision else { return }
            self.session = incomingSession
            self.lastRevision = envelope.revision
            self.connectivityLabel = self.reachabilityLabel()
            self.syncLiveActivity()
        }
    }

    private var senderName: String {
        #if os(watchOS)
        return "watch"
        #else
        return "iphone"
        #endif
    }

    private func reachabilityLabel() -> String {
        guard let wcSession, wcSession.activationState == .activated else { return "Watch session activating" }
        #if os(iOS)
        if !wcSession.isPaired { return "No Apple Watch paired" }
        if !wcSession.isWatchAppInstalled { return "Watch app not installed" }
        #endif
        return wcSession.isReachable ? "Phone ↔ Watch live" : "Background sync ready"
    }

    private func syncLiveActivity() {
        #if os(iOS)
        liveActivity.sync(with: session)
        #endif
    }

    func session(_ session: WCSession, activationDidCompleteWith activationState: WCSessionActivationState, error: Error?) {
        DispatchQueue.main.async {
            self.connectivityLabel = error?.localizedDescription ?? self.reachabilityLabel()
        }
    }

    func sessionReachabilityDidChange(_ session: WCSession) {
        DispatchQueue.main.async {
            self.connectivityLabel = self.reachabilityLabel()
        }
    }

    func session(_ session: WCSession, didReceiveMessage message: [String : Any]) {
        ingest(message)
    }

    func session(_ session: WCSession, didReceiveApplicationContext applicationContext: [String : Any]) {
        ingest(applicationContext)
    }

    func session(_ session: WCSession, didReceiveUserInfo userInfo: [String : Any] = [:]) {
        ingest(userInfo)
    }

    #if os(iOS)
    func sessionDidBecomeInactive(_ session: WCSession) {}

    func sessionDidDeactivate(_ session: WCSession) {
        session.activate()
    }
    #endif
}
