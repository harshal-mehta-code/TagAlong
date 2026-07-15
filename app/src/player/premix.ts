import { audioContext } from '../engine/audio'
import { decodeMediaAudio } from '../engine/mediaAudio'
import { encodeWav } from '../engine/stem'

/**
 * Pre-rendered collage audio.
 *
 * Instead of scheduling N live AudioBufferSourceNodes at play time (fragile:
 * per-source races, live limiter, a Web Audio clock videos can't share), the
 * whole mix is rendered ONCE offline into a single WAV and played through one
 * <audio> element. One element means one clock, native pause/seek/rate, no
 * silent-switch muting on iOS (media elements ride the media channel), and
 * still within iOS's one-unmuted-element budget — videos stay muted visuals.
 */

export interface PremixInput {
  id: string
  nudgeMs: number
  /** WAV stem whose sample 0 == master t=0 (preferred source) */
  stem?: Blob
  /** fallback: full media blob, decoded where the browser allows */
  media?: Blob
  /** master-time ms of the media blob's sample 0 (only used with `media`) */
  mediaOffsetMs?: number
}

/**
 * Where a track's buffer sits on the master timeline: content at master time
 * m is buffer position (m + skewMs). Pure so the math stays unit-testable.
 * Returns null when the whole buffer lies before master 0.
 */
export function sourceSchedule(
  skewMs: number,
  bufferDurationSec: number,
): { whenSec: number; offsetSec: number } | null {
  const skewSec = skewMs / 1000
  if (skewSec >= bufferDurationSec) return null
  if (skewSec >= 0) return { whenSec: 0, offsetSec: skewSec }
  return { whenSec: -skewSec, offsetSec: 0 }
}

const RENDER_RATE = 48_000
const RENDER_TAIL_MS = 400

interface PreparedTrack {
  buffer: AudioBuffer
  /** ms to add to master time to get buffer position (mediaOffset for media-sourced tracks, 0 for stems) */
  baseSkewMs: number
}

export class PremixEngine {
  private prepared = new Map<string, PreparedTrack>()
  private nudges = new Map<string, number>()
  readonly failed = new Set<string>()

  /** Decode any not-yet-prepared inputs. Returns ids whose audio is undecodable. */
  async prepare(inputs: PremixInput[]): Promise<Set<string>> {
    const c = audioContext()
    for (const input of inputs) {
      this.nudges.set(input.id, input.nudgeMs)
      if (this.prepared.has(input.id) || this.failed.has(input.id)) continue
      let track: PreparedTrack | null = null
      if (input.stem) {
        try {
          track = { buffer: await c.decodeAudioData(await input.stem.arrayBuffer()), baseSkewMs: 0 }
        } catch { /* fall through to media */ }
      }
      if (!track && input.media) {
        // decodeMediaAudio demuxes mp4 video blobs via WebCodecs where
        // decodeAudioData refuses them (iOS Safari)
        const buffer = await decodeMediaAudio(input.media)
        if (buffer) track = { buffer, baseSkewMs: input.mediaOffsetMs ?? 0 }
      }
      if (track) this.prepared.set(input.id, track)
      else this.failed.add(input.id)
    }
    return this.failed
  }

  setNudge(id: string, nudgeMs: number): void {
    this.nudges.set(id, nudgeMs)
  }

  /** Offline-mix the prepared tracks (optionally a single soloed one) into a mono WAV. */
  async render(durationMs: number, soloId: string | null = null): Promise<Blob> {
    const rendered = await this.renderBuffer(durationMs, soloId)
    return encodeWav(rendered.getChannelData(0), RENDER_RATE)
  }

  /** Same offline mix as render(), returned as the raw AudioBuffer (mp4 pre-render feeds this to AAC). */
  async renderBuffer(durationMs: number, soloId: string | null = null): Promise<AudioBuffer> {
    const length = Math.max(RENDER_RATE, Math.ceil(((durationMs + RENDER_TAIL_MS) / 1000) * RENDER_RATE))
    const oc = new OfflineAudioContext(1, length, RENDER_RATE)
    const master = oc.createGain()
    // same gentle limiter the live mixer used, so four normalized stems summing never clips
    const limiter = oc.createDynamicsCompressor()
    limiter.threshold.value = -6
    limiter.knee.value = 4
    limiter.ratio.value = 12
    limiter.attack.value = 0.002
    limiter.release.value = 0.12
    master.connect(limiter)
    limiter.connect(oc.destination)
    for (const [id, track] of this.prepared) {
      if (soloId !== null && soloId !== id) continue
      const skewMs = track.baseSkewMs + (this.nudges.get(id) ?? 0)
      const sched = sourceSchedule(skewMs, track.buffer.duration)
      if (!sched) continue
      const src = oc.createBufferSource()
      src.buffer = track.buffer
      src.connect(master)
      src.start(sched.whenSec, sched.offsetSec)
    }
    return oc.startRendering()
  }
}

/**
 * The collage's single audio voice: a PremixEngine feeding one <audio>
 * element. masterMs interpolates between timeupdate events so the video sync
 * loop gets a smooth clock instead of the element's ~4 Hz steps.
 */
export class CollageAudio {
  private engine = new PremixEngine()
  private el: HTMLAudioElement
  private url: string | null = null
  private durationMs = 0
  private solo: string | null = null
  private loadedKey = ''
  private rate = 1
  private lastTimeSec = 0
  private lastPerf = 0
  private renderSeq = 0

  constructor() {
    this.el = new Audio()
    this.el.preload = 'auto'
    const syncClock = () => {
      this.lastTimeSec = this.el.currentTime
      this.lastPerf = performance.now()
    }
    for (const ev of ['timeupdate', 'seeked', 'playing', 'ratechange']) {
      this.el.addEventListener(ev, syncClock)
    }
  }

  /** Decode + render if the take set changed. Returns undecodable ids. */
  async load(inputs: PremixInput[], durationMs: number): Promise<Set<string>> {
    const key = `${inputs.map((i) => `${i.id}:${i.nudgeMs}`).sort().join('|')}#${durationMs}`
    this.durationMs = durationMs
    const failed = await this.engine.prepare(inputs)
    if (key !== this.loadedKey) {
      this.loadedKey = key
      await this.applyRender(false)
    }
    return failed
  }

  private async applyRender(keepPosition: boolean): Promise<void> {
    const seq = ++this.renderSeq
    const posSec = this.el.currentTime
    const wasPlaying = !this.el.paused && !this.el.ended
    const blob = await this.engine.render(this.durationMs, this.solo)
    if (seq !== this.renderSeq) return // a newer render superseded this one
    if (this.url) URL.revokeObjectURL(this.url)
    this.url = URL.createObjectURL(blob)
    this.el.src = this.url
    await new Promise<void>((resolve) => {
      const done = () => { this.el.removeEventListener('loadedmetadata', done); resolve() }
      this.el.addEventListener('loadedmetadata', done)
      setTimeout(done, 2000) // blob URLs load instantly; never hang on a broken one
    })
    this.el.playbackRate = this.rate
    if (keepPosition) {
      this.el.currentTime = posSec
      if (wasPlaying) void this.el.play().catch(() => {})
    }
  }

  async setSolo(id: string | null): Promise<void> {
    if (this.solo === id) return
    this.solo = id
    await this.applyRender(true)
  }

  async setNudge(id: string, nudgeMs: number): Promise<void> {
    this.engine.setNudge(id, nudgeMs)
    await this.applyRender(true)
  }

  get playing(): boolean {
    return !this.el.paused && !this.el.ended
  }

  /** Master position in ms (0 == first count-in click), interpolated while playing. */
  masterMs(): number {
    if (!this.playing) return this.el.currentTime * 1000
    if (this.el.readyState < 3 || this.el.seeking) return this.el.currentTime * 1000
    const t = this.lastTimeSec + ((performance.now() - this.lastPerf) / 1000) * this.rate
    const cap = Number.isFinite(this.el.duration) ? this.el.duration : t
    return Math.min(t, cap) * 1000
  }

  async play(fromMs?: number): Promise<void> {
    if (fromMs !== undefined) this.el.currentTime = fromMs / 1000
    this.lastTimeSec = this.el.currentTime
    this.lastPerf = performance.now()
    await this.el.play().catch(() => { /* user will tap again */ })
  }

  pause(): void {
    this.el.pause()
  }

  seek(toMs: number): void {
    this.el.currentTime = Math.max(0, toMs) / 1000
    this.lastTimeSec = this.el.currentTime
    this.lastPerf = performance.now()
  }

  setRate(rate: number): void {
    this.rate = rate
    this.el.playbackRate = rate
    ;(this.el as HTMLAudioElement & { preservesPitch?: boolean }).preservesPitch = true
  }

  destroy(): void {
    this.renderSeq++
    this.el.pause()
    this.el.removeAttribute('src')
    if (this.url) URL.revokeObjectURL(this.url)
    this.url = null
  }
}
