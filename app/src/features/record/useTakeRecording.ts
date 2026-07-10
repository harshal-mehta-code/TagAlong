import { useCallback, useEffect, useRef, useState } from 'react'
import { COUNT_IN_CLICKS, CLICK_INTERVAL_SEC, audioContext, ensureRunning } from '../../engine/audio'
import { TakeRecorder, getCameraStream, type GuideClip, type RecordingResult } from '../../engine/recorder'

export type RecordStage = 'permission' | 'ready' | 'countin' | 'recording' | 'done' | 'error'
export const MAX_SING_MS = 60_000

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

export function useTakeRecording(guides: GuideClip[]) {
  const [state, setState] = useState<TakeRecordingState>({
    stage: 'permission', stream: null, countdown: null, elapsedMs: 0,
    result: null, error: null, masterMs: 0,
  })
  const recorderRef = useRef<TakeRecorder | null>(null)
  const rafRef = useRef(0)
  const timesRef = useRef<{ t0: number; singStart: number } | null>(null)
  const stopGuardRef = useRef(false)

  const acquire = useCallback(async () => {
    try {
      const stream = await getCameraStream()
      setState((s) => ({ ...s, stage: 'ready', stream, error: null }))
    } catch {
      setState((s) => ({
        ...s, stage: 'error',
        error: 'Camera and microphone access is required to sing. Check your browser permissions and try again.',
      }))
    }
  }, [])

  useEffect(() => {
    void acquire()
    return () => {
      cancelAnimationFrame(rafRef.current)
      recorderRef.current?.cancel()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // release camera when done/unmounted
  useEffect(() => {
    return () => { state.stream?.getTracks().forEach((t) => t.stop()) }
  }, [state.stream])

  const stop = useCallback(async () => {
    if (stopGuardRef.current || !recorderRef.current) return
    stopGuardRef.current = true
    cancelAnimationFrame(rafRef.current)
    const result = await recorderRef.current.stop()
    recorderRef.current = null
    setState((s) => ({ ...s, stage: 'done', result, countdown: null }))
  }, [])

  const begin = useCallback(async () => {
    if (!state.stream) return
    await ensureRunning()
    stopGuardRef.current = false
    const rec = new TakeRecorder(state.stream)
    recorderRef.current = rec
    const { t0CtxTime, singStartCtxTime } = await rec.start(guides)
    timesRef.current = { t0: t0CtxTime, singStart: singStartCtxTime }
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
  }, [state.stream, guides, stop])

  const reset = useCallback(() => {
    setState((s) => ({ ...s, stage: 'ready', result: null, elapsedMs: 0, countdown: null }))
  }, [])

  return { state, begin, stop, reset, retryPermission: acquire }
}
