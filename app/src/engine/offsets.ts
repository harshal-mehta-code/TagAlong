/**
 * Pure sync math — unit tested. All times in AudioContext seconds unless
 * suffixed Ms.
 */

/** Where the master t=0 falls inside a media file that started recording at recStart. */
export function computeMediaOffsetMs(recStartCtxTime: number, t0CtxTime: number): number {
  return Math.max(0, (t0CtxTime - recStartCtxTime) * 1000)
}

/**
 * The media currentTime a take's element should show at a given master time.
 * masterTimeMs 0 == first count-in click.
 */
export function mediaTimeForMasterMs(
  masterTimeMs: number,
  mediaOffsetMs: number,
  nudgeMs: number,
): number {
  return (mediaOffsetMs + nudgeMs + masterTimeMs) / 1000
}

/** Drift decision for the sync player: returns a corrective action. */
export type DriftAction =
  | { kind: 'ok' }
  | { kind: 'rate'; rate: number }
  | { kind: 'seek'; toSec: number }

/**
 * Hysteresis correction: errors inside the ±35 ms dead band are left alone
 * (invisible for lip sync, and video clocks jitter that much anyway); past it
 * a gentle 3% rate change pulls the track in and keeps correcting until the
 * error falls under 12 ms; only gross errors seek. The previous symmetric
 * 15 ms threshold sat right at clock-jitter level, so tracks oscillated
 * between 0.97× and 1.03× every check — visible judder.
 */
export function driftCorrection(
  actualSec: number,
  expectedSec: number,
  correcting = false,
  hardLimitSec = 0.15,
  engageSec = 0.035,
  releaseSec = 0.012,
): DriftAction {
  const err = actualSec - expectedSec
  if (Math.abs(err) > hardLimitSec) return { kind: 'seek', toSec: expectedSec }
  if (Math.abs(err) > (correcting ? releaseSec : engageSec)) {
    return { kind: 'rate', rate: err > 0 ? 0.97 : 1.03 }
  }
  return { kind: 'ok' }
}

export function clampNudgeMs(v: number): number {
  return Math.max(-250, Math.min(250, Math.round(v / 5) * 5))
}
