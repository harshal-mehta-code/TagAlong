import AVFoundation
import SwiftUI

/// Drives one take: camera up → count-in (guides anchored to the clicks) →
/// sing → stop → review-ready Take with an EXACT t0 offset.
@MainActor
final class RecordController: ObservableObject {
    enum Stage: Equatable {
        case permission, ready, countIn, recording, review, failed(String)
    }

    @Published var stage: Stage = .permission
    @Published var countdown = AudioClock.countInClicks
    @Published var elapsedSec: Double = 0
    @Published var pendingTake: Take?

    let recorder = TakeRecorder()
    let guides = QuartetPlayer()

    static let maxSingSec: Double = 60

    private var t0HeardHost: UInt64 = 0
    private var fileURL: URL?
    private var tick: Timer?
    private var configured = false

    func prepare(guideTakes: [Part: Take], store: Store) async {
        let cam = await AVCaptureDevice.requestAccess(for: .video)
        let mic = await AVCaptureDevice.requestAccess(for: .audio)
        guard cam && mic else {
            stage = .failed("Camera and microphone access are required to sing. Enable them in Settings.")
            return
        }
        AudioClock.shared.configureSession(recording: true)
        if !configured {
            do {
                try recorder.configure()
                configured = true
            } catch {
                stage = .failed(error.localizedDescription)
                return
            }
        }
        let session = recorder.session
        Task.detached { session.startRunning() }
        guides.load(takes: guideTakes, store: store)
        stage = .ready
    }

    func begin(store: Store) {
        guard stage == .ready else { return }
        let url = store.newMediaURL()
        do {
            try recorder.startWriting(to: url)
        } catch {
            stage = .failed(error.localizedDescription)
            return
        }
        fileURL = url
        Task { @MainActor in
            // guides parked on their first frames before the clock starts
            await guides.preroll(toMasterSec: 0)
            let countIn = AudioClock.shared.scheduleCountIn(leadSec: 1.0)
            self.t0HeardHost = countIn.heardHost
            self.guides.playAnchored(masterZeroAtHost: countIn.scheduledHost)
            self.stage = .countIn
            self.startTicking()
        }
    }

    private func startTicking() {
        tick?.invalidate()
        tick = Timer.scheduledTimer(withTimeInterval: 1.0 / 30, repeats: true) { [weak self] _ in
            Task { @MainActor [weak self] in self?.onTick() }
        }
    }

    private func onTick() {
        guard stage == .countIn || stage == .recording else { return }
        let masterSec = AVAudioTime.seconds(forHostTime: mach_absolute_time())
            - AVAudioTime.seconds(forHostTime: t0HeardHost)
        if masterSec < AudioClock.countInSec {
            let remaining = AudioClock.countInClicks - Int(max(0, masterSec) / AudioClock.clickIntervalSec)
            if remaining != countdown { countdown = max(1, remaining) }
            if stage != .countIn { stage = .countIn }
        } else {
            elapsedSec = masterSec - AudioClock.countInSec
            if stage != .recording { stage = .recording }
            if elapsedSec >= Self.maxSingSec { Task { await stop(tagId: nil) } }
        }
    }

    /// Stop and package the take. `tagId` nil = abort (file discarded).
    func stop(tagId: UUID?) async {
        tick?.invalidate()
        tick = nil
        guides.pause()
        AudioClock.shared.stop()
        var duration: Double = 0
        do {
            duration = try await recorder.stopWriting()
        } catch {
            stage = .failed(error.localizedDescription)
            return
        }
        guard let tagId, let url = fileURL else {
            if let url = fileURL { try? FileManager.default.removeItem(at: url) }
            stage = .ready
            return
        }
        let t0 = recorder.fileTime(ofHostTime: t0HeardHost)
        pendingTake = Take(
            tagId: tagId,
            part: .lead, // caller overwrites
            fileName: url.lastPathComponent,
            t0OffsetSec: max(0, t0),
            durationSec: duration
        )
        stage = .review
    }

    func discardPending() {
        if let take = pendingTake, let url = fileURL, url.lastPathComponent == take.fileName {
            try? FileManager.default.removeItem(at: url)
        }
        pendingTake = nil
        stage = .ready
    }

    func teardown() {
        tick?.invalidate()
        guides.unload()
        recorder.teardown()
        AudioClock.shared.configureSession(recording: false)
    }
}

/// Live camera preview (mirrored like a mirror; the FILE stays unmirrored).
struct CameraPreviewView: UIViewRepresentable {
    let session: AVCaptureSession

    final class PreviewView: UIView {
        override static var layerClass: AnyClass { AVCaptureVideoPreviewLayer.self }
        var previewLayer: AVCaptureVideoPreviewLayer { layer as! AVCaptureVideoPreviewLayer }
    }

    func makeUIView(context: Context) -> PreviewView {
        let v = PreviewView()
        v.previewLayer.session = session
        v.previewLayer.videoGravity = .resizeAspectFill
        return v
    }

    func updateUIView(_ uiView: PreviewView, context: Context) {}
}
