import AVFoundation

/// Records one take (front camera + mic) into a .mov via AVAssetWriter.
///
/// The decisive difference from the web version: every captured sample buffer
/// carries a presentation timestamp on the capture session's clock, and the
/// count-in clicks are scheduled on the host clock. Converting between the two
/// gives the EXACT position of master t=0 inside the file — no start-event
/// guessing, no cross-correlation forensics, no per-take randomness.
final class TakeRecorder: NSObject, AVCaptureVideoDataOutputSampleBufferDelegate, AVCaptureAudioDataOutputSampleBufferDelegate {
    let session = AVCaptureSession()

    private let writingQueue = DispatchQueue(label: "take.writer")
    private let videoOutput = AVCaptureVideoDataOutput()
    private let audioOutput = AVCaptureAudioDataOutput()

    private var writer: AVAssetWriter?
    private var videoInput: AVAssetWriterInput?
    private var audioInput: AVAssetWriterInput?
    private var sessionStarted = false
    private var firstSampleTime = CMTime.invalid
    private var lastSampleTime = CMTime.invalid
    private var outputURL: URL?
    private var writing = false

    /// Build the capture graph. Call once; then `session.startRunning()` (off main).
    func configure() throws {
        session.beginConfiguration()
        session.sessionPreset = .hd1280x720

        guard let camera = AVCaptureDevice.default(.builtInWideAngleCamera, for: .video, position: .front),
              let mic = AVCaptureDevice.default(for: .audio) else {
            session.commitConfiguration()
            throw NSError(domain: "TakeRecorder", code: 1,
                          userInfo: [NSLocalizedDescriptionKey: "Camera or microphone unavailable"])
        }
        let cameraIn = try AVCaptureDeviceInput(device: camera)
        let micIn = try AVCaptureDeviceInput(device: mic)
        if session.canAddInput(cameraIn) { session.addInput(cameraIn) }
        if session.canAddInput(micIn) { session.addInput(micIn) }

        videoOutput.setSampleBufferDelegate(self, queue: writingQueue)
        audioOutput.setSampleBufferDelegate(self, queue: writingQueue)
        if session.canAddOutput(videoOutput) { session.addOutput(videoOutput) }
        if session.canAddOutput(audioOutput) { session.addOutput(audioOutput) }

        if let conn = videoOutput.connection(with: .video) {
            if #available(iOS 17.0, *) {
                if conn.isVideoRotationAngleSupported(90) { conn.videoRotationAngle = 90 } // portrait
            }
            if conn.isVideoMirroringSupported {
                conn.automaticallyAdjustsVideoMirroring = false
                conn.isVideoMirrored = false // file matches what the audience sees
            }
        }
        session.commitConfiguration()
    }

    /// Begin writing to `url`. Frames flow immediately; timing is derived later.
    func startWriting(to url: URL) throws {
        let writer = try AVAssetWriter(outputURL: url, fileType: .mov)
        let video = AVAssetWriterInput(mediaType: .video, outputSettings: [
            AVVideoCodecKey: AVVideoCodecType.h264,
            AVVideoWidthKey: 720,
            AVVideoHeightKey: 1280,
        ])
        video.expectsMediaDataInRealTime = true
        let audio = AVAssetWriterInput(mediaType: .audio, outputSettings: [
            AVFormatIDKey: kAudioFormatMPEG4AAC,
            AVNumberOfChannelsKey: 1,
            AVSampleRateKey: 48_000,
            AVEncoderBitRateKey: 128_000,
        ])
        audio.expectsMediaDataInRealTime = true
        writer.add(video)
        writer.add(audio)
        guard writer.startWriting() else { throw writer.error ?? NSError(domain: "TakeRecorder", code: 2) }

        writingQueue.sync {
            self.outputURL = url
            self.writer = writer
            self.videoInput = video
            self.audioInput = audio
            self.sessionStarted = false
            self.firstSampleTime = .invalid
            self.lastSampleTime = .invalid
            self.writing = true
        }
    }

    /// Where a host-clock instant falls inside the file being written, seconds.
    /// (File time 0 == firstSampleTime on the session clock.)
    func fileTime(ofHostTime hostTime: UInt64) -> Double {
        let hostSec = AVAudioTime.seconds(forHostTime: hostTime)
        var first = CMTime.invalid
        writingQueue.sync { first = self.firstSampleTime }
        guard first.isValid else { return 0 }
        // capture session clocks are host-clock based on iOS devices; if a
        // synchronizationClock exists and differs, convert through it
        if let syncClock = session.synchronizationClock {
            let hostCM = CMTime(seconds: hostSec, preferredTimescale: 1_000_000_000)
            let converted = CMSyncConvertTime(hostCM, from: CMClockGetHostTimeClock(), to: syncClock)
            return converted.seconds - first.seconds
        }
        return hostSec - first.seconds
    }

    /// Finish the file. Returns its duration in seconds.
    func stopWriting() async throws -> Double {
        let (writer, duration): (AVAssetWriter?, Double) = writingQueue.sync {
            self.writing = false
            let d = self.firstSampleTime.isValid && self.lastSampleTime.isValid
                ? self.lastSampleTime.seconds - self.firstSampleTime.seconds : 0
            return (self.writer, d)
        }
        guard let writer else { return 0 }
        videoInput?.markAsFinished()
        audioInput?.markAsFinished()
        await writer.finishWriting()
        writingQueue.sync {
            self.writer = nil
            self.videoInput = nil
            self.audioInput = nil
        }
        if let error = writer.error { throw error }
        return duration
    }

    func teardown() {
        if session.isRunning { session.stopRunning() }
    }

    // MARK: sample delegate (writingQueue)

    func captureOutput(_ output: AVCaptureOutput, didOutput sampleBuffer: CMSampleBuffer, from connection: AVCaptureConnection) {
        guard writing, let writer, writer.status == .writing else { return }
        let pts = CMSampleBufferGetPresentationTimeStamp(sampleBuffer)
        if !sessionStarted {
            // anchor the file's timeline at the first VIDEO frame so playback
            // starts on a real picture (audio before it is dropped, ~a frame)
            guard output === videoOutput else { return }
            writer.startSession(atSourceTime: pts)
            firstSampleTime = pts
            sessionStarted = true
        }
        let input = output === videoOutput ? videoInput : audioInput
        guard let input, input.isReadyForMoreMediaData else { return }
        input.append(sampleBuffer)
        let end = CMTimeAdd(pts, CMSampleBufferGetDuration(sampleBuffer))
        if !lastSampleTime.isValid || end > lastSampleTime { lastSampleTime = end }
    }
}
