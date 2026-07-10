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

export function driftCorrection(
  actualSec: number,
  expectedSec: number,
  hardLimitSec = 0.06,
  softLimitSec = 0.015,
): DriftAction {
  const err = actualSec - expectedSec
  if (Math.abs(err) > hardLimitSec) return { kind: 'seek', toSec: expectedSec }
  if (Math.abs(err) > softLimitSec) return { kind: 'rate', rate: err > 0 ? 0.97 : 1.03 }
  return { kind: 'ok' }
}

export function clampNudgeMs(v: number): number {
  return Math.max(-250, Math.min(250, Math.round(v / 5) * 5))
}
