import { audioContext, outputLatency, scheduleCountIn, COUNT_IN_CLICKS, CLICK_INTERVAL_SEC } from './audio'
import { computeMediaOffsetMs } from './offsets'

export interface RecordingResult {
  blob: Blob
  mimeType: string
  /** position of master t=0 within the media file, ms */
  mediaOffsetMs: number
  /** length of the sung portion (after t=0 + count-in), ms */
  sungDurationMs: number
}

export interface GuideClip {
  takeId: string
  /** decoded audio of the take's media */
  buffer: AudioBuffer
  /** position of master t=0 within that audio, ms */
  mediaOffsetMs: number
  nudgeMs: number
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
 * click) + guide playback (for joins) → singer sings → stop().
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
  private guideSources: AudioBufferSourceNode[] = []
  private mimeType = ''
  private stopped: Promise<Blob> | null = null

  constructor(private stream: MediaStream) {}

  /** Starts recording; resolves with the ctx time of master t=0 (first click). */
  async start(guides: GuideClip[]): Promise<{ t0CtxTime: number; singStartCtxTime: number }> {
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

    // Arm delay so the recorder is definitely rolling before t=0.
    this.t0CtxTime = scheduleCountIn(0.45)
    this.singStartCtxTime = this.t0CtxTime + COUNT_IN_CLICKS * CLICK_INTERVAL_SEC

    // Guides: schedule so the singer HEARS them aligned to the master timeline.
    // Compensate reported output latency so sound hits ears at the right time.
    const latency = outputLatency()
    for (const g of guides) {
      const src = c.createBufferSource()
      src.buffer = g.buffer
      const effectiveOffsetSec = (g.mediaOffsetMs + g.nudgeMs) / 1000
      const when = this.t0CtxTime - latency
      if (effectiveOffsetSec >= 0) {
        src.start(when, effectiveOffsetSec)
      } else {
        src.start(when - effectiveOffsetSec, 0)
      }
      src.connect(c.destination)
      this.guideSources.push(src)
    }
    return { t0CtxTime: this.t0CtxTime, singStartCtxTime: this.singStartCtxTime }
  }

  async stop(): Promise<RecordingResult> {
    const c = audioContext()
    const stopCtxTime = c.currentTime
    for (const s of this.guideSources) {
      try { s.stop() } catch { /* already ended */ }
    }
    this.guideSources = []
    this.recorder?.stop()
    const blob = await this.stopped!
    return {
      blob,
      mimeType: this.mimeType || blob.type,
      mediaOffsetMs: computeMediaOffsetMs(this.recStartCtxTime, this.t0CtxTime),
      sungDurationMs: Math.max(0, (stopCtxTime - this.singStartCtxTime) * 1000),
    }
  }

  cancel(): void {
    for (const s of this.guideSources) {
      try { s.stop() } catch { /* already ended */ }
    }
    this.guideSources = []
    try { this.recorder?.stop() } catch { /* not started */ }
  }
}

/** Decode a take's media blob into an AudioBuffer for guide playback. */
export async function decodeGuide(blob: Blob): Promise<AudioBuffer> {
  const c = audioContext()
  const arr = await blob.arrayBuffer()
  return c.decodeAudioData(arr)
}
