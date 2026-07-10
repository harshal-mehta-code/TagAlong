import { describe, expect, it } from 'vitest'
import { encodeWav, trimAndEncode } from './stem'

async function wavSampleCount(blob: Blob): Promise<number> {
  const v = new DataView(await blob.arrayBuffer())
  return v.getUint32(40, true) / 2
}

describe('encodeWav', () => {
  it('writes a valid mono 16-bit header', async () => {
    const blob = encodeWav(new Float32Array([0, 0.5, -0.5, 1]), 48000)
    const v = new DataView(await blob.arrayBuffer())
    expect(String.fromCharCode(v.getUint8(0), v.getUint8(1), v.getUint8(2), v.getUint8(3))).toBe('RIFF')
    expect(v.getUint16(22, true)).toBe(1) // mono
    expect(v.getUint32(24, true)).toBe(48000)
    expect(v.getUint16(34, true)).toBe(16)
    expect(await wavSampleCount(blob)).toBe(4)
  })
  it('clamps out-of-range samples', async () => {
    const blob = encodeWav(new Float32Array([2, -2]), 48000)
    const v = new DataView(await blob.arrayBuffer())
    expect(v.getInt16(44, true)).toBe(0x7fff)
    expect(v.getInt16(46, true)).toBe(-0x8000)
  })
})

describe('trimAndEncode', () => {
  const sr = 1000 // 1 sample per ms for easy math
  it('drops samples before t0 so stem sample 0 == master t=0', async () => {
    const chunks = [new Float32Array(100), new Float32Array(100)] // 200ms captured
    // capture began at ctx 5.0s, t0 at 5.05s → trim 50 samples, keep 150
    const blob = trimAndEncode(chunks, 5.0, 5.05, sr)!
    expect(await wavSampleCount(blob)).toBe(150)
  })
  it('keeps everything when capture starts after t0', async () => {
    const blob = trimAndEncode([new Float32Array(80)], 6.0, 5.9, sr)!
    expect(await wavSampleCount(blob)).toBe(80)
  })
  it('returns null when nothing remains', () => {
    expect(trimAndEncode([new Float32Array(10)], 5.0, 6.0, sr)).toBeNull()
  })
})
