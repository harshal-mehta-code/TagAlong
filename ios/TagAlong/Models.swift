import Foundation
import SwiftUI

enum Part: String, Codable, CaseIterable, Identifiable {
    case tenor, lead, bari, bass
    var id: String { rawValue }
    var label: String { rawValue.capitalized }
    var color: Color {
        switch self {
        case .tenor: return Color(red: 0.55, green: 0.65, blue: 0.95)
        case .lead: return Color(red: 0.85, green: 0.45, blue: 0.45)
        case .bari: return Color(red: 0.55, green: 0.78, blue: 0.60)
        case .bass: return Color(red: 0.80, green: 0.65, blue: 0.35)
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

struct SongTag: Codable, Identifiable {
    var id: UUID = UUID()
    var title: String
    var key: PitchKey
    var createdAt: Date = Date()
}

struct Take: Codable, Identifiable {
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

    var startSec: Double { t0OffsetSec + nudgeSec }
}

/// Local-first persistence: JSON metadata + movie files in Documents.
@MainActor
final class Store: ObservableObject {
    @Published private(set) var tags: [SongTag] = []
    @Published private(set) var takes: [Take] = []

    private let dir: URL
    private var metaURL: URL { dir.appendingPathComponent("tagalong.json") }

    struct Snapshot: Codable {
        var tags: [SongTag]
        var takes: [Take]
    }

    init() {
        dir = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask)[0]
        load()
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

    func updateNudge(takeId: UUID, nudgeSec: Double) {
        guard let i = takes.firstIndex(where: { $0.id == takeId }) else { return }
        takes[i].nudgeSec = nudgeSec
        save()
    }

    func delete(take: Take) {
        takes.removeAll { $0.id == take.id }
        try? FileManager.default.removeItem(at: mediaURL(for: take))
        save()
    }

    func delete(tag: SongTag) {
        for t in takes(for: tag.id) { try? FileManager.default.removeItem(at: mediaURL(for: t)) }
        takes.removeAll { $0.tagId == tag.id }
        tags.removeAll { $0.id == tag.id }
        save()
    }

    func takes(for tagId: UUID) -> [Take] { takes.filter { $0.tagId == tagId } }

    /// First take per part, in part order — the default quartet combination.
    func quartet(for tagId: UUID) -> [Part: Take] {
        var result: [Part: Take] = [:]
        for take in takes(for: tagId).sorted(by: { $0.createdAt < $1.createdAt }) {
            if result[take.part] == nil { result[take.part] = take }
        }
        return result
    }

    private func load() {
        guard let data = try? Data(contentsOf: metaURL),
              let snap = try? JSONDecoder().decode(Snapshot.self, from: data) else { return }
        tags = snap.tags
        takes = snap.takes
    }

    private func save() {
        let snap = Snapshot(tags: tags, takes: takes)
        if let data = try? JSONEncoder().encode(snap) {
            try? data.write(to: metaURL, options: .atomic)
        }
    }
}
