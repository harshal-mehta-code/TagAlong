import type { Input } from 'mediabunny'

// mediabunny is ~250 KB minified — load it only when a render actually runs
const mediabunny = () => import('mediabunny')

/**
 * Renders a finished performance into ONE mp4: the 2×N grid composited
 * frame-by-frame on the master timeline, muxed with the offline-premixed
 * audio as AAC. Playing a single native video file makes A/V sync the
 * container's job — no drift loops, no per-element clocks, identical on
 * every browser. This is the collage's default watch path; the live
 * multi-element player remains for solo/nudge tinkering and for browsers
 * that can't encode (Firefox, desktop Linux).
 */

export interface RenderSlot {
  media: Blob
  /** ms to add to master time to get this take's media time (mediaOffset + nudge) */
  skewMs: number
}

const FPS = 30
const CELL_W = 480
const CELL_H = 640
const GAP = 4
const BG = '#171412' // matches the app's curtain background

const AAC_CONFIG = { numberOfChannels: 1, sampleRate: 48_000, bitrate: 128e3 }

let supportPromise: Promise<boolean> | null = null

/** True where the browser can encode H.264 + AAC (Safari 26+/Chrome; not Firefox or desktop Linux). */
export function canPrerender(): Promise<boolean> {
  if (!supportPromise) {
    supportPromise = (async () => {
      try {
        if (typeof VideoDecoder === 'undefined') return false
        const { canEncode, canEncodeAudio } = await mediabunny()
        return (await canEncode('avc')) && (await canEncodeAudio('aac', AAC_CONFIG))
      } catch {
        return false
      }
    })()
  }
  return supportPromise
}

/**
 * Composite + encode. `slots` follow the on-screen grid order; null slots
 * (open parts) stay background-colored — the UI overlays its OpenSlot tiles
 * there. Returns null if `cancelled` starts returning true. Throws when any
 * take's video can't be demuxed/decoded — callers keep the live path.
 */
export async function renderPerformanceMp4(opts: {
  slots: (RenderSlot | null)[]
  /** offline premix on the master timeline (sample 0 == master t=0) */
  premix: AudioBuffer
  /** master ms of the mp4's t=0 */
  startMs: number
  /** master ms of the mp4's end */
  endMs: number
  onProgress?: (frac: number) => void
  cancelled?: () => boolean
}): Promise<Blob | null> {
  const {
    ALL_FORMATS, AudioBufferSource, BlobSource, BufferTarget,
    CanvasSink, CanvasSource, Input, Mp4OutputFormat, Output,
  } = await mediabunny()
  const cols = 2
  const rows = Math.max(1, Math.ceil(opts.slots.length / cols))
  const W = cols * CELL_W + (cols - 1) * GAP
  const H = rows * CELL_H + (rows - 1) * GAP
  const durSec = Math.max(0.5, (opts.endMs - opts.startMs) / 1000)
  const nFrames = Math.ceil(durSec * FPS)

  const canvas = document.createElement('canvas')
  canvas.width = W
  canvas.height = H
  const draw = canvas.getContext('2d')!

  const inputs: Input[] = []
  const output = new Output({ format: new Mp4OutputFormat(), target: new BufferTarget() })
  let finalized = false
  try {
    // one frame iterator per filled slot, pulling exactly the master-time
    // frame sequence for that take (sorted timestamps decode efficiently)
    const cells: ({ frames: AsyncIterator<{ canvas: HTMLCanvasElement | OffscreenCanvas } | null>; x: number; y: number } | null)[] = []
    for (let i = 0; i < opts.slots.length; i++) {
      const slot = opts.slots[i]
      if (!slot) {
        cells.push(null)
        continue
      }
      const input = new Input({ formats: ALL_FORMATS, source: new BlobSource(slot.media) })
      inputs.push(input)
      const track = await input.getPrimaryVideoTrack()
      if (!track || !(await track.canDecode())) throw new Error('video track undecodable')
      const trackDur = await track.computeDuration()
      const timestamps: number[] = []
      for (let f = 0; f < nFrames; f++) {
        const mediaSec = (opts.startMs + (f * 1000) / FPS + slot.skewMs) / 1000
        // clamp into the track: before-start holds the first frame, past-end holds the last
        timestamps.push(Math.min(Math.max(mediaSec, 0), Math.max(trackDur - 0.05, 0)))
      }
      const sink = new CanvasSink(track, { width: CELL_W, height: CELL_H, fit: 'cover', poolSize: 2 })
      cells.push({
        frames: sink.canvasesAtTimestamps(timestamps)[Symbol.asyncIterator](),
        x: (i % cols) * (CELL_W + GAP),
        y: Math.floor(i / cols) * (CELL_H + GAP),
      })
    }

    const videoSource = new CanvasSource(canvas, { codec: 'avc', bitrate: 4e6 })
    output.addVideoTrack(videoSource, { frameRate: FPS })
    const audioSource = new AudioBufferSource({ codec: 'aac', bitrate: AAC_CONFIG.bitrate })
    output.addAudioTrack(audioSource)
    await output.start()

    // audio: the premix slice [startMs, endMs] becomes the whole mp4 track
    const sr = opts.premix.sampleRate
    const from = Math.max(0, Math.min(opts.premix.length, Math.round((opts.startMs / 1000) * sr)))
    const to = Math.max(from + 1, Math.min(opts.premix.length, Math.round((opts.endMs / 1000) * sr)))
    const slice = new AudioBuffer({ length: to - from, sampleRate: sr, numberOfChannels: 1 })
    slice.getChannelData(0).set(opts.premix.getChannelData(0).subarray(from, to))
    await audioSource.add(slice)
    audioSource.close()

    for (let f = 0; f < nFrames; f++) {
      if (opts.cancelled?.()) return null
      draw.fillStyle = BG
      draw.fillRect(0, 0, W, H)
      for (const cell of cells) {
        if (!cell) continue
        const r = await cell.frames.next()
        if (!r.done && r.value) draw.drawImage(r.value.canvas, cell.x, cell.y, CELL_W, CELL_H)
      }
      await videoSource.add(f / FPS, 1 / FPS)
      opts.onProgress?.((f + 1) / nFrames)
    }
    videoSource.close()
    await output.finalize()
    finalized = true
    return new Blob([output.target.buffer!], { type: 'video/mp4' })
  } finally {
    if (!finalized) await output.cancel().catch(() => {})
    for (const input of inputs) input.dispose()
  }
}
