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
    let ringCount: Int
    let inviteCode: String?
    let lyrics: String?
    let notes: String?
    let visibility: TagVisibility

    /// Open slots, in part order.
    var openParts: [Part] { Part.allCases.filter { !parts.contains($0) } }
}

enum CloudError: LocalizedError {
    case notSignedIn
    case codeNotFound
    var errorDescription: String? {
        switch self {
        case .notSignedIn: return "Not connected to the community yet — try again in a moment."
        case .codeNotFound: return "No tag answers to that code. Check it and try again."
        }
    }
}

/// Firebase glue: anonymous auth, a single feed listener, identity (display
/// name + voice part, docs/10 §F1–F2), publish/upload flows, role-aware cloud
/// deletes (§A), and invite codes (§E). All async/await; callers surface
/// `errorMessage` in an alert.
@MainActor
final class CloudStore: ObservableObject {
    @Published private(set) var uid: String?
    @Published private(set) var cloudTags: [CloudTag] = []
    /// Set by fire-and-forget publish tasks; a top-level alert observes it.
    @Published var errorMessage: String?

    // MARK: Identity & local prefs

    /// Credited name for takes/comments (docs/10 §F2). nil until first asked.
    @Published private(set) var displayName: String?
    /// "What do you sing?" (docs/10 §F1). nil = not sure yet.
    @Published private(set) var myPart: Part?
    @Published private(set) var hasOnboarded: Bool
    /// "Not interested" feed cards (docs/10 §A viewer actions) + report auto-hide.
    @Published private(set) var hiddenTagIds: Set<UUID>
    /// Blocked singers: all their content hidden locally (docs/10 §F5).
    @Published private(set) var blockedUids: Set<String>
    /// takeId → 0…1 while its media uploads (docs/10 §F6).
    @Published private(set) var uploadProgress: [UUID: Double] = [:]

    private let db = Firestore.firestore()
    private let storage = Storage.storage()
    private let defaults = UserDefaults.standard
    private var feedListener: ListenerRegistration?
    private var nameCache: [String: String] = [:]

    init() {
        // FirebaseApp.configure() has already run in the App init by this point.
        displayName = defaults.string(forKey: "profile.displayName")
        myPart = defaults.string(forKey: "profile.part").flatMap(Part.init(rawValue:))
        hasOnboarded = defaults.bool(forKey: "profile.onboarded.v2")
        hiddenTagIds = Set((defaults.stringArray(forKey: "feed.hiddenTagIds") ?? [])
            .compactMap(UUID.init(uuidString:)))
        blockedUids = Set(defaults.stringArray(forKey: "feed.blockedUids") ?? [])
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
        syncUserDoc()
        startFeed()
    }

    // MARK: - Identity

    func setDisplayName(_ name: String) {
        let trimmed = name.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return }
        displayName = String(trimmed.prefix(40))
        defaults.set(displayName, forKey: "profile.displayName")
        syncUserDoc()
    }

    func setMyPart(_ part: Part?) {
        myPart = part
        defaults.set(part?.rawValue, forKey: "profile.part")
        syncUserDoc()
    }

    func completeOnboarding(part: Part?) {
        setMyPart(part)
        hasOnboarded = true
        defaults.set(true, forKey: "profile.onboarded.v2")
    }

    func hide(tagId: UUID) {
        hiddenTagIds.insert(tagId)
        defaults.set(hiddenTagIds.map(\.uuidString), forKey: "feed.hiddenTagIds")
    }

    func block(uid other: String) {
        blockedUids.insert(other)
        defaults.set(Array(blockedUids), forKey: "feed.blockedUids")
    }

    /// Mirror displayName/part onto users/{uid} so credits and comments can
    /// resolve names (docs/10 §F2). Fire-and-forget.
    private func syncUserDoc() {
        guard let uid, displayName != nil || myPart != nil else { return }
        var doc: [String: Any] = ["updatedAt": FieldValue.serverTimestamp()]
        if let displayName { doc["displayName"] = displayName }
        if let myPart { doc["part"] = myPart.rawValue }
        db.collection("users").document(uid).setData(doc, merge: true)
    }

    /// Resolve another user's display name (memoized). nil = never introduced
    /// themselves; render as "A stranger".
    func displayName(for otherUid: String) async -> String? {
        if otherUid == uid, let displayName { return displayName }
        if let hit = nameCache[otherUid] { return hit }
        guard let data = try? await db.collection("users").document(otherUid).getDocument().data(),
              let name = data["displayName"] as? String else { return nil }
        nameCache[otherUid] = name
        return name
    }

    // MARK: - Feed

    private func startFeed() {
        feedListener?.remove()
        // Single ordered listener, client-side filtering only — no composite indexes.
        feedListener = db.collection("tags")
            .order(by: "createdAt", descending: true)
            .limit(to: 100)
            .addSnapshotListener { [weak self] snapshot, _ in
                let parsed = (snapshot?.documents ?? []).compactMap {
                    CloudStore.cloudTag(id: $0.documentID, data: $0.data())
                }
                Task { @MainActor [weak self] in self?.cloudTags = parsed }
            }
    }

    private static func cloudTag(id docId: String, data: [String: Any]) -> CloudTag? {
        guard let id = UUID(uuidString: docId),
              let title = data["title"] as? String,
              let keyRaw = data["key"] as? String,
              let key = PitchKey(rawValue: keyRaw),
              let creatorUid = data["creatorUid"] as? String
        else { return nil }
        let parts = (data["parts"] as? [String] ?? []).compactMap(Part.init(rawValue:))
        let lyrics = (data["lyrics"] as? String).flatMap { $0.isEmpty ? nil : $0 }
        let notes = (data["notes"] as? String).flatMap { $0.isEmpty ? nil : $0 }
        return CloudTag(
            id: id,
            title: title,
            key: key,
            isComplete: data["isComplete"] as? Bool ?? false,
            creatorUid: creatorUid,
            parts: parts,
            createdAt: (data["createdAt"] as? Timestamp)?.dateValue() ?? Date(),
            ringCount: data["ringCount"] as? Int ?? 0,
            inviteCode: data["inviteCode"] as? String,
            lyrics: lyrics,
            notes: notes,
            visibility: TagVisibility(rawValue: data["visibility"] as? String ?? "") ?? .publicFeed
        )
    }

    // MARK: - Invite codes (docs/10 §E)

    private static let codeAlphabet = Array("ABCDEFGHJKMNPQRSTUVWXYZ23456789")
    static func makeInviteCode() -> String {
        String((0..<6).map { _ in codeAlphabet.randomElement()! })
    }

    /// Look a code up in the community. Single-field where + limit 1 → no
    /// composite index needed.
    func lookupInvite(code: String) async throws -> CloudTag {
        let cleaned = code.trimmingCharacters(in: .whitespacesAndNewlines).uppercased()
        let snap = try await db.collection("tags")
            .whereField("inviteCode", isEqualTo: cleaned)
            .limit(to: 1)
            .getDocuments()
        guard let doc = snap.documents.first,
              let tag = Self.cloudTag(id: doc.documentID, data: doc.data())
        else { throw CloudError.codeNotFound }
        return tag
    }

    // MARK: - Publish

    /// Publish a local tag: upload every take I own, write take + tag docs,
    /// recompute completeness, and mark the local models published/uploaded.
    /// Mints the tag's invite code on first publish.
    func publish(tag: SongTag, takes: [Take], store: Store) async throws {
        guard let uid else { throw CloudError.notSignedIn }
        let tagRef = db.collection("tags").document(tag.id.uuidString)
        let inviteCode = tag.inviteCode ?? Self.makeInviteCode()

        try await tagRef.setData([
            "title": tag.title,
            "key": tag.key.rawValue,
            "creatorUid": tag.creatorUid ?? uid,
            "createdAt": Timestamp(date: tag.createdAt),
            "inviteCode": inviteCode,
            "visibility": (tag.visibility ?? .publicFeed).rawValue,
            "lyrics": tag.lyrics ?? "",
            "notes": tag.notes ?? ""
        ], merge: true)

        for take in takes where take.ownerUid == nil || take.ownerUid == uid {
            try await uploadTake(take, ownerUid: uid, tagRef: tagRef, store: store)
            store.markUploaded(takeId: take.id, ownerUid: uid)
        }

        try await recomputeCompletion(tagRef)
        store.markPublished(tagId: tag.id, creatorUid: tag.creatorUid ?? uid, inviteCode: inviteCode)
    }

    /// Upload a single new take to an already-published tag and refresh the
    /// tag doc's completeness. Used for auto-publish when tagging along.
    func publishTake(_ take: Take, for tag: SongTag, store: Store) async throws {
        guard let uid else { throw CloudError.notSignedIn }
        let tagRef = db.collection("tags").document(tag.id.uuidString)
        let ownerUid = take.ownerUid ?? uid
        try await uploadTake(take, ownerUid: ownerUid, tagRef: tagRef, store: store)
        store.markUploaded(takeId: take.id, ownerUid: ownerUid)
        try await recomputeCompletion(tagRef)
    }

    private func uploadTake(_ take: Take, ownerUid: String, tagRef: DocumentReference, store: Store) async throws {
        let rawURL = store.mediaURL(for: take)
        // Upload discipline (docs/10 §F6): transcode to 720p before putFile;
        // fall back to the raw .mov if the transcode can't run.
        var uploadURL = rawURL
        var ext = "mov"
        var contentType = "video/quicktime"
        if let small = await TakeTranscoder.transcode720p(rawURL) {
            uploadURL = small
            ext = "mp4"
            contentType = "video/mp4"
        }
        defer {
            if uploadURL != rawURL { try? FileManager.default.removeItem(at: uploadURL) }
            uploadProgress[take.id] = nil
        }

        let storagePath = "takes/\(take.id.uuidString).\(ext)"
        let meta = StorageMetadata()
        meta.contentType = contentType
        uploadProgress[take.id] = 0
        _ = try await storage.reference(withPath: storagePath)
            .putFileAsync(from: uploadURL, metadata: meta) { [weak self] progress in
                guard let progress, progress.totalUnitCount > 0 else { return }
                let fraction = Double(progress.completedUnitCount) / Double(progress.totalUnitCount)
                Task { @MainActor [weak self] in self?.uploadProgress[take.id] = fraction }
            }

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

    // MARK: - Role-aware deletes (docs/10 §A)

    /// Creator only: delete the tag for everyone — every take doc + its media,
    /// then the tag doc — and remove it from this phone. Rings/comments docs
    /// are left orphaned under the deleted doc (unreachable; a Cloud Function
    /// sweep can reclaim them later).
    func deleteTagEverywhere(tag: SongTag, store: Store) async throws {
        let tagRef = db.collection("tags").document(tag.id.uuidString)
        let takesSnap = try await tagRef.collection("takes").getDocuments()
        for doc in takesSnap.documents {
            if let path = doc.data()["storagePath"] as? String {
                try? await storage.reference(withPath: path).delete()
            }
            try await doc.reference.delete()
        }
        try await tagRef.delete()
        store.delete(tag: tag)
    }

    /// Contributor: remove MY voice from a tag, cloud + local. The tag reverts
    /// to n-1 parts and the slot reopens for anyone.
    func removeMyVoice(from tag: SongTag, store: Store) async throws {
        guard uid != nil else { throw CloudError.notSignedIn }
        let tagRef = db.collection("tags").document(tag.id.uuidString)
        for take in store.takes(for: tag.id) where store.isMine(take) {
            if take.uploadedAt != nil {
                let ref = tagRef.collection("takes").document(take.id.uuidString)
                if let path = try await ref.getDocument().data()?["storagePath"] as? String {
                    try? await storage.reference(withPath: path).delete()
                }
                try await ref.delete()
            }
            store.delete(take: take)
        }
        try await recomputeCompletion(tagRef)
    }
}
