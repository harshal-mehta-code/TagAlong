import { audioContext } from './audio'
import { decodeMediaAudio } from './mediaAudio'

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
  const mediaBuf = await decodeMediaAudio(media)
  if (!mediaBuf) return null
  let stemBuf: AudioBuffer
  try {
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

// --- Content auto-align (headphone joins) -----------------------------------
//
// With headphones on, the mic never hears the count-in bleed, so the anchor
// falls back to calibration or an API guess. But barbershop is homorhythmic:
// every part articulates the same words together, so the ENVELOPE of the new
// take correlates with the envelope of the guide mix the singer heard — at a
// lag equal to how late the take landed. That lag IS the nudge that fixes it.

/**
 * How many ms `user` lags `guide` (positive = user is late). Both signals are
 * on the master timeline (stem/premix). Confidence-gated: returns null unless
 * the correlation peak is strong AND clearly beats every rival lag, so a
 * sustained-chord passage or unrelated singing can't produce a false shift.
 */
export function suggestAlignmentMs(
  user: Float32Array,
  userRate: number,
  guide: Float32Array,
  guideRate: number,
  opts?: { maxLagMs?: number; minCorrelation?: number; minMargin?: number },
): number | null {
  const maxLag = Math.round(opts?.maxLagMs ?? 300) // env is 1 ms/sample
  const minCorr = opts?.minCorrelation ?? 0.5
  const minMargin = opts?.minMargin ?? 0.08
  const eu = transientEnvelope(user, userRate)
  const eg = transientEnvelope(guide, guideRate)
  const n = Math.min(eu.length, eg.length) - maxLag
  if (n < 2000) return null // < 2 s of comparable material

  const corrAt = (lag: number): number => {
    // correlate eu[i + lag] against eg[i] over the safe overlap
    let uS = 0, uQ = 0, gS = 0, gQ = 0, ug = 0
    let count = 0
    for (let i = maxLag; i < n; i++) {
      const u = eu[i + lag]
      const g = eg[i]
      uS += u; uQ += u * u; gS += g; gQ += g * g; ug += u * g
      count++
    }
    const uVar = uQ - (uS * uS) / count
    const gVar = gQ - (gS * gS) / count
    if (uVar <= 0 || gVar <= 0) return -1
    return (ug - (uS * gS) / count) / Math.sqrt(uVar * gVar)
  }

  let bestLag = 0
  let bestR = -Infinity
  const rs = new Float32Array(2 * maxLag + 1)
  for (let lag = -maxLag; lag <= maxLag; lag++) {
    const r = corrAt(lag)
    rs[lag + maxLag] = r
    if (r > bestR) { bestR = r; bestLag = lag }
  }
  if (bestR < minCorr) return null
  // rival check: best correlation more than 40 ms away must be clearly worse
  let rival = -Infinity
  for (let lag = -maxLag; lag <= maxLag; lag++) {
    if (Math.abs(lag - bestLag) <= 40) continue
    const r = rs[lag + maxLag]
    if (r > rival) rival = r
  }
  if (bestR - rival < minMargin) return null
  return bestLag
}
