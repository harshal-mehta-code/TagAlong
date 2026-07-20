import AVFoundation
import Photos
import SwiftUI
import UIKit

/// Renders a completed quartet to a single vertical MP4 (1080×1920, 2×2 grid,
/// all four audio tracks mixed) for the system share sheet. Same window the
/// live player uses: master time [playStartSec … masterEndSec], so the export
/// matches what the watcher hears — no count-in clicks, shorter takes end early.
@MainActor
final class PerformanceExporter: ObservableObject {
    @Published private(set) var isExporting = false
    @Published private(set) var progress: Double = 0

    enum ExportError: LocalizedError {
        case noTakes, sessionInit, failed(String), cancelled
        var errorDescription: String? {
            switch self {
            case .noTakes:            return "This performance has no takes to export."
            case .sessionInit:        return "Couldn't start the video encoder."
            case .failed(let m):      return m
            case .cancelled:          return "Export cancelled."
            }
        }
    }

    // Render geometry: portrait 9:16, four 540×960 quadrants.
    private static let renderSize = CGSize(width: 1080, height: 1920)
    private static let quadSize = CGSize(width: 540, height: 960)

    /// Top-left origin of each part's quadrant in render space (origin top-left,
    /// y-down — the coordinate system preferredTransform targets). Matches the
    /// in-app QuartetGrid: tenor TL, lead TR, bari BL, bass BR.
    private static func quadrantOrigin(_ part: Part) -> CGPoint {
        switch part {
        case .tenor: return CGPoint(x: 0,   y: 0)
        case .lead:  return CGPoint(x: 540, y: 0)
        case .bari:  return CGPoint(x: 0,   y: 960)
        case .bass:  return CGPoint(x: 540, y: 960)
        }
    }

    private var session: AVAssetExportSession?
    private var progressTimer: Timer?

    func export(tag: SongTag, quartet: [Part: Take], store: Store) async throws -> URL {
        try await export(title: tag.title, quartet: quartet) { store.mediaURL(for: $0) }
    }

    /// Media-source-agnostic export: the library renders from Documents, the
    /// Watch feed straight from the CloudCache (docs/10 §A).
    func export(title: String, quartet: [Part: Take], mediaURL: (Take) -> URL) async throws -> URL {
        guard !quartet.isEmpty else { throw ExportError.noTakes }
        isExporting = true
        progress = 0
        defer {
            isExporting = false
            stopProgressPolling()
            session = nil
        }

        let ts: CMTimeScale = 600
        let playStart = QuartetPlayer.playStartSec

        // Load every asset up front and trust the FILE's duration over stored
        // metadata: early builds persisted durationSec 0 on a capture race,
        // and trusting it silently dropped that part's quadrant.
        var sources: [(part: Part, take: Take, asset: AVURLAsset, fileDur: Double)] = []
        for part in Part.allCases {
            guard let take = quartet[part] else { continue }
            let asset = AVURLAsset(url: mediaURL(take))
            let assetDur = (try? await asset.load(.duration).seconds) ?? 0
            let fileDur = max(take.durationSec, assetDur)
            if fileDur > 0 { sources.append((part, take, asset, fileDur)) }
        }
        guard !sources.isEmpty else { throw ExportError.noTakes }
        let masterEnd = sources.map { $0.fileDur - $0.take.startSec }.max() ?? 0
        let windowLen = masterEnd - playStart

        let composition = AVMutableComposition()
        var layerInstructions: [AVMutableVideoCompositionLayerInstruction] = []
        var audioParams: [AVMutableAudioMixInputParameters] = []

        for (part, take, asset, fileDur) in sources {
            let videoTracks = try await asset.loadTracks(withMediaType: .video)
            let audioTracks = try await asset.loadTracks(withMediaType: .audio)
            guard let srcVideo = videoTracks.first else { continue }

            // File time for master time m is (startSec + m). Clamp the tail to
            // the file length; a shorter take just leaves its quadrant blank
            // once its media runs out.
            let sourceStart = take.startSec + playStart
            let sourceEnd = min(fileDur, take.startSec + playStart + windowLen)
            guard sourceEnd > sourceStart else { continue }

            // Audio can outlast video by a few frames (or vice versa); an
            // insert past a track's own extent throws, so clamp per track.
            let videoTrackEnd = (try await srcVideo.load(.timeRange)).end.seconds
            let videoDur = max(0, min(sourceEnd, videoTrackEnd) - sourceStart)
            guard videoDur > 0 else { continue }
            let srcRange = CMTimeRange(
                start: CMTime(seconds: sourceStart, preferredTimescale: ts),
                duration: CMTime(seconds: videoDur, preferredTimescale: ts))

            guard let compVideo = composition.addMutableTrack(
                withMediaType: .video, preferredTrackID: kCMPersistentTrackID_Invalid) else { continue }
            try compVideo.insertTimeRange(srcRange, of: srcVideo, at: .zero)

            let preferredTransform = try await srcVideo.load(.preferredTransform)
            let naturalSize = try await srcVideo.load(.naturalSize)
            let (transform, cropSource) = Self.fitTransform(
                natural: naturalSize,
                preferred: preferredTransform,
                quadrantOrigin: Self.quadrantOrigin(part))

            let li = AVMutableVideoCompositionLayerInstruction(assetTrack: compVideo)
            li.setCropRectangle(cropSource, at: .zero)
            li.setTransform(transform, at: .zero)
            layerInstructions.append(li)

            if let srcAudio = audioTracks.first,
               let compAudio = composition.addMutableTrack(
                withMediaType: .audio, preferredTrackID: kCMPersistentTrackID_Invalid) {
                let audioTrackEnd = (try await srcAudio.load(.timeRange)).end.seconds
                let audioDur = max(0, min(sourceEnd, audioTrackEnd) - sourceStart)
                if audioDur > 0 {
                    let audioRange = CMTimeRange(
                        start: CMTime(seconds: sourceStart, preferredTimescale: ts),
                        duration: CMTime(seconds: audioDur, preferredTimescale: ts))
                    try compAudio.insertTimeRange(audioRange, of: srcAudio, at: .zero)
                    let ap = AVMutableAudioMixInputParameters(track: compAudio)
                    ap.setVolume(1, at: .zero)
                    audioParams.append(ap)
                }
            }
        }

        guard composition.duration.seconds > 0 else { throw ExportError.noTakes }

        let instruction = AVMutableVideoCompositionInstruction()
        instruction.timeRange = CMTimeRange(start: .zero, duration: composition.duration)
        instruction.layerInstructions = layerInstructions

        let videoComposition = AVMutableVideoComposition()
        videoComposition.renderSize = Self.renderSize
        videoComposition.frameDuration = CMTime(value: 1, timescale: 30)
        videoComposition.instructions = [instruction]
        Self.attachWatermark(to: videoComposition, title: title)

        let audioMix = AVMutableAudioMix()
        audioMix.inputParameters = audioParams

        let outURL = FileManager.default.temporaryDirectory
            .appendingPathComponent(Self.sanitize(title) + ".mp4")
        try? FileManager.default.removeItem(at: outURL)

        guard let session = AVAssetExportSession(
            asset: composition, presetName: AVAssetExportPresetHighestQuality) else {
            throw ExportError.sessionInit
        }
        session.outputURL = outURL
        session.outputFileType = .mp4
        session.videoComposition = videoComposition
        session.audioMix = audioMix
        session.shouldOptimizeForNetworkUse = true
        self.session = session

        startProgressPolling()
        await withCheckedContinuation { (cont: CheckedContinuation<Void, Never>) in
            session.exportAsynchronously { cont.resume() }
        }
        stopProgressPolling()

        switch session.status {
        case .completed:
            progress = 1
            return outURL
        case .cancelled:
            throw ExportError.cancelled
        default:
            throw ExportError.failed(session.error?.localizedDescription ?? "Export failed.")
        }
    }

    // MARK: - Coordinate spaces

    /// Aspect-fill a source video into a 540×960 quadrant.
    ///
    /// Pipeline the compositor runs per frame: source frame (naturalSize) → crop
    /// → transform → render. So the transform must bake in preferredTransform,
    /// and the crop rectangle lives in RAW source coordinates (pre-transform).
    ///
    /// We reason in "display space" (source after preferredTransform, where the
    /// frame sits upright), compute a centered crop there matching the quadrant's
    /// 9:16 aspect, then map that crop back through preferredTransform⁻¹ to get
    /// the source-space rectangle setCropRectangle wants. The transform scales
    /// the cropped region to exactly fill the quadrant and translates it home.
    private static func fitTransform(natural: CGSize,
                                     preferred: CGAffineTransform,
                                     quadrantOrigin: CGPoint) -> (CGAffineTransform, CGRect) {
        // Upright frame in display space (90°/180° preferredTransforms include a
        // translation that keeps this at a non-negative origin — honor it).
        let displayRect = CGRect(origin: .zero, size: natural).applying(preferred)
        let targetAspect = quadSize.width / quadSize.height // 9:16

        let cropW: CGFloat, cropH: CGFloat
        if displayRect.width / displayRect.height > targetAspect {
            cropH = displayRect.height
            cropW = cropH * targetAspect
        } else {
            cropW = displayRect.width
            cropH = cropW / targetAspect
        }
        let cropDisplay = CGRect(
            x: displayRect.midX - cropW / 2,
            y: displayRect.midY - cropH / 2,
            width: cropW, height: cropH)

        let scale = quadSize.width / cropW // == quadSize.height / cropH
        // After scale, the crop's top-left must land on the quadrant's top-left.
        let tx = quadrantOrigin.x - scale * cropDisplay.minX
        let ty = quadrantOrigin.y - scale * cropDisplay.minY
        let transform = preferred
            .concatenating(CGAffineTransform(scaleX: scale, y: scale))
            .concatenating(CGAffineTransform(translationX: tx, y: ty))

        // Crop is applied before the transform → express it in source coords.
        let cropSource = cropDisplay.applying(preferred.inverted())
        return (transform, cropSource)
    }

    // MARK: - Watermark

    private static func attachWatermark(to videoComposition: AVMutableVideoComposition,
                                        title: String) {
        // Core Animation coordinate space: origin BOTTOM-left. The horizontal
        // seam sits at renderHeight/2; center the label over it.
        let parent = CALayer()
        parent.frame = CGRect(origin: .zero, size: renderSize)
        let video = CALayer()
        video.frame = parent.frame
        parent.addSublayer(video)

        let text = CATextLayer()
        text.string = "♪ \(title) · TagAlong"
        text.font = UIFont.systemFont(ofSize: 30, weight: .semibold)
        text.fontSize = 30
        text.alignmentMode = .center
        text.isWrapped = false
        text.truncationMode = .end
        text.contentsScale = 1
        text.foregroundColor = UIColor(Theme.ivory).withAlphaComponent(0.6).cgColor
        text.shadowColor = UIColor.black.cgColor
        text.shadowOpacity = 0.5
        text.shadowRadius = 3
        text.shadowOffset = .zero
        text.frame = CGRect(x: 0, y: renderSize.height / 2 - 22, width: renderSize.width, height: 44)
        parent.addSublayer(text)

        videoComposition.animationTool = AVVideoCompositionCoreAnimationTool(
            postProcessingAsVideoLayer: video, in: parent)
    }

    // MARK: - Progress

    private func startProgressPolling() {
        progressTimer?.invalidate()
        progressTimer = Timer.scheduledTimer(withTimeInterval: 0.1, repeats: true) { [weak self] _ in
            Task { @MainActor [weak self] in
                guard let self, let s = self.session, self.isExporting else { return }
                self.progress = Double(s.progress)
            }
        }
    }

    private func stopProgressPolling() {
        progressTimer?.invalidate()
        progressTimer = nil
    }

    // MARK: - Filename

    private static func sanitize(_ title: String) -> String {
        let illegal = CharacterSet(charactersIn: "/\\:*?\"<>|").union(.newlines)
        let cleaned = title.components(separatedBy: illegal).joined(separator: "-")
            .trimmingCharacters(in: .whitespacesAndNewlines)
        return cleaned.isEmpty ? "TagAlong" : cleaned
    }
}

// MARK: - Share sheet

/// UIActivityViewController for the just-rendered MP4. ShareLink can't take a
/// runtime-created temp URL cleanly, so wrap the UIKit sheet directly.
struct ActivityView: UIViewControllerRepresentable {
    let items: [Any]
    func makeUIViewController(context: Context) -> UIActivityViewController {
        UIActivityViewController(activityItems: items, applicationActivities: nil)
    }
    func updateUIViewController(_ vc: UIActivityViewController, context: Context) {}
}

private struct SharePayload: Identifiable {
    let id = UUID()
    let url: URL
}

// MARK: - Export + share wiring

extension View {
    /// Drives export off `isActive`, showing a brass progress overlay, then the
    /// share sheet on success or an alert on failure. Pauses playback via
    /// `onStart` (don't unload). Attach at a screen's ZStack root so the overlay
    /// covers the full bleed.
    func performanceExport(isActive: Binding<Bool>,
                           tag: SongTag,
                           quartet: [Part: Take],
                           store: Store,
                           onStart: @escaping () -> Void) -> some View {
        modifier(PerformanceExportModifier(
            isActive: isActive, title: tag.title, quartet: quartet,
            mediaURL: { store.mediaURL(for: $0) }, onStart: onStart))
    }

    /// Cache-backed variant for community feed pages (docs/10 §A: the library
    /// is never touched by watching — or by sharing what you watched).
    func performanceExport(isActive: Binding<Bool>,
                           title: String,
                           quartet: [Part: Take],
                           mediaURL: @escaping (Take) -> URL,
                           onStart: @escaping () -> Void) -> some View {
        modifier(PerformanceExportModifier(
            isActive: isActive, title: title, quartet: quartet,
            mediaURL: mediaURL, onStart: onStart))
    }
}

private struct PerformanceExportModifier: ViewModifier {
    @Binding var isActive: Bool
    let title: String
    let quartet: [Part: Take]
    let mediaURL: (Take) -> URL
    let onStart: () -> Void

    @StateObject private var exporter = PerformanceExporter()
    @State private var payload: SharePayload?
    @State private var errorMessage: String?

    func body(content: Content) -> some View {
        content
            .overlay {
                if exporter.isExporting {
                    ZStack {
                        Color.black.opacity(0.6).ignoresSafeArea()
                        VStack(spacing: 14) {
                            ProgressView().tint(Theme.brass).controlSize(.large)
                            Text("Rendering… \(Int(exporter.progress * 100))%")
                                .font(.subheadline.weight(.semibold).monospacedDigit())
                                .foregroundStyle(Theme.textPrimary)
                        }
                        .padding(28)
                        .background(Theme.card, in: RoundedRectangle(cornerRadius: 18))
                        .overlay(RoundedRectangle(cornerRadius: 18).stroke(Theme.line, lineWidth: 1))
                    }
                    .transition(.opacity)
                }
            }
            .animation(.easeInOut(duration: 0.2), value: exporter.isExporting)
            .onChange(of: isActive) { _, active in
                guard active else { return }
                onStart()
                Task {
                    defer { isActive = false }
                    do {
                        let url = try await exporter.export(title: title, quartet: quartet, mediaURL: mediaURL)
                        payload = SharePayload(url: url)
                    } catch is CancellationError {
                        // ignore
                    } catch {
                        errorMessage = error.localizedDescription
                    }
                }
            }
            .sheet(item: $payload) { p in ExportResultSheet(url: p.url) }
            .alert("Couldn't share", isPresented: Binding(
                get: { errorMessage != nil },
                set: { if !$0 { errorMessage = nil } })
            ) {
                Button("OK", role: .cancel) {}
            } message: {
                Text(errorMessage ?? "")
            }
    }
}

/// Post-export destination sheet: Save to Photos is the tap most users want,
/// so it gets a first-class button instead of hiding inside the share sheet.
private struct ExportResultSheet: View {
    let url: URL
    @Environment(\.dismiss) private var dismiss
    @State private var shareShown = false
    @State private var saveState: SaveState = .idle

    enum SaveState: Equatable { case idle, saving, saved, failed(String) }

    var body: some View {
        VStack(spacing: 14) {
            Text("Performance ready")
                .font(.title3.weight(.semibold))
                .foregroundStyle(Theme.textPrimary)
                .padding(.top, 22)

            Button(action: saveToPhotos) {
                HStack(spacing: 8) {
                    switch saveState {
                    case .saving:
                        ProgressView().tint(.black)
                    case .saved:
                        Image(systemName: "checkmark.circle.fill")
                        Text("Saved to Photos")
                    default:
                        Image(systemName: "square.and.arrow.down")
                        Text("Save to Photos")
                    }
                }
                .font(.headline)
                .frame(maxWidth: .infinity)
                .padding(.vertical, 14)
                .background(saveState == .saved ? Theme.brassSoft : Theme.brass,
                            in: RoundedRectangle(cornerRadius: 14))
                .foregroundStyle(.black.opacity(0.85))
            }
            .disabled(saveState == .saving || saveState == .saved)

            Button { shareShown = true } label: {
                HStack(spacing: 8) {
                    Image(systemName: "square.and.arrow.up")
                    Text("Share…")
                }
                .font(.headline)
                .frame(maxWidth: .infinity)
                .padding(.vertical, 14)
                .background(RoundedRectangle(cornerRadius: 14).stroke(Theme.brass, lineWidth: 1.5))
                .foregroundStyle(Theme.brass)
            }

            if case .failed(let message) = saveState {
                Text(message)
                    .font(.footnote)
                    .foregroundStyle(Theme.record)
                    .multilineTextAlignment(.center)
            }
        }
        .padding(.horizontal, 24)
        .padding(.bottom, 16)
        .presentationDetents([.height(240)])
        .presentationBackground(Theme.card)
        .sheet(isPresented: $shareShown) { ActivityView(items: [url]) }
    }

    private func saveToPhotos() {
        saveState = .saving
        Task {
            let status = await PHPhotoLibrary.requestAuthorization(for: .addOnly)
            guard status == .authorized || status == .limited else {
                saveState = .failed("Allow photo access in Settings to save.")
                return
            }
            do {
                try await PHPhotoLibrary.shared().performChanges {
                    PHAssetChangeRequest.creationRequestForAssetFromVideo(atFileURL: url)
                }
                saveState = .saved
                UINotificationFeedbackGenerator().notificationOccurred(.success)
            } catch {
                saveState = .failed(error.localizedDescription)
            }
        }
    }
}

/// Brass share button matching the app's chrome-icon idiom.
struct ShareChromeButton: View {
    let action: () -> Void
    var body: some View {
        Button(action: action) {
            Image(systemName: "square.and.arrow.up")
                .font(.title3.bold())
                .foregroundStyle(Theme.brass)
                .frame(width: 40, height: 40)
        }
    }
}
