import { describe, expect, it } from 'vitest'
import { clampNudgeMs, computeMediaOffsetMs, driftCorrection, mediaTimeForMasterMs } from './offsets'

describe('computeMediaOffsetMs', () => {
  it('is the gap between recorder start and first click', () => {
    expect(computeMediaOffsetMs(10.0, 10.45)).toBeCloseTo(450)
  })
  it('never goes negative (recorder must be rolling before t=0)', () => {
    expect(computeMediaOffsetMs(11.0, 10.5)).toBe(0)
  })
})

describe('mediaTimeForMasterMs', () => {
  it('maps master time into the media timeline', () => {
    // t=0 sits 450ms into the file; at master 2000ms we should be at 2.45s
    expect(mediaTimeForMasterMs(2000, 450, 0)).toBeCloseTo(2.45)
  })
  it('applies the nudge', () => {
    expect(mediaTimeForMasterMs(2000, 450, 50)).toBeCloseTo(2.5)
    expect(mediaTimeForMasterMs(2000, 450, -50)).toBeCloseTo(2.4)
  })
  it('round-trips with computeMediaOffsetMs', () => {
    const offset = computeMediaOffsetMs(100.0, 100.45)
    // at master 0 the media should read exactly the offset
    expect(mediaTimeForMasterMs(0, offset, 0)).toBeCloseTo(0.45)
  })
})

describe('driftCorrection', () => {
  it('leaves drift inside the ±35ms dead band alone (clock jitter territory)', () => {
    expect(driftCorrection(10.01, 10.0)).toEqual({ kind: 'ok' })
    expect(driftCorrection(10.03, 10.0)).toEqual({ kind: 'ok' })
  })
  it('rate-corrects once drift passes the engage threshold', () => {
    expect(driftCorrection(10.05, 10.0)).toEqual({ kind: 'rate', rate: 0.97 })
    expect(driftCorrection(9.95, 10.0)).toEqual({ kind: 'rate', rate: 1.03 })
  })
  it('keeps correcting until the error falls under the release threshold (hysteresis)', () => {
    // 20ms error: ignored when idle, still corrected when already correcting
    expect(driftCorrection(10.02, 10.0, false)).toEqual({ kind: 'ok' })
    expect(driftCorrection(10.02, 10.0, true)).toEqual({ kind: 'rate', rate: 0.97 })
    // under 12ms it releases either way — no 0.97/1.03 oscillation
    expect(driftCorrection(10.01, 10.0, true)).toEqual({ kind: 'ok' })
  })
  it('hard-seeks only past 150ms', () => {
    expect(driftCorrection(10.1, 10.0)).toEqual({ kind: 'rate', rate: 0.97 })
    expect(driftCorrection(10.2, 10.0)).toEqual({ kind: 'seek', toSec: 10.0 })
  })
})

describe('clampNudgeMs', () => {
  it('clamps to ±250 and snaps to 5ms', () => {
    expect(clampNudgeMs(400)).toBe(250)
    expect(clampNudgeMs(-400)).toBe(-250)
    expect(clampNudgeMs(37)).toBe(35)
    expect(clampNudgeMs(-63)).toBe(-65)
  })
})
