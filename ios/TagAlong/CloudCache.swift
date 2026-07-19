import FirebaseFirestore
import FirebaseStorage
import Foundation

/// The feed cache (docs/10 §A): take metadata + media for tags you merely
/// WATCH. Files live in Caches/cloud — purgeable by iOS, never user-visible,
/// never mixed into the library. The only crossing into `Store` is `adopt`,
/// the explicit act of tagging along.
@MainActor
final class CloudCache: ObservableObject {
    struct TakeSet {
        /// Every cloud take for the tag, oldest first (multiple per part is
        /// legal — docs/10 §F4).
        var all: [Take]
        /// First take per part — the default cast for feed playback until
        /// creator-picked featured casts land (gated on the paid account).
        var featured: [Part: Take] {
            var result: [Part: Take] = [:]
            for take in all where result[take.part] == nil { result[take.part] = take }
            return result
        }
    }

    /// Tag id → its fetched take set (docs + media on disk).
    @Published private(set) var loaded: [UUID: TakeSet] = [:]

    private let db = Firestore.firestore()
    private let storage = Storage.storage()
    private let dir: URL

    init() {
        let caches = FileManager.default.urls(for: .cachesDirectory, in: .userDomainMask)[0]
        dir = caches.appendingPathComponent("cloud", isDirectory: true)
        try? FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
    }

    /// Where a cached take's media lives (or will live once fetched).
    func url(for take: Take) -> URL { dir.appendingPathComponent(take.fileName) }

    /// Fetch a cloud tag's take docs and download any media not already on
    /// disk. Re-reads the docs every call (cheap; picks up new takes) but only
    /// downloads missing files. Never touches the Store.
    @discardableResult
    func fetch(cloudTag: CloudTag) async throws -> TakeSet {
        let tagRef = db.collection("tags").document(cloudTag.id.uuidString)
        let snap = try await tagRef.collection("takes").getDocuments()
        var takes: [Take] = []
        for doc in snap.documents {
            guard let takeId = UUID(uuidString: doc.documentID) else { continue }
            let data = doc.data()
            guard let partRaw = data["part"] as? String,
                  let part = Part(rawValue: partRaw),
                  let storagePath = data["storagePath"] as? String,
                  let t0 = data["t0OffsetSec"] as? Double,
                  let duration = data["durationSec"] as? Double
            else { continue }

            let ext = (storagePath as NSString).pathExtension
            let fileName = "\(takeId.uuidString).\(ext.isEmpty ? "mov" : ext)"
            let localURL = dir.appendingPathComponent(fileName)
            if !FileManager.default.fileExists(atPath: localURL.path) {
                _ = try await storage.reference(withPath: storagePath).writeAsync(toFile: localURL)
            }

            var take = Take(id: takeId, tagId: cloudTag.id, part: part,
                            fileName: fileName,
                            t0OffsetSec: t0,
                            nudgeSec: data["nudgeSec"] as? Double ?? 0,
                            durationSec: duration,
                            createdAt: (data["createdAt"] as? Timestamp)?.dateValue() ?? Date())
            take.ownerUid = data["ownerUid"] as? String
            take.uploadedAt = take.createdAt
            takes.append(take)
        }
        takes.sort { $0.createdAt < $1.createdAt }
        let set = TakeSet(all: takes)
        loaded[cloudTag.id] = set
        return set
    }

    /// The ONE crossing from feed cache into the library: tagging along.
    /// Inserts the tag + every take into the Store, seeding media from the
    /// cache (move, don't re-download) and fetching whatever isn't cached.
    /// Returns the live library tag, ready for the record flow.
    @discardableResult
    func adopt(cloudTag: CloudTag, store: Store) async throws -> SongTag {
        let set = try await fetch(cloudTag: cloudTag)

        var tag = SongTag(id: cloudTag.id, title: cloudTag.title, key: cloudTag.key,
                          createdAt: cloudTag.createdAt)
        tag.creatorUid = cloudTag.creatorUid
        tag.publishedAt = Date()
        tag.lyrics = cloudTag.lyrics
        tag.notes = cloudTag.notes
        tag.visibility = cloudTag.visibility
        tag.inviteCode = cloudTag.inviteCode
        store.upsert(tag: tag)

        for take in set.all where !store.takes.contains(where: { $0.id == take.id }) {
            let src = url(for: take)
            let dest = store.newMediaURL()
            do {
                try FileManager.default.moveItem(at: src, to: dest)
            } catch {
                // Move can fail across a purge race; the fetch above just
                // ensured the file exists, so a copy is the safe fallback.
                try FileManager.default.copyItem(at: src, to: dest)
            }
            var local = take
            local.fileName = dest.lastPathComponent
            store.upsert(take: local)
        }
        loaded[cloudTag.id] = nil // media moved into the library
        return store.tags.first(where: { $0.id == cloudTag.id }) ?? tag
    }
}
