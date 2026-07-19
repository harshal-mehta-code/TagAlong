import AVFoundation
import Foundation
import SwiftUI

enum Part: String, Codable, CaseIterable, Identifiable {
    case tenor, lead, bari, bass
    var id: String { rawValue }
    var label: String { rawValue.capitalized }
    var color: Color {
        switch self {
        case .tenor: return Color(hex: 0x8FB7E8)
        case .lead:  return Color(hex: 0xE06A5A)
        case .bari:  return Color(hex: 0xC79A3D)
        case .bass:  return Color(hex: 0x5E8C6E)
        }
    }
}

enum PitchKey: String, Codable, CaseIterable, Identifiable {
    case F, Fs = "F♯", G, Ab = "A♭", A, Bb = "B♭", B, C, Db = "D♭", D, Eb = "E♭", E
    var id: String { rawValue }
    /// Semitones from A4 for the pipe's F3–E4 octave.
    var semitonesFromA4: Int {
        switch self {
        case .F: return -16; case .Fs: return -15; case .G: return -14
        case .Ab: return -13; case .A: return -12; case .Bb: return -11
        case .B: return -10; case .C: return -9; case .Db: return -8
        case .D: return -7; case .Eb: return -6; case .E: return -5
        }
    }
    var frequency: Double { 440 * pow(2, Double(semitonesFromA4) / 12) }
}

/// Who can discover a published tag (docs/10 §F8).
enum TagVisibility: String, Codable {
    case publicFeed = "public" // in the community feed
    case unlisted              // invite code only
}

struct SongTag: Codable, Identifiable, Equatable {
    var id: UUID = UUID()
    var title: String
    var key: PitchKey
    var createdAt: Date = Date()
    // Cloud provenance (optional → old JSON keeps decoding; nil = local-only).
    var creatorUid: String? = nil
    var publishedAt: Date? = nil
    // v2 (docs/10): joiner context + invitations. All optional → old JSON decodes.
    var lyrics: String? = nil
    var notes: String? = nil              // e.g. "Polecat #4"
    var visibility: TagVisibility? = nil  // nil = public (pre-v2 tags)
    var inviteCode: String? = nil         // stamped at publish
}

struct Take: Codable, Identifiable, Equatable {
    var id: UUID = UUID()
    var tagId: UUID
    var part: Part
    var fileName: String
    /// Position of master t=0 (the first count-in click, as HEARD) inside the
    /// media file, in seconds. Known exactly: capture and click playback share
    /// the device host clock — the measurement the web app never had.
    var t0OffsetSec: Double
    /// User fine-adjustment on top of t0OffsetSec (positive = take was late).
    var nudgeSec: Double = 0
    var durationSec: Double
    var createdAt: Date = Date()
    // Cloud provenance (optional → old JSON keeps decoding).
    // ownerUid nil = mine, recorded before cloud existed. uploadedAt nil = not yet in Storage.
    var ownerUid: String? = nil
    var uploadedAt: Date? = nil

    var startSec: Double { t0OffsetSec + nudgeSec }
}

/// My relationship to a tag — drives the role-aware delete menu (docs/10 §A).
enum TagRole { case creator, contributor, viewer }

/// Local-first persistence: JSON metadata + movie files in Documents.
/// This is the LIBRARY (docs/10 §A): tags I created + tags I tagged along on.
/// Anything merely watched lives in the feed cache (CloudCache), never here.
@MainActor
final class Store: ObservableObject {
    @Published private(set) var tags: [SongTag] = []
    @Published private(set) var takes: [Take] = []
    /// Cast selection (docs/10 §F4): tagId → part rawValue → takeId. When a
    /// part has multiple takes, this picks which one MY quartet plays.
    @Published private(set) var cast: [String: [String: String]] = [:]

    /// Signed-in uid, set by CloudStore after auth. Lets the Store tell my
    /// takes from downloaded ones; not persisted (auth is the source of truth).
    var myUid: String?

    private let dir: URL
    private var metaURL: URL { dir.appendingPathComponent("tagalong.json") }

    struct Snapshot: Codable {
        var tags: [SongTag]
        var takes: [Take]
        var cast: [String: [String: String]]?
    }

    init() {
        dir = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask)[0]
        load()
        healDurations()
    }

    /// Repair takes persisted with durationSec 0 (a capture race at stop lost
    /// a sample timestamp in early builds): the finalized file is the truth.
    private func healDurations() {
        let broken = takes.filter { $0.durationSec <= 0 }
        guard !broken.isEmpty else { return }
        Task { [weak self] in
            guard let self else { return }
            for take in broken {
                guard let dur = try? await AVURLAsset(url: self.mediaURL(for: take)).load(.duration).seconds,
                      dur > 0,
                      let i = self.takes.firstIndex(where: { $0.id == take.id }) else { continue }
                self.takes[i].durationSec = dur
            }
            self.save()
        }
    }

    func mediaURL(for take: Take) -> URL { dir.appendingPathComponent(take.fileName) }
    func newMediaURL() -> URL { dir.appendingPathComponent("take-\(UUID().uuidString).mov") }

    func add(tag: SongTag) {
        tags.insert(tag, at: 0)
        save()
    }

    func add(take: Take) {
        takes.append(take)
        save()
    }

    /// Replace a tag by id (used to re-key a tag from the pitch pipe).
    func update(tag: SongTag) {
        guard let i = tags.firstIndex(where: { $0.id == tag.id }) else { return }
        tags[i] = tag
        save()
    }

    /// Tags with all four parts sung — the watch feed.
    func isComplete(_ tagId: UUID) -> Bool { quartet(for: tagId).count == Part.allCases.count }

    /// A take is mine if I recorded it: uploaded under my uid, or recorded
    /// locally before any cloud identity existed (ownerUid nil).
    func isMine(_ take: Take) -> Bool { take.ownerUid == nil || take.ownerUid == myUid }

    /// Role-aware ownership (docs/10 §A): creator > contributor > viewer.
    func role(for tag: SongTag) -> TagRole {
        if tag.creatorUid == nil || tag.creatorUid == myUid { return .creator }
        if takes(for: tag.id).contains(where: { isMine($0) }) { return .contributor }
        return .viewer
    }

    func updateNudge(takeId: UUID, nudgeSec: Double) {
        guard let i = takes.firstIndex(where: { $0.id == takeId }) else { return }
        takes[i].nudgeSec = nudgeSec
        save()
    }

    /// Pin which take MY quartet plays for a part (docs/10 §F4 — swap-in,
    /// don't stomp). nil clears back to the default preference order.
    func setCast(tagId: UUID, part: Part, takeId: UUID?) {
        var forTag = cast[tagId.uuidString] ?? [:]
        forTag[part.rawValue] = takeId?.uuidString
        cast[tagId.uuidString] = forTag.isEmpty ? nil : forTag
        save()
    }

    func delete(take: Take) {
        takes.removeAll { $0.id == take.id }
        try? FileManager.default.removeItem(at: mediaURL(for: take))
        // Drop any cast entry pointing at the deleted take.
        if var forTag = cast[take.tagId.uuidString] {
            forTag = forTag.filter { $0.value != take.id.uuidString }
            cast[take.tagId.uuidString] = forTag.isEmpty ? nil : forTag
        }
        save()
    }

    /// Remove a tag from THIS phone only (library + media). Cloud copies are
    /// untouched — role-aware cloud deletes live in CloudStore.
    func delete(tag: SongTag) {
        for t in takes(for: tag.id) { try? FileManager.default.removeItem(at: mediaURL(for: t)) }
        takes.removeAll { $0.tagId == tag.id }
        tags.removeAll { $0.id == tag.id }
        cast[tag.id.uuidString] = nil
        save()
    }

    func takes(for tagId: UUID) -> [Take] { takes.filter { $0.tagId == tagId } }

    // MARK: - Cloud sync helpers

    /// Insert a tag imported from the cloud, skipping if its id is already local.
    func upsert(tag: SongTag) {
        guard !tags.contains(where: { $0.id == tag.id }) else { return }
        tags.insert(tag, at: 0)
        save()
    }

    /// Insert a take imported from the cloud, skipping if its id is already local.
    func upsert(take: Take) {
        guard !takes.contains(where: { $0.id == take.id }) else { return }
        takes.append(take)
        save()
    }

    /// Record that a tag was published to the community (who created it, and
    /// the invite code minted for it — docs/10 §E).
    func markPublished(tagId: UUID, creatorUid: String, inviteCode: String?) {
        guard let i = tags.firstIndex(where: { $0.id == tagId }) else { return }
        if tags[i].creatorUid == nil { tags[i].creatorUid = creatorUid }
        if tags[i].inviteCode == nil { tags[i].inviteCode = inviteCode }
        tags[i].publishedAt = Date()
        save()
    }

    /// Record that a take's media was uploaded to Storage (and who owns it).
    func markUploaded(takeId: UUID, ownerUid: String) {
        guard let i = takes.firstIndex(where: { $0.id == takeId }) else { return }
        if takes[i].ownerUid == nil { takes[i].ownerUid = ownerUid }
        takes[i].uploadedAt = Date()
        save()
    }

    /// The quartet MY device plays, one take per part. Preference per part
    /// (docs/10 §F4): explicit cast selection → my own take (newest) → the
    /// first take ever recorded for the part (the pre-v2 default).
    func quartet(for tagId: UUID) -> [Part: Take] {
        let all = takes(for: tagId).sorted { $0.createdAt < $1.createdAt }
        var result: [Part: Take] = [:]
        for part in Part.allCases {
            let candidates = all.filter { $0.part == part }
            guard !candidates.isEmpty else { continue }
            if let castId = cast[tagId.uuidString]?[part.rawValue],
               let chosen = candidates.first(where: { $0.id.uuidString == castId }) {
                result[part] = chosen
            } else if let mine = candidates.last(where: { isMine($0) }) {
                result[part] = mine
            } else {
                result[part] = candidates.first
            }
        }
        return result
    }

    private func load() {
        guard let data = try? Data(contentsOf: metaURL),
              let snap = try? JSONDecoder().decode(Snapshot.self, from: data) else { return }
        tags = snap.tags
        takes = snap.takes
        cast = snap.cast ?? [:]
    }

    private func save() {
        let snap = Snapshot(tags: tags, takes: takes, cast: cast)
        if let data = try? JSONEncoder().encode(snap) {
            try? data.write(to: metaURL, options: .atomic)
        }
    }
}
