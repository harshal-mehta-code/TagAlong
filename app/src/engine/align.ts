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
// --- Count-in bleed round-trip measurement ----------------------------------
//
// Latency APIs lie: Chrome's AudioContext.outputLatency visibly fluctuates at
// runtime and Safari reports no input latency at all, so an anchor built on
// reported values shifts from take to take. But the mic physically HEARS the
// count-in clicks bleed back in (speakers), and the click train's timing is
// known exactly — correlating its envelope against the raw capture measures
// this take's true speaker→air→mic round trip, the same quantity a DAW's
// loopback calibration measures, per take and for free.

const ENV_RATE = 1000 // Hz — 1 ms envelope resolution

/**
 * Transient-emphasis envelope: first difference (a crude high-pass that
 * favors click edges over voice and room rumble), then per-window RMS.
 */
export function transientEnvelope(
  signal: Float32Array,
  sampleRate: number,
  envRate = ENV_RATE,
): Float32Array {
  const win = Math.max(1, Math.round(sampleRate / envRate))
  const n = Math.floor(signal.length / win)
  const out = new Float32Array(n)
  for (let i = 0; i < n; i++) {
    let s = 0
    const base = i * win
    for (let j = 0; j < win; j++) {
      const k = base + j
      const d = signal[k] - (k > 0 ? signal[k - 1] : 0)
      s += d * d
    }
    out[i] = Math.sqrt(s / win)
  }
  return out
}

/** The count-in click train as an envelope-domain pattern (clicks decay ~90 ms, audio.ts). */
export function clickEnvelopePattern(
  clicks: number,
  intervalSec: number,
  envRate = ENV_RATE,
): Float32Array {
  const decaySec = 0.09
  const tau = decaySec / Math.log(750) // click gain falls 0.75 → 0.001 over decaySec
  const len = Math.round(((clicks - 1) * intervalSec + decaySec + 0.06) * envRate)
  const out = new Float32Array(len)
  const clickLen = Math.round((decaySec + 0.03) * envRate)
  for (let c = 0; c < clicks; c++) {
    const start = Math.round(c * intervalSec * envRate)
    for (let i = 0; i < clickLen && start + i < len; i++) {
      out[start + i] += Math.exp(-(i / envRate) / tau)
    }
  }
  return out
}

/**
 * Measure this take's round-trip (speaker→air→mic) latency from the click
 * bleed in the raw capture. `t0OffsetSec` is where master t=0 (the first
 * click's SCHEDULED time) sits in `raw`. Returns null when no confident bleed
 * is found — headphones, or capture stopped mid–count-in — and the caller
 * falls back to API-reported latency.
 */
export function measureRoundTripSec(
  raw: Float32Array,
  sampleRate: number,
  t0OffsetSec: number,
  opts: {
    clicks: number
    intervalSec: number
    maxRoundTripSec?: number
    minCorrelation?: number
  },
): number | null {
  const maxRt = opts.maxRoundTripSec ?? 0.35
  const minCorr = opts.minCorrelation ?? 0.4
  if (t0OffsetSec < 0) return null
  const clickSpanSec = (opts.clicks - 1) * opts.intervalSec + 0.2
  if (raw.length / sampleRate < t0OffsetSec + clickSpanSec + maxRt) return null
  const from = Math.floor(t0OffsetSec * sampleRate)
  const to = Math.min(raw.length, Math.ceil((t0OffsetSec + clickSpanSec + maxRt) * sampleRate))
  const env = transientEnvelope(raw.subarray(from, to), sampleRate)
  const pattern = clickEnvelopePattern(opts.clicks, opts.intervalSec)
  const K = pattern.length
  const maxLag = Math.min(env.length - K, Math.round(maxRt * ENV_RATE))
  if (maxLag < 0) return null

  let pSum = 0
  let pSq = 0
  for (let k = 0; k < K; k++) {
    pSum += pattern[k]
    pSq += pattern[k] * pattern[k]
  }
  const pVar = pSq - (pSum * pSum) / K
  if (pVar <= 0) return null

  // Pearson correlation at every candidate lag: scale-free, so it rejects
  // "just loud" windows and only fires on the 4-spike click rhythm. The
  // click interval (660 ms) far exceeds maxRt, so no off-by-one-click peak
  // can fall inside the search range.
  let bestLag = -1
  let bestR = -Infinity
  for (let lag = 0; lag <= maxLag; lag++) {
    let eSum = 0
    let eSq = 0
    let ep = 0
    for (let k = 0; k < K; k++) {
      const e = env[lag + k]
      eSum += e
      eSq += e * e
      ep += e * pattern[k]
    }
    const eVar = eSq - (eSum * eSum) / K
    if (eVar <= 0) continue
    const r = (ep - (eSum * pSum) / K) / Math.sqrt(eVar * pVar)
    if (r > bestR) {
      bestR = r
      bestLag = lag
    }
  }
  if (bestLag < 0 || bestR < minCorr) return null
  return bestLag / ENV_RATE
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
