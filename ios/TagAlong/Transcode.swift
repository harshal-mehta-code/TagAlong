import AVFoundation
import Foundation

/// Upload discipline (docs/10 §F6): shrink a raw camera take (~full-res .mov)
/// to 720p before it goes to Storage, keeping Blaze bills and cell data sane.
enum TakeTranscoder {
    /// Transcode to a temporary 720p .mp4. Returns nil when the export can't
    /// run (unsupported asset, preset unavailable) — the caller uploads the
    /// original instead, so failure here never blocks a publish.
    ///
    /// Note: AVFoundation ships no HEVC-720p preset (HEVC presets start at
    /// 1080p), so this uses the H.264 1280x720 preset — still a ~4-5× size cut
    /// versus the raw capture, and decodable everywhere.
    static func transcode720p(_ src: URL) async -> URL? {
        let asset = AVURLAsset(url: src)
        let preset = AVAssetExportPreset1280x720
        let compatible = await withCheckedContinuation { (cont: CheckedContinuation<Bool, Never>) in
            AVAssetExportSession.determineCompatibility(
                ofExportPreset: preset, with: asset, outputFileType: .mp4) { cont.resume(returning: $0) }
        }
        guard compatible,
              let session = AVAssetExportSession(asset: asset, presetName: preset) else { return nil }

        let out = FileManager.default.temporaryDirectory
            .appendingPathComponent("upload-\(UUID().uuidString).mp4")
        session.outputURL = out
        session.outputFileType = .mp4
        session.shouldOptimizeForNetworkUse = true

        await withCheckedContinuation { (cont: CheckedContinuation<Void, Never>) in
            session.exportAsynchronously { cont.resume() }
        }
        guard session.status == .completed else {
            try? FileManager.default.removeItem(at: out)
            return nil
        }
        return out
    }
}
