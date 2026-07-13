import { KEYS, type Key } from '../types'

let ctx: AudioContext | null = null

// --- iOS audio session -----------------------------------------------------
//
// iOS plays Web Audio on the RINGER channel by default, so the mute switch
// silences the entire app (pitch pipe, count-in, collage audio) on the
// speaker while headphones still work. The Audio Session API (WebKit,
// iOS/Safari 16.4+) is the official fix: type 'playback' moves output to the
// media channel. While the mic is live we ask for 'play-and-record' instead.

type SessionKind = 'playback' | 'play-and-record'
interface AudioSessionLike { type: string }

function audioSession(): AudioSessionLike | null {
  const s = (navigator as Navigator & { audioSession?: AudioSessionLike }).audioSession
  return s ?? null
}

/** True where the Audio Session API exists (WebKit 16.4+). */
export function hasAudioSessionApi(): boolean {
  return audioSession() !== null
}

// the kind the app currently wants; re-asserted (never overridden) by
// ensureRunning/audioContext so a pitch-pipe tap while the mic is live
// can't yank the session out of play-and-record
let sessionKind: SessionKind = 'playback'

export function setAudioSessionType(kind: SessionKind): void {
  sessionKind = kind
  applyAudioSessionType()
}

function applyAudioSessionType(): void {
  const s = audioSession()
  if (s) {
    try { s.type = sessionKind } catch { /* older enum set */ }
  }
}

const IS_IOS_LIKE =
  typeof navigator !== 'undefined' &&
  (/iP(hone|ad|od)/.test(navigator.userAgent) ||
    (navigator.userAgent.includes('Mac') && navigator.maxTouchPoints > 1))

// 50 ms of silent 16-bit PCM. On iOS versions without navigator.audioSession,
// playing any <audio> element kicks the WebKit session onto the media
// channel, unmuting Web Audio under the silent switch (the classic
// "unmute-ios-audio" trick). Harmless elsewhere; only used as fallback.
const SILENT_WAV =
  'data:audio/wav;base64,UklGRkQDAABXQVZFZm10IBAAAAABAAEAQB8AAIA+AAACABAAZGF0YSAD' +
  'A'.repeat(1070) + '=='
let unlockEl: HTMLAudioElement | null = null

function unlockIosMediaChannel(): void {
  if (!IS_IOS_LIKE || audioSession()) return
  if (!unlockEl) {
    unlockEl = new Audio(SILENT_WAV)
    unlockEl.preload = 'auto'
  }
  void unlockEl.play().catch(() => {})
}

/** One shared AudioContext; must be (re)started from a user gesture on iOS. */
export function audioContext(): AudioContext {
  if (!ctx) {
    applyAudioSessionType()
    ctx = new AudioContext()
  }
  return ctx
}

/**
 * Tear down the shared context so the next call creates a fresh one.
 * iOS keeps the audio session in a ducked, receiver-routed "play-and-record"
 * state after a mic capture; closing the context and starting clean is the
 * reliable way back to full-volume media playback.
 */
export function resetAudioContext(): void {
  const old = ctx
  ctx = null
  void old?.close().catch(() => {})
}

/**
 * Recreate the context at the mic's native rate BEFORE recording begins.
 * Chrome's live capture resampler glitches audibly ("robotic" takes) when
 * the context rate doesn't match the input device — common right after a
 * Bluetooth/device switch. Safe here: nothing is playing yet on the record
 * screen, unlike the post-capture teardown window (see stop()).
 */
export function matchContextSampleRate(rate: number | undefined): void {
  if (!rate || !Number.isFinite(rate)) return
  if (ctx && ctx.sampleRate === rate) return
  const old = ctx
  ctx = null
  void old?.close().catch(() => {})
  applyAudioSessionType()
  try {
    ctx = new AudioContext({ sampleRate: rate })
  } catch {
    ctx = new AudioContext() // rate not supported — device default beats nothing
  }
}

/**
 * Call from (or shortly after) a user gesture before any playback. Resumes
 * the context and, on iOS, makes sure output is on the media channel so the
 * silent switch doesn't mute the app.
 */
export async function ensureRunning(): Promise<AudioContext> {
  const c = audioContext()
  applyAudioSessionType()
  unlockIosMediaChannel()
  if (c.state !== 'running') await c.resume()
  return c
}

/** Reported output latency in seconds (0 where the browser doesn't say). */
export function outputLatency(): number {
  const c = audioContext()
  return (c as AudioContext & { outputLatency?: number }).outputLatency || c.baseLatency || 0
}

// --- Pitch pipe -----------------------------------------------------------

/** Frequencies for the pipe: F3–E4 octave (barbershop tag keys). */
const A4 = 440
const SEMITONE_FROM_A4: Record<Key, number> = {
  F: -16, 'F#': -15, G: -14, 'A♭': -13, A: -12, 'B♭': -11,
  B: -10, C: -9, 'D♭': -8, D: -7, 'E♭': -6, E: -5,
}

export function keyFrequency(key: Key, octaveShift = 0): number {
  return A4 * Math.pow(2, (SEMITONE_FROM_A4[key] + 12 * octaveShift) / 12)
}

/** Blown-pipe timbre: two slightly detuned triangles + breath noise through a bandpass. */
export function playPitch(key: Key, octaveShift = 0, durationSec = 1.4): void {
  const c = audioContext()
  const t0 = c.currentTime + 0.02
  const f = keyFrequency(key, octaveShift)
  const out = c.createGain()
  out.gain.setValueAtTime(0, t0)
  out.gain.linearRampToValueAtTime(0.9, t0 + 0.06)
  out.gain.setValueAtTime(0.9, t0 + durationSec - 0.25)
  out.gain.linearRampToValueAtTime(0, t0 + durationSec)
  out.connect(c.destination)

  for (const detune of [-4, 4]) {
    const osc = c.createOscillator()
    osc.type = 'triangle'
    osc.frequency.value = f
    osc.detune.value = detune
    const g = c.createGain()
    g.gain.value = 0.5
    osc.connect(g).connect(out)
    osc.start(t0)
    osc.stop(t0 + durationSec)
  }
  // breath noise
  const len = Math.floor(c.sampleRate * durationSec)
  const buf = c.createBuffer(1, len, c.sampleRate)
  const d = buf.getChannelData(0)
  for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * 0.12
  const noise = c.createBufferSource()
  noise.buffer = buf
  const bp = c.createBiquadFilter()
  bp.type = 'bandpass'
  bp.frequency.value = f * 2
  bp.Q.value = 6
  noise.connect(bp).connect(out)
  noise.start(t0)
  noise.stop(t0 + durationSec)
}

// --- Count-in --------------------------------------------------------------

export const COUNT_IN_CLICKS = 4
export const CLICK_INTERVAL_SEC = 0.66 // ~91 bpm

/**
 * Schedule the count-in clicks. Returns the AudioContext time of the FIRST
 * click — that instant is the master timeline's t=0 (doc 04).
 */
export function scheduleCountIn(startInSec = 0.35): number {
  const c = audioContext()
  const first = c.currentTime + startInSec
  for (let i = 0; i < COUNT_IN_CLICKS; i++) {
    const t = first + i * CLICK_INTERVAL_SEC
    const osc = c.createOscillator()
    osc.type = 'square'
    osc.frequency.value = i === 0 ? 1568 : 1046 // downbeat rings higher
    const g = c.createGain()
    g.gain.setValueAtTime(0.75, t)
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.09)
    osc.connect(g).connect(c.destination)
    osc.start(t)
    osc.stop(t + 0.1)
  }
  return first
}

export const KEY_LIST = KEYS
