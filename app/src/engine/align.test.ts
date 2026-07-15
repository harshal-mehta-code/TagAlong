import { describe, expect, it } from 'vitest'
import { bestLag, measureRoundTripSec, resampleTo, suggestAlignmentMs } from './align'

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

  it('works with the 3-click sound-check train', () => {
    // same synth but only 3 clicks present — pattern must match what plays
    const rt = 0.147
    const x = synthCapture(0.35, rt)
    // zero out the 4th click so the capture matches a 3-click check
    const c4 = Math.round((0.35 + rt + 3 * INTERVAL) * SR)
    x.fill(0, c4, Math.min(x.length, c4 + Math.round(0.12 * SR)))
    const got = measureRoundTripSec(x, SR, 0.35, { clicks: 3, intervalSec: INTERVAL })
    expect(got).not.toBeNull()
    expect(Math.abs(got! - rt)).toBeLessThan(0.004)
  })
})

describe('suggestAlignmentMs', () => {
  const SR = 48_000

  /**
   * A sung phrase as an amplitude-modulated tone: syllable onsets every
   * ~450 ms with fast attacks — the homorhythmic structure the auto-align
   * keys on. `lagMs` shifts the whole performance late.
   */
  function sungPhrase(lagMs: number, freq: number, seconds = 8, seed = 7): Float32Array {
    const x = new Float32Array(Math.round(seconds * SR))
    // irregular syllable gaps like real lyrics — a perfectly periodic train
    // is deliberately rejected by the ambiguity gate (rival peak a beat away)
    const gaps = [0.45, 0.32, 0.61, 0.38, 0.52, 0.29]
    const onsets: number[] = []
    for (let t = 0.4, k = 0; t < seconds - 0.6; t += gaps[k++ % gaps.length]) {
      onsets.push(t + lagMs / 1000)
    }
    const n = noiseBurst(x.length, seed)
    for (const on of onsets) {
      const start = Math.round(on * SR)
      const len = Math.round(0.3 * SR)
      for (let i = 0; i < len && start + i >= 0 && start + i < x.length; i++) {
        const t = i / SR
        const env = Math.min(1, t / 0.02) * Math.exp(-t / 0.12)
        x[start + i] += env * (0.4 * Math.sin(2 * Math.PI * freq * t) + 0.05 * n[start + i])
      }
    }
    return x
  }

  it('recovers how late the user sang within 5 ms', () => {
    for (const lag of [0, 62, -85, 180]) {
      const user = sungPhrase(lag, 220)
      const guide = sungPhrase(0, 330, 8, 11)
      const got = suggestAlignmentMs(user, SR, guide, SR)
      expect(got).not.toBeNull()
      expect(Math.abs(got! - lag)).toBeLessThanOrEqual(5)
    }
  })

  it('returns null when the user signal has no matching rhythm', () => {
    const guide = sungPhrase(0, 330)
    const user = noiseBurst(8 * SR, 3)
    for (let i = 0; i < user.length; i++) user[i] *= 0.05
    expect(suggestAlignmentMs(user, SR, guide, SR)).toBeNull()
  })

  it('returns null on too-short material', () => {
    expect(suggestAlignmentMs(new Float32Array(SR), SR, new Float32Array(SR), SR)).toBeNull()
  })
})
