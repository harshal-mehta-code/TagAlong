import AVFoundation
import SwiftUI

// MARK: - Tag-along request (shared by Sing tab + Watch feed)

/// A resolved invitation: the adopted library tag and the part to sing.
/// Driving a fullScreenCover(item:) straight into the record flow.
struct TagAlongRequest: Identifiable {
    let tag: SongTag
    let part: Part
    var id: String { tag.id.uuidString + part.rawValue }
}

// MARK: - Frame-grab thumbnails

/// Frame grabs for takes, memoized process-wide. Grabs a frame one second
/// past the count-in so the singer is on screen, not the pre-roll darkness.
enum TakeThumbs {
    private static let cache = NSCache<NSString, UIImage>()

    static func thumb(for take: Take, url: URL) async -> UIImage? {
        let key = take.id.uuidString as NSString
        if let hit = cache.object(forKey: key) { return hit }
        let generator = AVAssetImageGenerator(asset: AVURLAsset(url: url))
        generator.appliesPreferredTrackTransform = true
        generator.maximumSize = CGSize(width: 480, height: 480)
        let target = min(take.startSec + QuartetPlayer.playStartSec + 1.0,
                         max(0.1, take.durationSec - 0.1))
        let time = CMTime(seconds: max(0.1, target), preferredTimescale: 600)
        guard let result = try? await generator.image(at: time) else { return nil }
        let image = UIImage(cgImage: result.image)
        cache.setObject(image, forKey: key)
        return image
    }
}

/// One collage tile's async-loaded frame grab; part-color wash until it lands.
struct TakeThumbView: View {
    let take: Take
    let url: URL
    @State private var image: UIImage?

    var body: some View {
        GeometryReader { geo in
            if let image {
                Image(uiImage: image)
                    .resizable()
                    .scaledToFill()
                    .frame(width: geo.size.width, height: geo.size.height)
                    .clipped()
            } else {
                take.part.color.opacity(0.22)
            }
        }
        .task(id: take.id) { image = await TakeThumbs.thumb(for: take, url: url) }
    }
}

// MARK: - TagCard

/// What a TagCard renders: title, key, which parts are filled, and any media
/// we can actually thumbnail (library files, or cached cloud files).
struct TagCardModel {
    var title: String
    var key: PitchKey
    var filled: Set<Part>
    var media: [Part: (take: Take, url: URL)]

    @MainActor
    init(tag: SongTag, store: Store) {
        title = tag.title
        key = tag.key
        let quartet = store.quartet(for: tag.id)
        filled = Set(quartet.keys)
        media = quartet.mapValues { ($0, store.mediaURL(for: $0)) }
    }

    @MainActor
    init(cloudTag: CloudTag, cache: CloudCache) {
        title = cloudTag.title
        key = cloudTag.key
        filled = Set(cloudTag.parts)
        var found: [Part: (take: Take, url: URL)] = [:]
        for (part, take) in cache.loaded[cloudTag.id]?.featured ?? [:] {
            let url = cache.url(for: take)
            if FileManager.default.fileExists(atPath: url.path) { found[part] = (take, url) }
        }
        media = found
    }
}

/// The unit of UI everywhere (docs/10 §B): every tag, anywhere in the app, is
/// a card built from its real tiles — a mini 2×2 collage of frame grabs, open
/// slots as dark velvet with a pulsing rim in the part's color.
struct TagCard: View {
    enum Style { case row, rail, tile }

    let model: TagCardModel
    var style: Style = .row
    /// Rail cards are invitations addressed to you: "Sing the bass".
    var invitationPart: Part? = nil
    /// 0…1 while a take of this tag uploads (docs/10 §F6).
    var uploadProgress: Double? = nil
    /// True when the last publish/upload attempt for this tag failed.
    var uploadFailed: Bool = false

    var body: some View {
        switch style {
        case .row: rowBody
        case .rail: railBody
        case .tile: tileBody
        }
    }

    private var rowBody: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(spacing: 12) {
                collage
                    .frame(width: 88, height: 88)
                VStack(alignment: .leading, spacing: 6) {
                    Text(model.title)
                        .font(.system(.headline, design: .serif))
                        .foregroundStyle(Theme.textPrimary)
                        .lineLimit(2)
                    KeyChip(key: model.key)
                    PartChipsRow(filled: model.filled)
                }
                Spacer(minLength: 0)
            }
            if uploadFailed {
                HStack(spacing: 5) {
                    Image(systemName: "exclamationmark.icloud")
                    Text("Upload didn't finish — tap retry below")
                }
                .font(.system(size: 10, weight: .semibold))
                .foregroundStyle(Theme.record)
            } else if let uploadProgress {
                VStack(alignment: .leading, spacing: 3) {
                    Text("Uploading your voice… \(Int(uploadProgress * 100))%")
                        .font(.system(size: 10, weight: .semibold))
                        .foregroundStyle(Theme.textSecondary)
                    ProgressView(value: max(0, min(1, uploadProgress)))
                        .tint(Theme.brass)
                }
            }
        }
        .padding(12)
        .background(Theme.card, in: RoundedRectangle(cornerRadius: 18))
        .overlay(RoundedRectangle(cornerRadius: 18).stroke(Theme.line, lineWidth: 1))
    }

    private var railBody: some View {
        VStack(alignment: .leading, spacing: 8) {
            collage
                .frame(width: 148, height: 148)
            Text(model.title)
                .font(.system(.subheadline, design: .serif).weight(.semibold))
                .foregroundStyle(Theme.textPrimary)
                .lineLimit(1)
            if let part = invitationPart {
                HStack(spacing: 5) {
                    Image(systemName: "music.mic").font(.system(size: 10, weight: .bold))
                    Text("Sing the \(part.label.lowercased())")
                        .font(.caption.weight(.semibold))
                }
                .foregroundStyle(part.color)
            } else {
                PartChipsRow(filled: model.filled)
            }
        }
        .frame(width: 148, alignment: .leading)
        .padding(10)
        .background(Theme.card, in: RoundedRectangle(cornerRadius: 18))
        .overlay(RoundedRectangle(cornerRadius: 18).stroke(Theme.line, lineWidth: 1))
    }

    private var tileBody: some View {
        VStack(alignment: .leading, spacing: 6) {
            collage
                .aspectRatio(1, contentMode: .fit)
            HStack {
                Text(model.title)
                    .font(.system(.footnote, design: .serif).weight(.semibold))
                    .foregroundStyle(Theme.textPrimary)
                    .lineLimit(1)
                Spacer(minLength: 4)
                KeyChip(key: model.key)
            }
        }
        .padding(8)
        .background(Theme.card, in: RoundedRectangle(cornerRadius: 16))
        .overlay(RoundedRectangle(cornerRadius: 16).stroke(Theme.line, lineWidth: 1))
    }

    // MARK: Collage

    private var collage: some View {
        VStack(spacing: 1.5) {
            HStack(spacing: 1.5) {
                collageTile(.tenor)
                collageTile(.lead)
            }
            HStack(spacing: 1.5) {
                collageTile(.bari)
                collageTile(.bass)
            }
        }
        .background(Color.black)
        .clipShape(RoundedRectangle(cornerRadius: 12))
    }

    @ViewBuilder
    private func collageTile(_ part: Part) -> some View {
        Group {
            if let m = model.media[part] {
                TakeThumbView(take: m.take, url: m.url)
            } else if model.filled.contains(part) {
                // Filled in the cloud, media not on this phone: part-color wash.
                Rectangle().fill(part.color.opacity(0.3))
            } else {
                EmptySlotTile(part: part)
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .clipped()
    }
}

/// Dark velvet + pulsing part-color rim: an open slot, still waiting.
struct EmptySlotTile: View {
    let part: Part
    @State private var pulse = false

    var body: some View {
        ZStack {
            Rectangle().fill(Color(hex: 0x160D26))
            Text(part.label.lowercased())
                .font(.system(size: 8, weight: .bold))
                .tracking(0.5)
                .foregroundStyle(part.color.opacity(0.85))
        }
        .overlay(
            Rectangle()
                .strokeBorder(part.color.opacity(pulse ? 0.85 : 0.25), lineWidth: 1.5)
        )
        .onAppear {
            withAnimation(.easeInOut(duration: 1.4).repeatForever(autoreverses: true)) {
                pulse = true
            }
        }
    }
}

/// Four part chips: filled = solid in the part color, open = outlined.
struct PartChipsRow: View {
    let filled: Set<Part>

    var body: some View {
        HStack(spacing: 5) {
            ForEach(Part.allCases) { part in
                let isFilled = filled.contains(part)
                Text(part.label)
                    .font(.system(size: 10, weight: .semibold))
                    .padding(.horizontal, 7)
                    .padding(.vertical, 3)
                    .background(isFilled ? part.color : .clear, in: Capsule())
                    .overlay(Capsule().stroke(part.color.opacity(isFilled ? 0 : 0.55), lineWidth: 1))
                    .foregroundStyle(isFilled ? Color.black.opacity(0.8) : part.color.opacity(0.9))
            }
        }
    }
}
