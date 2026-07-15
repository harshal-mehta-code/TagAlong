import { measureRoundTripSec } from './align'
import { CLICK_INTERVAL_SEC, ensureRunning, matchContextSampleRate, scheduleClicks, setAudioSessionType } from './audio'
import { StemCapture } from './stem'

/**
 * Device sound check: play a few clicks on the speaker with the mic open and
 * measure the speaker→air→mic round trip from the bleed — the same DAW-style
 * loopback measurement the recorder does per take, run once as an explicit
 * calibration. The stored value anchors headphone takes, where the mic can't
 * hear the count-in and latency APIs are the only (unreliable) alternative.
 */

const STORE_KEY = 'tagalong.roundtrip.v1'
const CAL_CLICKS = 3

export interface RtCalibration {
  roundTripSec: number
  measuredAt: number
}

export function storedCalibration(): RtCalibration | null {
  try {
    const raw = localStorage.getItem(STORE_KEY)
    if (!raw) return null
    const cal = JSON.parse(raw) as RtCalibration
    if (typeof cal.roundTripSec !== 'number' || cal.roundTripSec < 0 || cal.roundTripSec > 0.35) return null
    return cal
  } catch {
    return null
  }
}

export function storeCalibration(roundTripSec: number): void {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify({ roundTripSec, measuredAt: Date.now() } satisfies RtCalibration))
  } catch { /* private mode — calibration just won't persist */ }
}

export type SoundCheckResult =
  | { ok: true; roundTripMs: number }
  | { ok: false; reason: 'mic-denied' | 'no-bleed' }

/**
 * Run the sound check: ~2.5 s, speaker + mic. Fails with 'no-bleed' when the
 * clicks weren't heard (headphones already on, volume down, very quiet room
 * playback) — caller should tell the user to unplug and turn up.
 */
export async function runSoundCheck(): Promise<SoundCheckResult> {
  setAudioSessionType('play-and-record')
  let stream: MediaStream
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
    })
  } catch {
    setAudioSessionType('playback')
    return { ok: false, reason: 'mic-denied' }
  }
  try {
    matchContextSampleRate(stream.getAudioTracks()[0]?.getSettings().sampleRate)
    await ensureRunning()
    const capture = new StemCapture(stream)
    await capture.start()
    const t0 = scheduleClicks(CAL_CLICKS, 0.35)
    const clickSpanSec = (CAL_CLICKS - 1) * CLICK_INTERVAL_SEC + 0.2
    // wait until the whole train + max round trip is safely captured
    await new Promise((r) => setTimeout(r, (0.35 + clickSpanSec + 0.5) * 1000))
    const raw = await capture.stop()
    if (!raw) return { ok: false, reason: 'no-bleed' }
    const measured = measureRoundTripSec(raw.samples, raw.sampleRate, t0 - raw.startCtxTime, {
      clicks: CAL_CLICKS,
      intervalSec: CLICK_INTERVAL_SEC,
    })
    if (measured === null) return { ok: false, reason: 'no-bleed' }
    storeCalibration(measured)
    return { ok: true, roundTripMs: Math.round(measured * 1000) }
  } finally {
    stream.getTracks().forEach((t) => t.stop())
    setAudioSessionType('playback')
  }
}
