import { audioContext } from './audio'

/**
 * Captures the mic as raw PCM on the AudioContext clock while a take records,
 * then trims it so sample 0 == master t=0 and encodes WAV.
 *
 * Why: every take needs an audio stem separate from its video. iOS Safari
 * allows only ONE unmuted media element to produce sound at a time, so the
 * collage can never mix audio through <video> elements — all mixing happens
 * in one Web Audio graph fed by these stems (videos stay muted, visual only).
 * WAV because Web Audio decodes it everywhere; container-decode of mp4 video
 * blobs is exactly what iOS rejects.
 */
export class StemCapture {
  private chunks: Float32Array[] = []
  private firstChunkCtxTime: number | null = null
  private node: ScriptProcessorNode | null = null
  private source: MediaStreamAudioSourceNode | null = null
  private silent: GainNode | null = null

  constructor(private stream: MediaStream) {}

  start(): void {
    const c = audioContext()
    this.source = c.createMediaStreamSource(this.stream)
    this.node = c.createScriptProcessor(4096, 1, 1)
    this.node.onaudioprocess = (e) => {
      if (this.firstChunkCtxTime === null) {
        const pt = (e as AudioProcessingEvent & { playbackTime?: number }).playbackTime
        this.firstChunkCtxTime = typeof pt === 'number' && pt > 0
          ? pt
          : c.currentTime - e.inputBuffer.duration
      }
      this.chunks.push(new Float32Array(e.inputBuffer.getChannelData(0)))
    }
    // a zero-gain sink keeps the processor pulling without audible feedback
    this.silent = c.createGain()
    this.silent.gain.value = 0
    this.source.connect(this.node)
    this.node.connect(this.silent)
    this.silent.connect(c.destination)
  }

  /** Stops capture and returns the WAV stem trimmed to start at t0 (or null if nothing captured). */
  stop(t0CtxTime: number): Blob | null {
    this.source?.disconnect()
    this.node?.disconnect()
    this.silent?.disconnect()
    this.node = null
    if (this.chunks.length === 0 || this.firstChunkCtxTime === null) return null
    const sr = audioContext().sampleRate
    return trimAndEncode(this.chunks, this.firstChunkCtxTime, t0CtxTime, sr)
  }
}

/** Pure trim + peak-normalize + WAV encode, unit-testable without an AudioContext. */
export function trimAndEncode(
  chunks: Float32Array[],
  firstChunkTime: number,
  t0Time: number,
  sampleRate: number,
): Blob | null {
  const total = chunks.reduce((n, c) => n + c.length, 0)
  const all = new Float32Array(total)
  let pos = 0
  for (const c of chunks) {
    all.set(c, pos)
    pos += c.length
  }
  const startSample = Math.max(0, Math.round((t0Time - firstChunkTime) * sampleRate))
  if (startSample >= total) return null
  const trimmed = all.subarray(startSample)
  normalizePeak(trimmed)
  return encodeWav(trimmed, sampleRate)
}

/**
 * Scale in place to a 0.89 peak (gain capped at 12× so silence isn't blown
 * into noise). Raw mobile mic levels — AGC is off for sync fidelity — are far
 * too quiet to play back directly; this is what makes stems audible.
 */
export function normalizePeak(samples: Float32Array, target = 0.89, maxGain = 12): void {
  let peak = 0
  for (let i = 0; i < samples.length; i++) {
    const a = Math.abs(samples[i])
    if (a > peak) peak = a
  }
  if (peak < 1e-4) return // effectively silence — leave it
  const gain = Math.min(target / peak, maxGain)
  if (gain <= 1) return // already loud enough; never attenuate
  for (let i = 0; i < samples.length; i++) samples[i] *= gain
}

/** Mono 16-bit PCM WAV. */
export function encodeWav(samples: Float32Array, sampleRate: number): Blob {
  const buf = new ArrayBuffer(44 + samples.length * 2)
  const v = new DataView(buf)
  const writeStr = (off: number, s: string) => {
    for (let i = 0; i < s.length; i++) v.setUint8(off + i, s.charCodeAt(i))
  }
  writeStr(0, 'RIFF')
  v.setUint32(4, 36 + samples.length * 2, true)
  writeStr(8, 'WAVE')
  writeStr(12, 'fmt ')
  v.setUint32(16, 16, true)
  v.setUint16(20, 1, true) // PCM
  v.setUint16(22, 1, true) // mono
  v.setUint32(24, sampleRate, true)
  v.setUint32(28, sampleRate * 2, true)
  v.setUint16(32, 2, true)
  v.setUint16(34, 16, true)
  writeStr(36, 'data')
  v.setUint32(40, samples.length * 2, true)
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]))
    v.setInt16(44 + i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true)
  }
  return new Blob([buf], { type: 'audio/wav' })
}
