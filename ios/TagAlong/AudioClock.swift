import AVFoundation

/// The metronome/pitch side of the engine. Everything here is scheduled
/// against the device HOST CLOCK, the same clock AVCaptureSession stamps
/// frames with — so "when did the singer hear the first click" is a known
/// number, not a measurement. This is the API the web version never had.
final class AudioClock {
    static let shared = AudioClock()

    static let countInClicks = 4
    static let clickIntervalSec = 0.66 // ~91 bpm
    static var countInSec: Double { Double(countInClicks) * clickIntervalSec }

    private let engine = AVAudioEngine()
    private let player = AVAudioPlayerNode()

    private init() {
        engine.attach(player)
        engine.connect(player, to: engine.mainMixerNode, format: nil)
    }

    /// Category for a given phase. `.playAndRecord` with speaker default while
    /// capturing; plain `.playback` otherwise (full media volume, silent-switch
    /// immune — the native analog of the web app's audioSession juggling).
    func configureSession(recording: Bool) {
        let s = AVAudioSession.sharedInstance()
        do {
            if recording {
                try s.setCategory(.playAndRecord, mode: .videoRecording,
                                  options: [.defaultToSpeaker, .allowBluetoothA2DP])
            } else {
                try s.setCategory(.playback, mode: .default)
            }
            try s.setActive(true)
        } catch {
            print("audio session: \(error)")
            Diagnostics.logError("audioSession.configure", error)
        }
    }

    private func ensureRunning() {
        guard !engine.isRunning else { return }
        do {
            try engine.start()
        } catch {
            print("audio engine: \(error)")
            Diagnostics.logError("audioEngine.start", error)
        }
    }

    /// Reported output latency — accurate and route-aware on iOS (the number
    /// browsers never gave us). Clicks leave the speaker this late.
    var outputLatencySec: Double { AVAudioSession.sharedInstance().outputLatency }

    struct CountIn {
        /// Host time the click buffer starts rendering (anchor guide players
        /// here — they share the same output latency, so both hit the air together).
        let scheduledHost: UInt64
        /// Host time the first click is HEARD (master t=0 in the room; anchor
        /// the recording here — the mic hears the singer with no extra delay).
        let heardHost: UInt64
    }

    /// Schedule the full count-in as ONE sample-accurate buffer starting at a
    /// host time ~`leadSec` from now.
    func scheduleCountIn(leadSec: Double = 1.0) -> CountIn {
        ensureRunning()
        let format = player.outputFormat(forBus: 0)
        let sr = format.sampleRate
        let frames = AVAudioFrameCount((Double(Self.countInClicks - 1) * Self.clickIntervalSec + 0.15) * sr)
        guard let buf = AVAudioPCMBuffer(pcmFormat: format, frameCapacity: frames) else {
            let now = mach_absolute_time()
            return CountIn(scheduledHost: now, heardHost: now)
        }
        buf.frameLength = frames
        for c in 0..<Self.countInClicks {
            let freq = c == 0 ? 1568.0 : 1046.0 // downbeat rings higher
            let start = Int(Double(c) * Self.clickIntervalSec * sr)
            let n = Int(0.09 * sr)
            for i in 0..<n where start + i < Int(frames) {
                let t = Double(i) / sr
                let sample = Float(0.7 * exp(-t / 0.014) * (sin(2 * .pi * freq * t) > 0 ? 1.0 : -1.0))
                for ch in 0..<Int(format.channelCount) {
                    buf.floatChannelData?[ch][start + i] = sample
                }
            }
        }
        let startHost = mach_absolute_time() + AVAudioTime.hostTime(forSeconds: leadSec)
        player.stop() // reset the node timeline so play(at:) anchors cleanly
        player.scheduleBuffer(buf, at: nil, options: [])
        player.play(at: AVAudioTime(hostTime: startHost))
        return CountIn(
            scheduledHost: startHost,
            heardHost: startHost + AVAudioTime.hostTime(forSeconds: outputLatencySec)
        )
    }

    /// Blown-pipe tone: two detuned triangle-ish partials with a soft envelope.
    func playPitch(_ key: PitchKey, durationSec: Double = 1.4) {
        // screens outside the record flow may never have configured the
        // session — the default solo-ambient category is muted by the silent
        // switch and can leave the engine unstartable. Claim playback first.
        let category = AVAudioSession.sharedInstance().category
        if category != .playback && category != .playAndRecord {
            configureSession(recording: false)
        }
        ensureRunning()
        let format = player.outputFormat(forBus: 0)
        let sr = format.sampleRate
        let frames = AVAudioFrameCount(durationSec * sr)
        guard let buf = AVAudioPCMBuffer(pcmFormat: format, frameCapacity: frames) else { return }
        buf.frameLength = frames
        let f = key.frequency
        for i in 0..<Int(frames) {
            let t = Double(i) / sr
            let attack = min(1, t / 0.06)
            let release = min(1, (durationSec - t) / 0.25)
            let env = 0.6 * attack * release
            // triangle-ish: fundamental + odd partial, slightly detuned pair
            var v = 0.0
            for detune in [-0.3, 0.3] {
                let ff = f * pow(2, detune / 1200)
                v += sin(2 * .pi * ff * t) + 0.12 * sin(2 * .pi * 3 * ff * t)
            }
            let sample = Float(env * v * 0.35) // two partial pairs peak ~2.2 — keep under full scale
            for ch in 0..<Int(format.channelCount) {
                buf.floatChannelData?[ch][i] = sample
            }
        }
        // .interrupts cuts off whatever note is currently sounding instead of
        // queuing behind it — without this, rapid taps on different notes
        // played in submission order with an audible delay.
        player.scheduleBuffer(buf, at: nil, options: [.interrupts])
        if !player.isPlaying { player.play() }
    }

    func stop() {
        player.stop()
    }
}
