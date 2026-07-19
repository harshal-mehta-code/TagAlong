import AVFoundation
import SwiftUI

/// Plays up to four takes as one performance: every AVPlayer is anchored to
/// the SAME host-clock instant with `setRate(_:time:atHostTime:)`, so video
/// and audio across all parts are hardware-locked — no drift loops, no premix,
/// no pre-render wait. This one call is why the native app exists.
@MainActor
final class QuartetPlayer: ObservableObject {
    struct Slot {
        let take: Take
        let player: AVPlayer
    }

    @Published private(set) var isPlaying = false
    @Published var solo: Part? = nil {
        didSet { applyVolumes() }
    }
    private(set) var slots: [Part: Slot] = [:]
    private var masterEndSec: Double = 0
    private var endTimer: Timer?

    /// Master time where playback starts: just past the count-in's last click.
    nonisolated static var playStartSec: Double { AudioClock.countInSec - 0.15 }

    func load(takes: [Part: Take], store: Store) {
        load(takes: takes) { store.mediaURL(for: $0) }
    }

    /// Media-source-agnostic load: the library plays from Documents via the
    /// Store, the Watch feed plays straight from the CloudCache (docs/10 §A —
    /// watching never touches the Store).
    func load(takes: [Part: Take], mediaURL: (Take) -> URL) {
        unload()
        for (part, take) in takes {
            let item = AVPlayerItem(url: mediaURL(take))
            let player = AVPlayer(playerItem: item)
            player.automaticallyWaitsToMinimizeStalling = false // required for setRate(atHostTime:)
            player.actionAtItemEnd = .pause // shorter takes freeze; the master keeps going
            slots[part] = Slot(take: take, player: player)
            let contentEnd = take.durationSec - take.startSec
            masterEndSec = max(masterEndSec, contentEnd)
        }
        applyVolumes()
    }

    func unload() {
        pause()
        slots = [:]
        masterEndSec = 0
    }

    private func applyVolumes() {
        for (part, slot) in slots {
            slot.player.volume = (solo == nil || solo == part) ? 1 : 0
        }
    }

    /// Park every part on its decoded frame for `masterSec`, ready for an
    /// instant anchored start.
    func preroll(toMasterSec masterSec: Double) async {
        await withTaskGroup(of: Void.self) { group in
            for slot in slots.values {
                group.addTask { @MainActor in
                    // AVPlayer.preroll(atRate:) throws NSInvalidArgumentException
                    // when the player is not readyToPlay — freshly loaded items
                    // are .unknown, so auto-play right after load() raced it and
                    // crashed. Wait for readiness; skip preroll if it never comes
                    // (setRate still anchors the player, it just joins unbuffered).
                    await Self.waitUntilReady(slot.player)
                    guard slot.player.status == .readyToPlay else { return }
                    let target = CMTime(seconds: slot.take.startSec + masterSec, preferredTimescale: 600)
                    await slot.player.seek(to: target, toleranceBefore: .zero, toleranceAfter: .zero)
                    _ = await withCheckedContinuation { (cont: CheckedContinuation<Bool, Never>) in
                        slot.player.preroll(atRate: 1) { cont.resume(returning: $0) }
                    }
                }
            }
        }
    }

    /// Poll until the player (and its item) leave `.unknown`, or time out.
    private static func waitUntilReady(_ player: AVPlayer, timeoutSec: Double = 4) async {
        let deadline = ContinuousClock.now.advanced(by: .seconds(timeoutSec))
        while player.status == .unknown || player.currentItem?.status == .unknown {
            if ContinuousClock.now >= deadline { return }
            try? await Task.sleep(for: .milliseconds(25))
        }
    }

    /// Anchor master time 0 at a host-clock instant (possibly in the future).
    /// Used for guides during a take: anchored at the click buffer's scheduled
    /// start, they hit the air in lockstep with the count-in.
    func playAnchored(masterZeroAtHost hostTime: UInt64) {
        let anchorCM = CMTime(seconds: AVAudioTime.seconds(forHostTime: hostTime), preferredTimescale: 1_000_000_000)
        for slot in slots.values {
            let itemTime = CMTime(seconds: slot.take.startSec, preferredTimescale: 600)
            slot.player.setRate(1, time: itemTime, atHostTime: anchorCM)
        }
        isPlaying = true
    }

    /// Seek all parts to `masterSec`, preroll their decoders, then start every
    /// player at the same host-clock instant.
    func play(fromMasterSec masterSec: Double = QuartetPlayer.playStartSec) async {
        guard !slots.isEmpty else { return }
        AudioClock.shared.configureSession(recording: false)
        await preroll(toMasterSec: masterSec)

        let anchorHost = mach_absolute_time() + AVAudioTime.hostTime(forSeconds: 0.25)
        let anchorCM = CMTime(seconds: AVAudioTime.seconds(forHostTime: anchorHost), preferredTimescale: 1_000_000_000)
        for slot in slots.values {
            let itemTime = CMTime(seconds: slot.take.startSec + masterSec, preferredTimescale: 600)
            slot.player.setRate(1, time: itemTime, atHostTime: anchorCM)
        }
        isPlaying = true
        watchForEnd()
    }

    func pause() {
        endTimer?.invalidate()
        endTimer = nil
        for slot in slots.values {
            slot.player.cancelPendingPrerolls() // resume any preroll continuations
            slot.player.pause()
        }
        isPlaying = false
    }

    /// Current master time: the furthest-advanced slot. All slots are
    /// hardware-locked, so any still-running player reports true master time;
    /// shorter takes freeze at their item end (actionAtItemEnd .pause) and
    /// sampling one of those would plateau below masterEndSec — the end
    /// watcher would never fire and playback could never loop.
    var masterSec: Double {
        slots.values.map { $0.player.currentTime().seconds - $0.take.startSec }.max() ?? 0
    }

    private func watchForEnd() {
        endTimer?.invalidate()
        endTimer = Timer.scheduledTimer(withTimeInterval: 0.25, repeats: true) { [weak self] _ in
            Task { @MainActor [weak self] in
                guard let self, self.isPlaying else { return }
                if self.masterSec >= self.masterEndSec - 0.05 {
                    self.pause()
                }
            }
        }
    }
}

/// AVPlayerLayer host for SwiftUI.
struct PlayerLayerView: UIViewRepresentable {
    let player: AVPlayer

    final class LayerView: UIView {
        override static var layerClass: AnyClass { AVPlayerLayer.self }
        var playerLayer: AVPlayerLayer { layer as! AVPlayerLayer }
    }

    func makeUIView(context: Context) -> LayerView {
        let v = LayerView()
        v.playerLayer.videoGravity = .resizeAspectFill
        v.playerLayer.player = player
        return v
    }

    func updateUIView(_ uiView: LayerView, context: Context) {
        if uiView.playerLayer.player !== player { uiView.playerLayer.player = player }
    }
}
