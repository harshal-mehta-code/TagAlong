import { describe, expect, it } from 'vitest'
import { bestLag, measureRoundTripSec, resampleTo } from './align'

function noiseBurst(len: number, seed = 1): Float32Array {
  // deterministic pseudo-noise so the test can't flake
  const out = new Float32Array(len)
  let x = seed
  for (let i = 0; i < len; i++) {
    x = (x * 1103515245 + 12345) & 0x7fffffff
    out[i] = (x / 0x7fffffff) * 2 - 1
  }
  return out
}

describe('resampleTo', () => {
  it('is identity at equal rates', () => {
    const src = noiseBurst(100)
    expect(resampleTo(src, 8000, 8000)).toBe(src)
  })
  it('halves length when downsampling 2:1 and preserves a DC signal', () => {
    const src = new Float32Array(1000).fill(0.5)
    const out = resampleTo(src, 16000, 8000)
    expect(out.length).toBe(500)
    expect(out[250]).toBeCloseTo(0.5, 5)
  })
})

describe('bestLag', () => {
  it('recovers a known embedding lag exactly', () => {
    const pattern = noiseBurst(8000) // 1s of "voice" at 8kHz
    const lag = 3456
    const signal = new Float32Array(pattern.length + 8000)
    signal.set(pattern, lag)
    expect(bestLag(signal, pattern, lag - 2000, lag + 2000)).toBe(lag)
  })
  it('recovers the lag with additive noise on the signal', () => {
    const pattern = noiseBurst(8000, 7)
    const lag = 2000
    const signal = noiseBurst(pattern.length + 6000, 42)
    for (let i = 0; i < signal.length; i++) signal[i] *= 0.3
    for (let i = 0; i < pattern.length; i++) signal[lag + i] += pattern[i]
    const found = bestLag(signal, pattern, 500, 4000)
    expect(found).not.toBeNull()
    expect(Math.abs(found! - lag)).toBeLessThanOrEqual(1)
  })
  it('returns null for too-short patterns', () => {
    expect(bestLag(noiseBurst(8000), noiseBurst(100), 0, 100)).toBeNull()
  })
})

describe('measureRoundTripSec', () => {
  const SR = 48_000
  const CLICKS = 4
  const INTERVAL = 0.66
  const OPTS = { clicks: CLICKS, intervalSec: INTERVAL }

  /**
   * A raw capture as the mic would hear it: background noise + mains hum,
   * plus (optionally) the count-in clicks arriving `rtSec` after their
   * scheduled times — decaying square-ish tones like scheduleCountIn's.
   */
  function synthCapture(t0OffsetSec: number, rtSec: number | null, clickAmp = 0.25): Float32Array {
    const durSec = t0OffsetSec + (CLICKS - 1) * INTERVAL + 0.5 + Math.max(rtSec ?? 0, 0.35)
    const x = new Float32Array(Math.round(durSec * SR))
    let s = 987654321
    for (let i = 0; i < x.length; i++) {
      s = (s * 1103515245 + 12345) & 0x7fffffff
      x[i] = ((s / 0x7fffffff) * 2 - 1) * 0.02 + 0.05 * Math.sin((2 * Math.PI * 120 * i) / SR)
    }
    if (rtSec !== null) {
      const decay = 0.09
      const tau = decay / Math.log(750)
      for (let c = 0; c < CLICKS; c++) {
        const f = c === 0 ? 1568 : 1046
        const start = Math.round((t0OffsetSec + rtSec + c * INTERVAL) * SR)
        const n = Math.round(decay * SR)
        for (let i = 0; i < n && start + i < x.length; i++) {
          const t = i / SR
          x[start + i] += clickAmp * Math.exp(-t / tau) * Math.sign(Math.sin(2 * Math.PI * f * t))
        }
      }
    }
    return x
  }

  it('recovers a typical laptop round trip within 4 ms', () => {
    const rt = 0.083
    const got = measureRoundTripSec(synthCapture(0.45, rt), SR, 0.45, OPTS)
    expect(got).not.toBeNull()
    expect(Math.abs(got! - rt)).toBeLessThanOrEqual(0.004)
  })

  it('recovers a small wired round trip within 4 ms', () => {
    const rt = 0.012
    const got = measureRoundTripSec(synthCapture(0.45, rt), SR, 0.45, OPTS)
    expect(got).not.toBeNull()
    expect(Math.abs(got! - rt)).toBeLessThanOrEqual(0.004)
  })

  it('recovers a large Bluetooth round trip within 4 ms', () => {
    const rt = 0.291
    const got = measureRoundTripSec(synthCapture(0.45, rt), SR, 0.45, OPTS)
    expect(got).not.toBeNull()
    expect(Math.abs(got! - rt)).toBeLessThanOrEqual(0.004)
  })

  it('still locks on with quiet bleed under the noise-heavy mix', () => {
    const rt = 0.06
    const got = measureRoundTripSec(synthCapture(0.45, rt, 0.05), SR, 0.45, OPTS)
    expect(got).not.toBeNull()
    expect(Math.abs(got! - rt)).toBeLessThanOrEqual(0.004)
  })

  it('returns null when there is no bleed (headphones)', () => {
    expect(measureRoundTripSec(synthCapture(0.45, null), SR, 0.45, OPTS)).toBeNull()
  })

  it('returns null when the capture ends mid-count-in', () => {
    const raw = synthCapture(0.45, 0.08).subarray(0, Math.round(1.5 * SR))
    expect(measureRoundTripSec(raw, SR, 0.45, OPTS)).toBeNull()
  })

  it('returns null on pure silence', () => {
    expect(measureRoundTripSec(new Float32Array(SR * 4), SR, 0.45, OPTS)).toBeNull()
  })
})
