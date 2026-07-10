import { driftCorrection, mediaTimeForMasterMs } from '../engine/offsets'

export interface SyncTrack {
  id: string
  el: HTMLVideoElement
  mediaOffsetMs: number
  nudgeMs: number
}

/**
 * Plays N video elements as one performance: each element's currentTime is
 * slaved to a master clock at (mediaOffset + nudge + masterTime). Drift is
 * corrected with playbackRate micro-adjustments, hard re-seek past 60 ms
 * (doc 04 "performed collage").
 */
export class SyncController {
  private tracks: SyncTrack[] = []
  private raf = 0
  private lastCheck = 0
  private masterStartPerf = 0 // performance.now() at masterTime 0 of this play
  private masterBaseMs = 0
  private _playing = false
  private rate = 1
  onTick: ((masterMs: number) => void) | null = null

  setTracks(tracks: SyncTrack[]): void {
    this.tracks = tracks
  }

  get playing(): boolean {
    return this._playing
  }

  get masterMs(): number {
    if (!this._playing) return this.masterBaseMs
    return this.masterBaseMs + (performance.now() - this.masterStartPerf) * this.rate
  }

  async play(fromMs?: number): Promise<void> {
    if (fromMs !== undefined) this.masterBaseMs = fromMs
    this.masterStartPerf = performance.now()
    this._playing = true
    await Promise.all(
      this.tracks.map(async (t) => {
        t.el.currentTime = mediaTimeForMasterMs(this.masterMs, t.mediaOffsetMs, t.nudgeMs)
        t.el.playbackRate = this.rate
        try { await t.el.play() } catch { /* autoplay policies; user will tap again */ }
      }),
    )
    this.loop()
  }

  pause(): void {
    this.masterBaseMs = this.masterMs
    this._playing = false
    cancelAnimationFrame(this.raf)
    for (const t of this.tracks) t.el.pause()
  }

  seek(toMs: number): void {
    this.masterBaseMs = Math.max(0, toMs)
    this.masterStartPerf = performance.now()
    for (const t of this.tracks) {
      t.el.currentTime = mediaTimeForMasterMs(this.masterBaseMs, t.mediaOffsetMs, t.nudgeMs)
    }
  }

  setRate(rate: number): void {
    this.masterBaseMs = this.masterMs
    this.masterStartPerf = performance.now()
    this.rate = rate
    for (const t of this.tracks) {
      t.el.playbackRate = rate
      ;(t.el as HTMLVideoElement & { preservesPitch?: boolean }).preservesPitch = true
    }
  }

  updateNudge(trackId: string, nudgeMs: number): void {
    const t = this.tracks.find((x) => x.id === trackId)
    if (t) {
      t.nudgeMs = nudgeMs
      t.el.currentTime = mediaTimeForMasterMs(this.masterMs, t.mediaOffsetMs, t.nudgeMs)
    }
  }

  private overLimit: Record<string, number> = {}

  private loop = (): void => {
    if (!this._playing) return
    const now = performance.now()
    this.onTick?.(this.masterMs)
    // Single track free-runs: no correction needed against a wall clock, and
    // seeking freshly-recorded blobs is expensive (choppy playback on device).
    if (now - this.lastCheck > 400 && this.tracks.length > 1) {
      this.lastCheck = now
      const masterMs = this.masterMs
      for (const t of this.tracks) {
        if (t.el.readyState < 2) continue
        const expected = mediaTimeForMasterMs(masterMs, t.mediaOffsetMs, t.nudgeMs)
        const action = driftCorrection(t.el.currentTime, expected)
        if (action.kind === 'seek') {
          // require the error to persist across two checks before hard-seeking —
          // one-off decoder hiccups otherwise cause seek thrash
          this.overLimit[t.id] = (this.overLimit[t.id] ?? 0) + 1
          if (this.overLimit[t.id] >= 2) {
            t.el.currentTime = action.toSec
            this.overLimit[t.id] = 0
          }
        } else {
          this.overLimit[t.id] = 0
          if (action.kind === 'rate') t.el.playbackRate = this.rate * action.rate
          else t.el.playbackRate = this.rate
        }
      }
    }
    this.raf = requestAnimationFrame(this.loop)
  }

  destroy(): void {
    this._playing = false
    cancelAnimationFrame(this.raf)
    for (const t of this.tracks) t.el.pause()
    this.tracks = []
  }
}
