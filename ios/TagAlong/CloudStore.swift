import FirebaseAuth
import FirebaseFirestore
import FirebaseStorage
import Foundation

/// A lightweight, listener-derived view of a community tag. Everything needed
/// to render a feed/open card without downloading media. `parts` mirrors a
/// `parts: [String]` array kept on the tag doc (recomputed at publish time) so
/// the feed needs exactly ONE listener, never N subcollection listeners.
struct CloudTag: Identifiable {
    let id: UUID
    let title: String
    let key: PitchKey
    let isComplete: Bool
    let creatorUid: String
    let parts: [Part]
    let createdAt: Date
}

enum CloudError: LocalizedError {
    case notSignedIn
    var errorDescription: String? {
        switch self {
        case .notSignedIn: return "Not connected to the community yet — try again in a moment."
        }
    }
}

/// Firebase glue: anonymous auth, a single feed listener, and publish/join
/// flows that move tags + take media between Firestore/Storage and the local
/// `Store`. All async/await; callers surface `errorMessage` in an alert.
@MainActor
final class CloudStore: ObservableObject {
    @Published private(set) var uid: String?
    @Published private(set) var cloudTags: [CloudTag] = []
    /// Set by fire-and-forget publish tasks; a top-level alert observes it.
    @Published var errorMessage: String?

    private let db = Firestore.firestore()
    private let storage = Storage.storage()
    private var feedListener: ListenerRegistration?

    init() {
        // FirebaseApp.configure() has already run in the App init by this point.
        Task { await bootstrap() }
    }

    deinit { feedListener?.remove() }

    private func bootstrap() async {
        if let user = Auth.auth().currentUser {
            uid = user.uid
        } else {
            do {
                uid = try await Auth.auth().signInAnonymously().user.uid
            } catch {
                errorMessage = "Sign-in failed: \(error.localizedDescription)"
            }
        }
        startFeed()
    }

    // MARK: - Feed

    private func startFeed() {
        feedListener?.remove()
        // Single ordered listener, client-side filtering only — no composite indexes.
        feedListener = db.collection("tags")
            .order(by: "createdAt", descending: true)
            .limit(to: 100)
            .addSnapshotListener { [weak self] snapshot, _ in
                let parsed = (snapshot?.documents ?? []).compactMap(CloudStore.cloudTag(from:))
                Task { @MainActor [weak self] in self?.cloudTags = parsed }
            }
    }

    private static func cloudTag(from doc: QueryDocumentSnapshot) -> CloudTag? {
        let data = doc.data()
        guard let id = UUID(uuidString: doc.documentID),
              let title = data["title"] as? String,
              let keyRaw = data["key"] as? String,
              let key = PitchKey(rawValue: keyRaw),
              let creatorUid = data["creatorUid"] as? String
        else { return nil }
        let parts = (data["parts"] as? [String] ?? []).compactMap(Part.init(rawValue:))
        return CloudTag(
            id: id,
            title: title,
            key: key,
            isComplete: data["isComplete"] as? Bool ?? false,
            creatorUid: creatorUid,
            parts: parts,
            createdAt: (data["createdAt"] as? Timestamp)?.dateValue() ?? Date()
        )
    }

    // MARK: - Publish

    /// Publish a local tag: upload every take I own, write take + tag docs,
    /// recompute completeness, and mark the local models published/uploaded.
    func publish(tag: SongTag, takes: [Take], store: Store) async throws {
        guard let uid else { throw CloudError.notSignedIn }
        let tagRef = db.collection("tags").document(tag.id.uuidString)

        try await tagRef.setData([
            "title": tag.title,
            "key": tag.key.rawValue,
            "creatorUid": tag.creatorUid ?? uid,
            "createdAt": Timestamp(date: tag.createdAt)
        ], merge: true)

        for take in takes where take.ownerUid == nil || take.ownerUid == uid {
            try await uploadTake(take, ownerUid: uid, tagRef: tagRef, store: store)
            store.markUploaded(takeId: take.id, ownerUid: uid)
        }

        try await recomputeCompletion(tagRef)
        store.markPublished(tagId: tag.id, creatorUid: tag.creatorUid ?? uid)
    }

    /// Upload a single new take to an already-published tag and refresh the
    /// tag doc's completeness. Used for auto-publish when joining/contributing.
    func publishTake(_ take: Take, for tag: SongTag, store: Store) async throws {
        guard let uid else { throw CloudError.notSignedIn }
        let tagRef = db.collection("tags").document(tag.id.uuidString)
        let ownerUid = take.ownerUid ?? uid
        try await uploadTake(take, ownerUid: ownerUid, tagRef: tagRef, store: store)
        store.markUploaded(takeId: take.id, ownerUid: ownerUid)
        try await recomputeCompletion(tagRef)
    }

    private func uploadTake(_ take: Take, ownerUid: String, tagRef: DocumentReference, store: Store) async throws {
        let storagePath = "takes/\(take.id.uuidString).mov"
        let meta = StorageMetadata()
        meta.contentType = "video/quicktime"
        _ = try await storage.reference(withPath: storagePath)
            .putFileAsync(from: store.mediaURL(for: take), metadata: meta)

        try await tagRef.collection("takes").document(take.id.uuidString).setData([
            "part": take.part.rawValue,
            "ownerUid": ownerUid,
            "t0OffsetSec": take.t0OffsetSec,
            "nudgeSec": take.nudgeSec,
            "durationSec": take.durationSec,
            "storagePath": storagePath,
            "createdAt": Timestamp(date: take.createdAt)
        ], merge: true)
    }

    /// Read the (post-write) takes subcollection so completeness reflects every
    /// owner's contributions, then stamp parts/isComplete/completedAt on the tag.
    private func recomputeCompletion(_ tagRef: DocumentReference) async throws {
        let snap = try await tagRef.collection("takes").getDocuments()
        let partRaws = Set(snap.documents.compactMap { $0.data()["part"] as? String })
        let isComplete = partRaws.count == Part.allCases.count
        try await tagRef.setData([
            "parts": Array(partRaws),
            "isComplete": isComplete,
            "completedAt": isComplete ? FieldValue.serverTimestamp() : FieldValue.delete()
        ], merge: true)
    }

    // MARK: - Join

    /// Download a community tag into the local Store: insert the SongTag, then
    /// fetch + download every take's media (skipping any already local). After
    /// this the tag behaves like any local tag — playback, record missing part.
    func join(cloudTag: CloudTag, store: Store) async throws {
        let tagRef = db.collection("tags").document(cloudTag.id.uuidString)
        let takesSnap = try await tagRef.collection("takes").getDocuments()

        // Insert (or skip) the tag. publishedAt set so future takes auto-publish.
        var tag = SongTag(id: cloudTag.id, title: cloudTag.title, key: cloudTag.key,
                          createdAt: cloudTag.createdAt)
        tag.creatorUid = cloudTag.creatorUid
        tag.publishedAt = Date()
        store.upsert(tag: tag)

        for doc in takesSnap.documents {
            guard let takeId = UUID(uuidString: doc.documentID),
                  !store.takes.contains(where: { $0.id == takeId }) else { continue }
            let data = doc.data()
            guard let partRaw = data["part"] as? String,
                  let part = Part(rawValue: partRaw),
                  let storagePath = data["storagePath"] as? String,
                  let t0 = data["t0OffsetSec"] as? Double,
                  let duration = data["durationSec"] as? Double
            else { continue }

            let localURL = store.newMediaURL()
            _ = try await storage.reference(withPath: storagePath).writeAsync(toFile: localURL)

            var take = Take(id: takeId, tagId: cloudTag.id, part: part,
                            fileName: localURL.lastPathComponent,
                            t0OffsetSec: t0,
                            nudgeSec: data["nudgeSec"] as? Double ?? 0,
                            durationSec: duration,
                            createdAt: (data["createdAt"] as? Timestamp)?.dateValue() ?? Date())
            take.ownerUid = data["ownerUid"] as? String
            take.uploadedAt = (data["createdAt"] as? Timestamp)?.dateValue()
            store.upsert(take: take)
        }
    }
}
