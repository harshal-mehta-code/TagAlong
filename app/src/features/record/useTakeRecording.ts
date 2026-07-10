import { useCallback, useEffect, useRef, useState, type MutableRefObject } from 'react'
import { COUNT_IN_CLICKS, CLICK_INTERVAL_SEC, audioContext, ensureRunning } from '../../engine/audio'
import { TakeRecorder, getCameraStream, type RecordingResult } from '../../engine/recorder'
import type { Take } from '../../types'

export type RecordStage = 'permission' | 'ready' | 'countin' | 'recording' | 'done' | 'error'
export const MAX_SING_MS = 60_000

export type GuideEls = MutableRefObject<Record<string, HTMLVideoElement | null>>

export interface TakeRecordingState {
  stage: RecordStage
  stream: MediaStream | null
  countdown: number | null
  elapsedMs: number
  result: RecordingResult | null
  error: string | null
  /** master-clock ms while recording (0 = first click), for waveform/cue UI */
  masterMs: number
}

/**
 * Drives one take recording. Guide parts are the <video> elements the record
 * screen renders (registered in `guideEls`): at begin() each is started so its
 * media hits (mediaOffset + nudge) exactly at master t=0, then drift-checked
 * once. Element playback works on every browser where Web Audio decoding of
 * video blobs does not (iOS Safari).
 */
export function useTakeRecording(guides: Take[], guideEls?: GuideEls) {
  const [state, setState] = useState<TakeRecordingState>({
    stage: 'permission', stream: null, countdown: null, elapsedMs: 0,
    result: null, error: null, masterMs: 0,
  })
  const recorderRef = useRef<TakeRecorder | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const rafRef = useRef(0)
  const guideTimersRef = useRef<number[]>([])
  const timesRef = useRef<{ t0: number; singStart: number } | null>(null)
  const stopGuardRef = useRef(false)

  const acquire = useCallback(async () => {
    try {
      const stream = await getCameraStream()
      streamRef.current = stream
      setState((s) => ({ ...s, stage: 'ready', stream, error: null }))
    } catch {
      setState((s) => ({
        ...s, stage: 'error',
        error: 'Camera and microphone access is required to sing. Check your browser permissions and try again.',
      }))
    }
  }, [])

  const releaseCamera = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop())
    streamRef.current = null
  }, [])

  const stopGuides = useCallback(() => {
    for (const id of guideTimersRef.current) clearTimeout(id)
    guideTimersRef.current = []
    if (guideEls) {
      for (const el of Object.values(guideEls.current)) el?.pause()
    }
  }, [guideEls])

  useEffect(() => {
    void acquire()
    return () => {
      cancelAnimationFrame(rafRef.current)
      recorderRef.current?.cancel()
      stopGuides()
      releaseCamera()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const stop = useCallback(async () => {
    if (stopGuardRef.current || !recorderRef.current) return
    stopGuardRef.current = true
    cancelAnimationFrame(rafRef.current)
    stopGuides()
    const result = await recorderRef.current.stop()
    recorderRef.current = null
    // free the camera so review playback isn't competing with a live capture
    releaseCamera()
    setState((s) => ({ ...s, stage: 'done', result, countdown: null, stream: null }))
  }, [stopGuides, releaseCamera])

  const startGuides = useCallback((t0CtxTime: number) => {
    if (!guideEls) return
    const c = audioContext()
    for (const g of guides) {
      const el = guideEls.current[g.takeId]
      if (!el) continue
      const offsetSec = (g.mediaOffsetMs + g.nudgeMs) / 1000
      const leadSec = t0CtxTime - c.currentTime // time until t=0 (~0.45s)
      const startAt = offsetSec - leadSec
      el.muted = false
      el.volume = 1
      if (startAt >= 0) {
        el.currentTime = startAt
        void el.play().catch(() => {})
      } else {
        el.currentTime = 0
        guideTimersRef.current.push(
          window.setTimeout(() => void el.play().catch(() => {}), -startAt * 1000),
        )
      }
    }
    // one drift check after playback settles; nudge covers the rest
    guideTimersRef.current.push(
      window.setTimeout(() => {
        const masterSec = c.currentTime - t0CtxTime
        for (const g of guides) {
          const el = guideEls.current[g.takeId]
          if (!el || el.paused) continue
          const expected = (g.mediaOffsetMs + g.nudgeMs) / 1000 + masterSec
          if (Math.abs(el.currentTime - expected) > 0.06) el.currentTime = expected
        }
      }, 1500),
    )
  }, [guides, guideEls])

  const begin = useCallback(async () => {
    if (!streamRef.current) return
    await ensureRunning()
    stopGuardRef.current = false
    const rec = new TakeRecorder(streamRef.current)
    recorderRef.current = rec
    const { t0CtxTime, singStartCtxTime } = await rec.start()
    timesRef.current = { t0: t0CtxTime, singStart: singStartCtxTime }
    startGuides(t0CtxTime)
    setState((s) => ({ ...s, stage: 'countin', countdown: COUNT_IN_CLICKS }))

    const tick = () => {
      const c = audioContext()
      const times = timesRef.current!
      const now = c.currentTime
      const masterMs = (now - times.t0) * 1000
      if (now < times.singStart) {
        const idx = Math.max(0, Math.floor((now - times.t0) / CLICK_INTERVAL_SEC))
        const remaining = now < times.t0 ? COUNT_IN_CLICKS : COUNT_IN_CLICKS - idx
        setState((s) => ({ ...s, stage: 'countin', countdown: remaining, masterMs }))
      } else {
        const elapsedMs = (now - times.singStart) * 1000
        if (elapsedMs >= MAX_SING_MS) { void stop(); return }
        setState((s) => ({ ...s, stage: 'recording', countdown: null, elapsedMs, masterMs }))
      }
      rafRef.current = requestAnimationFrame(tick)
    }
    rafRef.current = requestAnimationFrame(tick)
  }, [startGuides, stop])

  const reset = useCallback(() => {
    setState((s) => ({ ...s, stage: 'permission', result: null, elapsedMs: 0, countdown: null }))
    void acquire() // camera was released at stop(); grab it again for the retake
  }, [acquire])

  return { state, begin, stop, reset, retryPermission: acquire }
}
