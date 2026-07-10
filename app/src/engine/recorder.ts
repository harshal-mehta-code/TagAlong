import { audioContext, scheduleCountIn, COUNT_IN_CLICKS, CLICK_INTERVAL_SEC } from './audio'
import { computeMediaOffsetMs } from './offsets'
import { StemCapture } from './stem'

export interface RecordingResult {
  blob: Blob
  mimeType: string
  /** WAV audio stem, sample 0 == master t=0; the collage's audio source */
  stemBlob: Blob | null
  /** position of master t=0 within the media file, ms */
  mediaOffsetMs: number
  /** length of the sung portion (after t=0 + count-in), ms */
  sungDurationMs: number
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
  private mimeType = ''
  private stopped: Promise<Blob> | null = null
  private stemCapture: StemCapture | null = null

  constructor(private stream: MediaStream) {}

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
    this.stemCapture = new StemCapture(this.stream)
    this.stemCapture.start()

    // Arm delay so the recorder is definitely rolling before t=0.
    this.t0CtxTime = scheduleCountIn(0.45)
    this.singStartCtxTime = this.t0CtxTime + COUNT_IN_CLICKS * CLICK_INTERVAL_SEC
    return { t0CtxTime: this.t0CtxTime, singStartCtxTime: this.singStartCtxTime }
  }

  async stop(): Promise<RecordingResult> {
    const c = audioContext()
    const stopCtxTime = c.currentTime
    const stemBlob = this.stemCapture?.stop(this.t0CtxTime) ?? null
    this.stemCapture = null
    this.recorder?.stop()
    const blob = await this.stopped!
    return {
      blob,
      mimeType: this.mimeType || blob.type,
      stemBlob,
      mediaOffsetMs: computeMediaOffsetMs(this.recStartCtxTime, this.t0CtxTime),
      sungDurationMs: Math.max(0, (stopCtxTime - this.singStartCtxTime) * 1000),
    }
  }

  cancel(): void {
    try { this.recorder?.stop() } catch { /* not started */ }
  }
}
