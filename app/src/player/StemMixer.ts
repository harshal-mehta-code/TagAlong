import { audioContext } from '../engine/audio'

export interface MixerTrackInput {
  id: string
  nudgeMs: number
  /** WAV stem whose sample 0 == master t=0 (preferred) */
  stem?: Blob
  /** fallback: full media blob, decoded if the browser allows */
  media?: Blob
  /** master-time ms of the media blob's sample 0 (only used with `media`) */
  mediaOffsetMs?: number
}

interface MixerTrack {
  id: string
  buffer: AudioBuffer
  /** master-time ms at which buffer sample 0 sounds (0 for stems) */
  baseMs: number
  nudgeMs: number
  gain: GainNode
  source: AudioBufferSourceNode | null
}

/**
 * One Web Audio graph mixing every take's audio stem. This is the ONLY place
 * performance audio comes from — videos are always muted visuals — because
 * iOS Safari permits a single unmuted media element at a time, which can
 * never mix a quartet.
 */
export class StemMixer {
  private tracks = new Map<string, MixerTrack>()
  private failed = new Set<string>()
  private master: GainNode | null = null
  private ctx: AudioContext | null = null
  private playing = false
  private startedAtCtx = 0
  private fromMasterMs = 0
  private rate = 1
  private solo: string | null = null

  /**
   * (Re)build the output graph against the CURRENT shared context — it gets
   * recreated after every recording to escape iOS's ducked mic session, and
   * decoded AudioBuffers survive that swap while nodes do not.
   */
  private ensureGraph(): void {
    const c = audioContext()
    if (this.ctx === c && this.master) return
    this.ctx = c
    this.master = c.createGain()
    // a gentle limiter so four normalized stems summing never clips
    const limiter = c.createDynamicsCompressor()
    limiter.threshold.value = -6
    limiter.knee.value = 4
    limiter.ratio.value = 12
    limiter.attack.value = 0.002
    limiter.release.value = 0.12
    this.master.connect(limiter)
    limiter.connect(c.destination)
    for (const t of this.tracks.values()) {
      t.gain = c.createGain()
      t.gain.connect(this.master)
      t.source = null
    }
    this.applySolo()
  }

  /** Decode all tracks. Returns ids whose audio could NOT be decoded (caller may unmute that video as last resort). */
  async load(inputs: MixerTrackInput[]): Promise<Set<string>> {
    const c = audioContext()
    this.ensureGraph()
    this.failed = new Set()
    for (const input of inputs) {
      if (this.tracks.has(input.id)) {
        this.tracks.get(input.id)!.nudgeMs = input.nudgeMs
        continue
      }
      let buffer: AudioBuffer | null = null
      let baseMs = 0
      if (input.stem) {
        try {
          buffer = await c.decodeAudioData(await input.stem.arrayBuffer())
        } catch { /* fall through to media */ }
      }
      if (!buffer && input.media) {
        try {
          buffer = await c.decodeAudioData(await input.media.arrayBuffer())
          baseMs = -(input.mediaOffsetMs ?? 0)
        } catch { /* undecodable */ }
      }
      if (!buffer) {
        this.failed.add(input.id)
        continue
      }
      const gain = c.createGain()
      gain.connect(this.master!)
      this.tracks.set(input.id, {
        id: input.id, buffer, baseMs, nudgeMs: input.nudgeMs, gain, source: null,
      })
    }
    return this.failed
  }

  get failedIds(): Set<string> {
    return this.failed
  }

  /** Current master position in ms (only meaningful while playing). */
  masterMs(): number {
    if (!this.playing) return this.fromMasterMs
    const c = audioContext()
    return this.fromMasterMs + (c.currentTime - this.startedAtCtx) * 1000 * this.rate
  }

  /** Start playback with master time = fromMasterMs at ctx time `whenCtx` (defaults to now + small guard). */
  start(fromMasterMs: number, whenCtx?: number): void {
    this.ensureGraph()
    const c = audioContext()
    this.stopSources()
    const when = whenCtx ?? c.currentTime + 0.06
    this.startedAtCtx = when
    this.fromMasterMs = fromMasterMs
    this.playing = true
    if (this.master) this.master.gain.value = 1
    for (const t of this.tracks.values()) {
      this.startSource(t, when, fromMasterMs)
    }
    this.applySolo()
  }

  /**
   * Schedule playback so guide master t=0 enters the graph at t0CtxTime —
   * the SAME graph time as the first click. Both leave the speaker with the
   * same output latency, so the two cues the singer follows agree in the
   * air. (Compensating only the guide, as before, made it lead the clicks
   * by the output latency — singers came out offset from each other.)
   * Boosted: iOS ducks all output while the mic is live, so the guide
   * fights back a little — the limiter catches the peaks.
   */
  startAtT0(t0CtxTime: number): void {
    this.start(0, t0CtxTime)
    if (this.master) this.master.gain.value = 1.6
  }

  private startSource(t: MixerTrack, whenCtx: number, fromMasterMs: number): void {
    const c = audioContext()
    const src = c.createBufferSource()
    src.buffer = t.buffer
    src.playbackRate.value = this.rate
    src.connect(t.gain)
    // buffer sample 0 sounds at master (baseMs - nudge); position at master M:
    const posSec = (fromMasterMs + t.nudgeMs - t.baseMs) / 1000
    if (posSec >= 0) {
      if (posSec < t.buffer.duration) src.start(whenCtx, posSec)
      else return // past the end — nothing to play
    } else {
      src.start(whenCtx - posSec / this.rate, 0)
    }
    t.source = src
  }

  pause(): void {
    this.fromMasterMs = this.masterMs()
    this.playing = false
    this.stopSources()
  }

  seek(toMasterMs: number): void {
    if (this.playing) this.start(toMasterMs)
    else this.fromMasterMs = toMasterMs
  }

  setRate(rate: number): void {
    const pos = this.masterMs()
    this.rate = rate
    if (this.playing) this.start(pos)
  }

  setSolo(id: string | null): void {
    this.solo = id
    this.applySolo()
  }

  setNudge(id: string, nudgeMs: number): void {
    const t = this.tracks.get(id)
    if (!t) return
    t.nudgeMs = nudgeMs
    if (this.playing) {
      const pos = this.masterMs()
      t.source?.stop()
      t.source = null
      this.startSource(t, audioContext().currentTime + 0.03, pos + 30 * this.rate)
    }
  }

  private applySolo(): void {
    for (const t of this.tracks.values()) {
      t.gain.gain.value = this.solo === null || this.solo === t.id ? 1 : 0
    }
  }

  private stopSources(): void {
    for (const t of this.tracks.values()) {
      try { t.source?.stop() } catch { /* not started */ }
      t.source = null
    }
  }

  destroy(): void {
    this.playing = false
    this.stopSources()
    this.master?.disconnect()
    this.master = null
    this.ctx = null
    this.tracks.clear()
  }
}
