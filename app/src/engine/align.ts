import { audioContext } from './audio'

/**
 * Post-recording sync refinement. The take's video file and its PCM stem
 * contain the SAME mic signal, so cross-correlating the two measures exactly
 * where master t=0 sits inside the media file. MediaRecorder's `start` event
 * — the previous estimate — routinely lands 20–150 ms away from where the
 * encoder actually began, and differently on every take, which is why takes
 * drifted against each other no matter how well playback was clocked.
 */

const WORK_RATE = 8000 // Hz — plenty for onset alignment, cheap to correlate

/** Linear-interpolation resample; pure, unit-tested. */
export function resampleTo(src: Float32Array, srcRate: number, dstRate: number): Float32Array {
  if (srcRate === dstRate) return src
  const outLen = Math.max(1, Math.floor((src.length * dstRate) / srcRate))
  const out = new Float32Array(outLen)
  const step = srcRate / dstRate
  for (let i = 0; i < outLen; i++) {
    const pos = i * step
    const i0 = Math.floor(pos)
    const frac = pos - i0
    const a = src[i0] ?? 0
    const b = src[i0 + 1] ?? a
    out[i] = a + (b - a) * frac
  }
  return out
}

/**
 * Lag (in samples) at which `pattern` best matches `signal[lag..]`, searched
 * over [minLag, maxLag]. Coarse pass (stride 4) then a fine pass around the
 * winner. Returns null when there is no meaningful correlation to trust.
 */
export function bestLag(
  signal: Float32Array,
  pattern: Float32Array,
  minLag: number,
  maxLag: number,
): number | null {
  const K = Math.min(pattern.length, 4 * WORK_RATE)
  if (K < WORK_RATE / 4) return null // < 250 ms of material — nothing to align on
  const lo = Math.max(0, minLag)
  const hi = Math.max(lo, maxLag)
  const score = (lag: number, stride: number): number => {
    let s = 0
    for (let k = 0; k < K; k += stride) {
      const si = k + lag
      if (si >= signal.length) break
      s += signal[si] * pattern[k]
    }
    return s
  }
  let best = lo
  let bestScore = -Infinity
  for (let lag = lo; lag <= hi; lag += 4) {
    const s = score(lag, 4)
    if (s > bestScore) { bestScore = s; best = lag }
  }
  for (let lag = Math.max(lo, best - 6); lag <= Math.min(hi, best + 6); lag++) {
    const s = score(lag, 1)
    if (s > bestScore) { bestScore = s; best = lag }
  }
  return bestScore > 0 ? best : null
}

function rms(x: Float32Array): number {
  let s = 0
  for (let i = 0; i < x.length; i++) s += x[i] * x[i]
  return Math.sqrt(s / (x.length || 1))
}

/**
 * Measure the true mediaOffsetMs by aligning the media file's audio with the
 * stem. Search is bounded to ±`searchMs` around the recorder's estimate.
 * Returns null when the media can't be decoded (iOS mp4) or the signals are
 * too quiet to trust — callers keep the estimate in that case.
 */
export async function refineMediaOffsetMs(
  media: Blob,
  stem: Blob,
  approxMs: number,
  searchMs = 350,
): Promise<number | null> {
  const c = audioContext()
  let mediaBuf: AudioBuffer
  let stemBuf: AudioBuffer
  try {
    mediaBuf = await c.decodeAudioData(await media.arrayBuffer())
    stemBuf = await c.decodeAudioData(await stem.arrayBuffer())
  } catch {
    return null
  }
  const m = resampleTo(mediaBuf.getChannelData(0), mediaBuf.sampleRate, WORK_RATE)
  const s = resampleTo(stemBuf.getChannelData(0), stemBuf.sampleRate, WORK_RATE)
  if (rms(m) < 1e-3 || rms(s) < 1e-3) return null // effectively silent takes can't anchor
  const approxLag = Math.round((approxMs / 1000) * WORK_RATE)
  const span = Math.round((searchMs / 1000) * WORK_RATE)
  const lag = bestLag(m, s, approxLag - span, approxLag + span)
  if (lag === null) return null
  return (lag / WORK_RATE) * 1000
}
