import { describe, expect, it } from 'vitest'
import { bestLag, resampleTo } from './align'

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
