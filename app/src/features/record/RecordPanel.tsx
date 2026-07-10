import { useEffect, useRef } from 'react'
import type { GuideEls, TakeRecordingState } from './useTakeRecording'
import { MAX_SING_MS } from './useTakeRecording'
import { ensureRunning, playPitch } from '../../engine/audio'
import { useMediaUrl } from '../../appContext'
import { PART_COLOR, PART_LABEL, type Key, type PartId, type Take } from '../../types'
import { Button, PartTag } from '../../components/ui'

function fmt(ms: number): string {
  const s = Math.floor(ms / 1000)
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

/**
 * The live recording surface. Solo starts show the camera big; joins show the
 * quartet grid — your camera in your quadrant, the guide parts playing in
 * theirs, so you get their faces and voices as cues while you sing.
 */
export function RecordPanel({
  state, part, parts, guides, guideEls, pitchKey, octaveShift = 0,
  onBegin, onStop, onRetryPermission,
}: {
  state: TakeRecordingState
  part: PartId
  parts: PartId[]
  guides: Take[]
  guideEls: GuideEls
  pitchKey: Key
  octaveShift?: number
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
  const guideByPart = Object.fromEntries(guides.map((g) => [g.part, g])) as Record<PartId, Take>

  const cameraCell = (
    <>
      {state.stage === 'error' ? (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 px-6 text-center">
          <p className="text-[12.5px] text-[#A99FB6] leading-relaxed">{state.error}</p>
          <Button kind="ghost-dark" onClick={onRetryPermission} className="!w-auto px-5 !py-2 !text-[13px]">Try again</Button>
        </div>
      ) : (
        <video ref={videoRef} muted playsInline className="w-full h-full object-cover [transform:scaleX(-1)]" />
      )}
      <span
        className="absolute left-1.5 bottom-1.5 text-[9px] font-bold uppercase tracking-wider text-white px-1.5 py-0.5 rounded-full z-10"
        style={{ background: PART_COLOR[part] }}
      >
        {PART_LABEL[part]} · you
      </span>
    </>
  )

  return (
    <div className="flex-1 flex flex-col px-4 relative">
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

      <div className="relative">
        {guides.length > 0 ? (
          <div className="grid grid-cols-2 gap-[3px] rounded-card overflow-hidden">
            {parts.map((p) =>
              p === part ? (
                <div key={p} className="relative h-[152px] bg-curtain"
                  style={{ border: live ? '2px solid #D64545' : '2px solid #3A2C4C' }}>
                  {cameraCell}
                </div>
              ) : guideByPart[p] ? (
                <GuideRecCell key={p} take={guideByPart[p]}
                  setRef={(el) => { guideEls.current[guideByPart[p].takeId] = el }} />
              ) : (
                <div key={p} className="h-[152px] bg-curtain-card flex items-center justify-center text-[10px] font-bold uppercase tracking-widest text-[#776b85]">
                  {PART_LABEL[p]} open
                </div>
              ),
            )}
          </div>
        ) : (
          <div
            className="relative rounded-card overflow-hidden bg-curtain aspect-[3/4] max-h-[44vh] mx-auto w-full"
            style={{ border: live ? '2px solid #D64545' : '2px solid #3A2C4C' }}
          >
            {cameraCell}
          </div>
        )}

        {/* on-demand pitch pipe — available any time before the take starts */}
        {state.stage === 'ready' && (
          <button
            data-testid="record-pitch-pipe"
            onClick={async () => { await ensureRunning(); playPitch(pitchKey, octaveShift) }}
            aria-label={`Play pitch ${pitchKey}`}
            className="absolute right-2 top-2 z-20 w-[54px] h-[54px] rounded-full flex flex-col items-center justify-center text-[#2e2410] active:scale-95 transition-transform
              bg-[radial-gradient(circle_at_34%_28%,#E3C685,#C79A3D_52%,#8a6a24)]
              shadow-[0_6px_18px_rgba(0,0,0,.45),inset_0_-3px_8px_rgba(80,58,10,.45)]"
          >
            <span className="font-serif text-[17px] font-bold leading-none">{pitchKey}</span>
            <span className="text-[6.5px] font-bold uppercase tracking-[.1em] mt-0.5">pitch</span>
          </button>
        )}
      </div>

      {state.stage === 'countin' && state.countdown !== null && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-30">
          <span data-testid="countin" className="font-serif text-[92px] text-ivory/95 drop-shadow-[0_4px_24px_rgba(0,0,0,.6)]">
            {state.countdown}
          </span>
        </div>
      )}

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
        {guides.length > 0
          ? '🎧 The other parts play in your ears — pipe, four clicks, then sing'
          : '🎧 Tap the pipe for your pitch — four clicks count you in'}
      </p>
    </div>
  )
}

function GuideRecCell({ take, setRef }: { take: Take; setRef: (el: HTMLVideoElement | null) => void }) {
  const url = useMediaUrl(take.takeId)
  return (
    <div className="relative h-[152px] bg-curtain">
      {url && (
        <video ref={setRef} src={url} playsInline preload="auto" className="w-full h-full object-cover" />
      )}
      <PartTag part={take.part} />
    </div>
  )
}
