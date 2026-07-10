import { useCallback, useEffect, useMemo, useRef, useState, type MutableRefObject } from 'react'
import { useApp } from '../../appContext'
import { COUNT_IN_CLICKS, CLICK_INTERVAL_SEC, audioContext, ensureRunning } from '../../engine/audio'
import { TakeRecorder, getCameraStream, type RecordingResult } from '../../engine/recorder'
import { StemMixer } from '../../player/StemMixer'
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
 * Drives one take recording. Guide AUDIO plays through the StemMixer,
 * scheduled sample-accurately so master t=0 lands exactly on the first
 * count-in click (with output-latency compensation). Guide VIDEOS — the
 * elements the record screen renders into `guideEls` — are muted visuals
 * slaved to the same timeline. The split is mandatory on iOS Safari, where
 * only one unmuted media element can produce sound.
 */
export function useTakeRecording(guides: Take[], guideEls?: GuideEls) {
  const { store } = useApp()
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
  const mixer = useMemo(() => new StemMixer(), [])
  const mixerLoadedRef = useRef<Promise<void> | null>(null)

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
    mixer.pause()
    if (guideEls) {
      for (const el of Object.values(guideEls.current)) el?.pause()
    }
  }, [guideEls, mixer])

  // preload guide stems so begin() starts instantly
  useEffect(() => {
    if (guides.length === 0) return
    mixerLoadedRef.current = (async () => {
      await mixer.load(
        await Promise.all(
          guides.map(async (g) => ({
            id: g.takeId,
            nudgeMs: g.nudgeMs,
            stem: await store.getStem(g.takeId),
            media: await store.getMedia(g.takeId),
            mediaOffsetMs: g.mediaOffsetMs,
          })),
        ),
      )
    })()
  }, [guides, mixer, store])

  useEffect(() => {
    void acquire()
    return () => {
      cancelAnimationFrame(rafRef.current)
      recorderRef.current?.cancel()
      stopGuides()
      mixer.destroy()
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

  const startGuideVideos = useCallback((t0CtxTime: number) => {
    if (!guideEls) return
    const c = audioContext()
    for (const g of guides) {
      const el = guideEls.current[g.takeId]
      if (!el) continue
      el.muted = true // audio comes from the mixer, never the element
      const offsetSec = (g.mediaOffsetMs + g.nudgeMs) / 1000
      const leadSec = t0CtxTime - c.currentTime // time until t=0 (~0.45s)
      const startAt = offsetSec - leadSec
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
    // one visual drift check after playback settles
    guideTimersRef.current.push(
      window.setTimeout(() => {
        const masterSec = c.currentTime - t0CtxTime
        for (const g of guides) {
          const el = guideEls.current[g.takeId]
          if (!el || el.paused) continue
          const expected = (g.mediaOffsetMs + g.nudgeMs) / 1000 + masterSec
          if (Math.abs(el.currentTime - expected) > 0.08) el.currentTime = expected
        }
      }, 1500),
    )
  }, [guides, guideEls])

  const begin = useCallback(async () => {
    if (!streamRef.current) return
    await ensureRunning()
    if (mixerLoadedRef.current) await mixerLoadedRef.current
    stopGuardRef.current = false
    const rec = new TakeRecorder(streamRef.current)
    recorderRef.current = rec
    const { t0CtxTime, singStartCtxTime } = await rec.start()
    timesRef.current = { t0: t0CtxTime, singStart: singStartCtxTime }
    if (guides.length > 0) mixer.startAtT0(t0CtxTime) // sample-accurate guide audio
    startGuideVideos(t0CtxTime)
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
  }, [guides.length, mixer, startGuideVideos, stop])

  const reset = useCallback(() => {
    setState((s) => ({ ...s, stage: 'permission', result: null, elapsedMs: 0, countdown: null }))
    void acquire() // camera was released at stop(); grab it again for the retake
  }, [acquire])

  return { state, begin, stop, reset, retryPermission: acquire }
}
