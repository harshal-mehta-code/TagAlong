import { useEffect, useRef } from 'react'
import type { TakeRecordingState } from './useTakeRecording'
import { MAX_SING_MS } from './useTakeRecording'
import { PART_COLOR, PART_LABEL, type PartId } from '../../types'
import { Button } from '../../components/ui'

function fmt(ms: number): string {
  const s = Math.floor(ms / 1000)
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

/**
 * The live recording surface: camera preview in the singer's quadrant style,
 * count-in overlay, REC state. Shared by Start and Join flows.
 */
export function RecordPanel({
  state, part, onBegin, onStop, onRetryPermission,
}: {
  state: TakeRecordingState
  part: PartId
  onBegin: () => void
  onStop: () => void
  onRetryPermission: () => void
}) {
  const videoRef = useRef<HTMLVideoElement>(null)

  useEffect(() => {
    if (videoRef.current && state.stream) {
      videoRef.current.srcObject = state.stream
      void videoRef.current.play().catch(() => {})
    }
  }, [state.stream])

  const live = state.stage === 'countin' || state.stage === 'recording'

  return (
    <div className="flex-1 flex flex-col px-4">
      <div className="flex items-center justify-between px-2 py-2 text-[12.5px] font-bold text-[#A99FB6] tabular-nums">
        <span>
          {state.stage === 'recording' && (
            <span className="text-[#F0EAE0]">
              <i className="inline-block w-2.5 h-2.5 rounded-full bg-record mr-1.5 align-baseline animate-pulse-slot" />
              REC {fmt(state.elapsedMs)}
            </span>
          )}
          {state.stage === 'countin' && <span className="text-brass">Count-in…</span>}
          {state.stage === 'ready' && 'Ready'}
        </span>
        <span>max {fmt(MAX_SING_MS)}</span>
      </div>

      <div
        className="relative rounded-card overflow-hidden bg-curtain aspect-[3/4] max-h-[46vh] mx-auto w-full"
        style={{ border: live ? '2px solid #D64545' : '2px solid #3A2C4C' }}
      >
        {state.stage === 'error' ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 px-8 text-center">
            <p className="text-[13.5px] text-[#A99FB6] leading-relaxed">{state.error}</p>
            <Button kind="ghost-dark" onClick={onRetryPermission} className="!w-auto px-6">Try again</Button>
          </div>
        ) : (
          <video ref={videoRef} muted playsInline className="w-full h-full object-cover [transform:scaleX(-1)]" />
        )}
        <span
          className="absolute left-2 bottom-2 text-[10px] font-bold uppercase tracking-wider text-white px-2 py-0.5 rounded-full"
          style={{ background: PART_COLOR[part] }}
        >
          {PART_LABEL[part]} · you
        </span>
        {state.stage === 'countin' && state.countdown !== null && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <span data-testid="countin" className="font-serif text-[92px] text-ivory/95 drop-shadow-[0_4px_24px_rgba(0,0,0,.5)]">
              {state.countdown}
            </span>
          </div>
        )}
      </div>

      <div className="text-center mt-5 mb-2">
        {state.stage === 'ready' && (
          <button data-testid="record-button" onClick={onBegin} aria-label="Start recording"
            className="w-[76px] h-[76px] rounded-full border-4 border-[#F0EAE0]/85 inline-flex items-center justify-center active:opacity-70">
            <i className="w-[58px] h-[58px] rounded-full bg-record" />
          </button>
        )}
        {live && (
          <button data-testid="stop-button" onClick={onStop} aria-label="Stop recording"
            className="w-[76px] h-[76px] rounded-full border-4 border-[#F0EAE0]/85 inline-flex items-center justify-center active:opacity-70">
            <i className="w-[30px] h-[30px] rounded-lg bg-record" />
          </button>
        )}
      </div>
      <p className="text-center text-[11px] font-semibold text-[#A99FB6] mb-4">
        🎧 Wear headphones — you'll hear the pitch, four clicks, then sing
      </p>
    </div>
  )
}
