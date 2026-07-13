import { useEffect, useMemo, useRef, useState } from 'react'
import { useApp, useMediaUrl } from '../../appContext'
import { Button, Grid, PartTag } from '../../components/ui'
import { COUNT_IN_CLICKS, CLICK_INTERVAL_SEC } from '../../engine/audio'
import { clampNudgeMs } from '../../engine/offsets'
import type { RecordingResult } from '../../engine/recorder'
import { CollageAudio } from '../../player/premix'
import { SyncController } from '../../player/SyncController'
import { PART_COLOR, PART_LABEL, type PartId, type Take } from '../../types'

const COUNT_IN_MS = COUNT_IN_CLICKS * CLICK_INTERVAL_SEC * 1000

/**
 * Post-record review: looped synced playback of (your take + guides) with the
 * ±250 ms nudge slider. Audio is an offline premix of the stems played by one
 * <audio> element (CollageAudio); nudge moves re-render it, debounced. Videos
 * stay muted visuals slaved to the audio clock.
 */
export function SyncCheck({
  result, part, guides, parts, onSave, onRetake, onDiscard, saving,
}: {
  result: RecordingResult
  part: PartId
  guides: Take[]
  parts: PartId[]
  onSave: (nudgeMs: number) => void
  onRetake: () => void
  onDiscard?: () => void
  saving: boolean
}) {
  const { store } = useApp()
  const [nudge, setNudge] = useState(0)
  const [playing, setPlaying] = useState(false)
  const controller = useMemo(() => new SyncController(), [])
  const audio = useMemo(() => new CollageAudio(), [])
  const loadedRef = useRef(false)
  const fallbackIdsRef = useRef<Set<string>>(new Set())
  const userVideoRef = useRef<HTMLVideoElement>(null)
  const guideRefs = useRef<Record<string, HTMLVideoElement | null>>({})
  const nudgeTimerRef = useRef(0)
  const userUrl = useMemo(() => URL.createObjectURL(result.blob), [result.blob])

  // start just after the last click's decay so count-in bleed isn't audible
  const loopStartMs = Math.max(0, COUNT_IN_MS - 150)
  const loopEndMs = COUNT_IN_MS + Math.min(result.sungDurationMs, 20_000) // review loops first 20 s

  useEffect(() => () => URL.revokeObjectURL(userUrl), [userUrl])
  useEffect(() => () => {
    clearTimeout(nudgeTimerRef.current)
    controller.destroy()
    audio.destroy()
  }, [controller, audio])

  useEffect(() => {
    controller.onTick = (ms) => {
      if (ms > loopEndMs) {
        audio.seek(loopStartMs) // element keeps playing across a seek
        controller.seek(loopStartMs)
      }
    }
  }, [controller, audio, loopStartMs, loopEndMs])

  const ensureLoaded = async () => {
    if (loadedRef.current) return
    const inputs = [
      {
        id: 'user',
        nudgeMs: nudge,
        stem: result.stemBlob ?? undefined,
        media: result.blob,
        mediaOffsetMs: result.mediaOffsetMs,
      },
      ...(await Promise.all(
        guides.map(async (g) => ({
          id: g.takeId,
          nudgeMs: g.nudgeMs,
          stem: await store.getStem(g.takeId),
          media: await store.getMedia(g.takeId),
          mediaOffsetMs: g.mediaOffsetMs,
        })),
      )),
    ]
    fallbackIdsRef.current = await audio.load(inputs, loopEndMs)
    loadedRef.current = true
  }

  const togglePlay = async () => {
    if (playing) {
      controller.pause()
      audio.pause()
      setPlaying(false)
      return
    }
    await ensureLoaded()
    const userEl = userVideoRef.current!
    userEl.muted = !fallbackIdsRef.current.has('user')
    const tracks = [
      { id: 'user', el: userEl, mediaOffsetMs: result.mediaOffsetMs, nudgeMs: nudge },
      ...guides.flatMap((g) => {
        const el = guideRefs.current[g.takeId]
        if (!el) return []
        el.muted = !fallbackIdsRef.current.has(g.takeId)
        return [{ id: g.takeId, el, mediaOffsetMs: g.mediaOffsetMs, nudgeMs: g.nudgeMs }]
      }),
    ]
    controller.setTracks(tracks)
    await audio.play(loopStartMs)
    controller.setClock(() => audio.masterMs())
    await controller.play(loopStartMs)
    setPlaying(true)
  }

  const onNudge = (v: number) => {
    const clamped = clampNudgeMs(v)
    setNudge(clamped)
    controller.updateNudge('user', clamped)
    // re-rendering the mix is ~50 ms of DSP — debounce while the slider moves
    clearTimeout(nudgeTimerRef.current)
    nudgeTimerRef.current = window.setTimeout(() => {
      void audio.setNudge('user', clamped)
    }, 150)
  }

  const guideByPart = Object.fromEntries(guides.map((g) => [g.part, g]))

  return (
    <div className="flex-1 flex flex-col px-4 pt-2">
      <div className="relative">
        <Grid className="mx-auto w-full">
          {parts.map((p) =>
            p === part ? (
              <div key={p} className="relative h-[108px]" style={{ border: '2px solid #D64545' }}>
                <video ref={userVideoRef} src={userUrl} muted playsInline preload="auto"
                  className="w-full h-full object-cover [transform:scaleX(-1)] bg-curtain" />
                <span className="absolute left-1.5 bottom-1.5 text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-full text-white z-10"
                  style={{ background: PART_COLOR[p] }}>you</span>
              </div>
            ) : guideByPart[p] ? (
              <GuideCell key={p} take={guideByPart[p]}
                setRef={(el) => { guideRefs.current[guideByPart[p].takeId] = el }} />
            ) : (
              <div key={p} className="h-[108px] bg-curtain-card flex items-center justify-center text-[10px] font-bold uppercase tracking-widest text-[#776b85]">
                {PART_LABEL[p]} open
              </div>
            ),
          )}
        </Grid>
        <button
          data-testid="sync-play"
          onClick={togglePlay}
          aria-label={playing ? 'Pause' : 'Play'}
          className="absolute inset-0 m-auto w-14 h-14 rounded-full bg-ivory/95 text-ink text-xl flex items-center justify-center shadow-xl z-10"
        >
          {playing ? '❚❚' : <span className="pl-1">▶</span>}
        </button>
      </div>

      <div className="mt-5">
        <div className="flex justify-between text-[11px] font-bold text-[#A99FB6] mb-2">
          <span>Timing nudge</span>
          <span className="text-brass tabular-nums" data-testid="nudge-value">
            {nudge > 0 ? '+' : ''}{nudge} ms
          </span>
        </div>
        <input
          data-testid="nudge-slider"
          type="range" min={-250} max={250} step={5} value={nudge}
          onChange={(e) => onNudge(Number(e.target.value))}
          className="w-full"
        />
        <div className="flex justify-between text-[10px] font-semibold text-[#776b85] mt-1.5">
          <span>◂ Earlier</span><span>Later ▸</span>
        </div>
      </div>

      <div className="flex gap-2.5 mt-6">
        <Button kind="ghost-dark" onClick={onRetake} className="flex-1" testId="retake">Re-record</Button>
        <Button color="#5E8C6E" onClick={() => onSave(nudge)} disabled={saving} className="flex-[1.4]" testId="save-take">
          {saving ? 'Saving…' : 'Sounds locked ✓'}
        </Button>
      </div>
      {onDiscard && (
        <button
          data-testid="discard-take"
          onClick={() => { if (window.confirm('Discard this take? It won\'t be saved.')) onDiscard() }}
          className="text-center text-[12px] font-semibold text-[#776b85] underline underline-offset-2 mt-4 mb-6"
        >
          Discard take
        </button>
      )}
      {!onDiscard && <div className="mb-6" />}
    </div>
  )
}

function GuideCell({ take, setRef }: { take: Take; setRef: (el: HTMLVideoElement | null) => void }) {
  const url = useMediaUrl(take.takeId)
  return (
    <div className="relative h-[108px]">
      {url && (
        <video ref={setRef} src={url} muted playsInline preload="auto" className="w-full h-full object-cover bg-curtain" />
      )}
      <PartTag part={take.part} />
    </div>
  )
}
