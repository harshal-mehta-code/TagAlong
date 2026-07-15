import { measureRoundTripSec, refineMediaOffsetMs } from './align'
import { audioContext, outputLatency, scheduleCountIn, setAudioSessionType, COUNT_IN_CLICKS, CLICK_INTERVAL_SEC } from './audio'
import { storedCalibration } from './calibration'
import { computeMediaOffsetMs } from './offsets'
import { StemCapture, trimAndEncode } from './stem'

/** Which measurement anchored the stem, best to worst. */
export type AnchorSource = 'bleed' | 'calibration' | 'api'

export interface RecordingResult {
  blob: Blob
  mimeType: string
  /** WAV audio stem, sample 0 == master t=0; the collage's audio source */
  stemBlob: Blob | null
  /** position of master t=0 within the media file, ms */
  mediaOffsetMs: number
  /** length of the sung portion (after t=0 + count-in), ms */
  sungDurationMs: number
  /** which latency measurement anchored this take (drives review-screen hints) */
  anchorSource: AnchorSource
}

function pickMimeType(): string {
  const candidates = [
    'video/mp4', // Safari
    'video/webm;codecs=vp9,opus',
    'video/webm;codecs=vp8,opus',
    'video/webm',
  ]
  for (const t of candidates) {
    if (typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(t)) return t
  }
  return ''
}

export async function getCameraStream(): Promise<MediaStream> {
  // while capturing, ask iOS for the play-and-record session explicitly —
  // guide audio must stay audible (and on the speaker) alongside the mic
  setAudioSessionType('play-and-record')
  return navigator.mediaDevices.getUserMedia({
    video: { facingMode: 'user', width: { ideal: 720 }, height: { ideal: 960 } },
    audio: {
      echoCancellation: false,
      noiseSuppression: false,
      autoGainControl: false,
    },
  })
}

/**
 * Records one take against the master timeline.
 *
 * Sequence: recorder starts → short arm delay → count-in clicks (t=0 at first
 * click) → singer sings → stop().
 *
 * Guide parts play as synced <video> elements controlled by the caller
 * (useTakeRecording) — element playback handles every container natively,
 * where Web Audio's decodeAudioData rejects mp4 video blobs on iOS Safari.
 *
 * The recorder's actual start time is captured on MediaRecorder's `start`
 * event against the AudioContext clock, giving us where t=0 falls inside the
 * media file. Residual device error is what the nudge slider corrects.
 */
export class TakeRecorder {
  private recorder: MediaRecorder | null = null
  private chunks: Blob[] = []
  private recStartCtxTime = 0
  private t0CtxTime = 0
  private singStartCtxTime = 0
  private latencyCompSec = 0
  private mimeType = ''
  private stopped: Promise<Blob> | null = null
  private stemCapture: StemCapture | null = null

  constructor(private stream: MediaStream) {}

  /**
   * API-reported round-trip latency — the FALLBACK only. Chrome's
   * outputLatency fluctuates at runtime and Safari omits input latency, so
   * per-take anchors built on this were unpredictably off. The primary
   * measurement is the click bleed in stop(); this estimate covers the
   * headphone case where the mic can't hear the clicks.
   */
  private measureLatencyComp(): number {
    const out = Math.min(Math.max(outputLatency(), 0), 0.35)
    const settings = this.stream.getAudioTracks()[0]?.getSettings() as
      | (MediaTrackSettings & { latency?: number })
      | undefined
    const input = Math.min(Math.max(settings?.latency ?? 0, 0), 0.25)
    return out + input
  }

  /** Starts recording; resolves with the ctx times of master t=0 and sing start. */
  async start(): Promise<{ t0CtxTime: number; singStartCtxTime: number }> {
    const c = audioContext()
    this.mimeType = pickMimeType()
    this.recorder = this.mimeType
      ? new MediaRecorder(this.stream, { mimeType: this.mimeType })
      : new MediaRecorder(this.stream)
    this.chunks = []
    this.recorder.ondataavailable = (e) => {
      if (e.data.size > 0) this.chunks.push(e.data)
    }
    this.stopped = new Promise<Blob>((resolve) => {
      this.recorder!.onstop = () =>
        resolve(new Blob(this.chunks, { type: this.mimeType || 'video/webm' }))
    })

    const started = new Promise<void>((resolve) => {
      this.recorder!.onstart = () => {
        this.recStartCtxTime = c.currentTime
        resolve()
      }
    })
    this.recorder.start()
    await started

    // PCM stem capture rides the same AudioContext clock as the count-in,
    // giving the collage a sample-accurate, decode-anywhere audio source.
    // Awaited so the worklet is live before t=0 is scheduled below.
    this.stemCapture = new StemCapture(this.stream)
    await this.stemCapture.start()

    // Arm delay so the recorder is definitely rolling before t=0.
    this.t0CtxTime = scheduleCountIn(0.45)
    this.singStartCtxTime = this.t0CtxTime + COUNT_IN_CLICKS * CLICK_INTERVAL_SEC
    this.latencyCompSec = this.measureLatencyComp()
    return { t0CtxTime: this.t0CtxTime, singStartCtxTime: this.singStartCtxTime }
  }

  async stop(): Promise<RecordingResult> {
    const c = audioContext()
    const stopCtxTime = c.currentTime
    const raw = this.stemCapture ? await this.stemCapture.stop() : null
    this.stemCapture = null
    // Round-trip latency: the singer hears the clicks late by the output
    // latency and their voice arrives late by the input latency, so sung
    // content lands (out + in) after the master grid. MEASURE it from the
    // click bleed the mic captured — exact for this take, this device, this
    // route (including Bluetooth, which no API reports). Only when there's
    // no audible bleed (headphones) fall back to the API estimate.
    let roundTripSec = this.latencyCompSec
    let anchorSource: AnchorSource = 'api'
    const cal = storedCalibration()
    if (cal) {
      // sound-check value beats the API estimate: it was MEASURED on this
      // device (headphones share the speaker path's converter latency)
      roundTripSec = cal.roundTripSec
      anchorSource = 'calibration'
    }
    if (raw) {
      const measured = measureRoundTripSec(
        raw.samples,
        raw.sampleRate,
        this.t0CtxTime - raw.startCtxTime,
        { clicks: COUNT_IN_CLICKS, intervalSec: CLICK_INTERVAL_SEC },
      )
      if (measured !== null) {
        roundTripSec = measured
        anchorSource = 'bleed'
      }
    }
    // Trim at the latency-compensated t0: sung content lands ON the master
    // grid whether the singer followed the clicks or the guide voices.
    const anchorCtxTime = this.t0CtxTime + roundTripSec
    const stemBlob = raw
      ? trimAndEncode([raw.samples], raw.startCtxTime, anchorCtxTime, raw.sampleRate)
      : null
    this.recorder?.stop()
    const blob = await this.stopped!
    // The `start`-event estimate misses the encoder's real start by a
    // different amount every take. The media file and the stem hold the same
    // mic signal, so cross-correlating them measures the true offset —
    // this is what keeps lips and takes aligned. Estimate kept where the
    // browser can't decode its own recording (iOS mp4).
    let mediaOffsetMs = computeMediaOffsetMs(this.recStartCtxTime, anchorCtxTime)
    if (stemBlob) {
      try {
        const refined = await refineMediaOffsetMs(blob, stemBlob, mediaOffsetMs)
        if (refined !== null) mediaOffsetMs = refined
      } catch { /* alignment is best-effort */ }
    }
    return {
      blob,
      mimeType: this.mimeType || blob.type,
      stemBlob,
      mediaOffsetMs,
      sungDurationMs: Math.max(0, (stopCtxTime - this.singStartCtxTime) * 1000),
      anchorSource,
    }
  }

  cancel(): void {
    try { this.recorder?.stop() } catch { /* not started */ }
  }
}
