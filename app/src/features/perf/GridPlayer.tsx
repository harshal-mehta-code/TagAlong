import { useEffect, useMemo, useRef, useState } from 'react'
import { useApp, useMediaUrl } from '../../appContext'
import { OpenSlot, PartTag } from '../../components/ui'
import { COUNT_IN_CLICKS, CLICK_INTERVAL_SEC, ensureRunning, outputLatency } from '../../engine/audio'
import { SyncController } from '../../player/SyncController'
import { StemMixer } from '../../player/StemMixer'
import { PART_COLOR, PART_LABEL, type PartId, type Take } from '../../types'

const COUNT_IN_MS = COUNT_IN_CLICKS * CLICK_INTERVAL_SEC * 1000
// start just past the last click's decay so count-in bleed isn't audible
const START_MS = Math.max(0, COUNT_IN_MS - 150)

/**
 * The performed collage. Videos are ALWAYS muted visuals slaved to the master
 * clock; every take's audio comes from its stem, mixed in one Web Audio graph
 * (StemMixer) — the only way multiple parts can sound together on iOS Safari.
 * Learning mode (solo / slow-down / loop) rides the same mixer.
 */
export function GridPlayer({
  parts, takesByPart, durationMs, onOpenSlot, quadrantOverlay, learn = true, cellHeight = 128,
}: {
  parts: PartId[]
  takesByPart: Partial<Record<PartId, Take>>
  durationMs: number
  onOpenSlot?: (part: PartId) => void
  /** rendered on each filled quadrant (e.g. swap-in button) when paused */
  quadrantOverlay?: (part: PartId, take: Take) => React.ReactNode
  learn?: boolean
  cellHeight?: number
}) {
  const { store } = useApp()
  const controller = useMemo(() => new SyncController(), [])
  const mixer = useMemo(() => new StemMixer(), [])
  const refs = useRef<Partial<Record<PartId, HTMLVideoElement | null>>>({})
  const [playing, setPlaying] = useState(false)
  const [solo, setSolo] = useState<PartId | null>(null)
  const [rate, setRate] = useState(1)
  const [loop, setLoop] = useState(false)
  const loopRef = useRef(loop)
  loopRef.current = loop
  const loadedRef = useRef(false)
  const fallbackIdsRef = useRef<Set<string>>(new Set())

  useEffect(() => () => { controller.destroy(); mixer.destroy() }, [controller, mixer])

  useEffect(() => {
    controller.onTick = (ms) => {
      if (ms >= durationMs + 300) {
        if (loopRef.current) {
          mixer.start(START_MS)
          controller.seek(START_MS)
        } else {
          controller.pause()
          mixer.pause()
          controller.seek(START_MS)
          mixer.seek(START_MS)
          setPlaying(false)
        }
      }
    }
  }, [controller, mixer, durationMs])

  const activeTakes = useMemo(
    () => parts.flatMap((p) => (takesByPart[p] ? [[p, takesByPart[p]!] as const] : [])),
    [parts, takesByPart],
  )

  const ensureLoaded = async () => {
    if (loadedRef.current) return
    const inputs = await Promise.all(
      activeTakes.map(async ([, take]) => ({
        id: take.takeId,
        nudgeMs: take.nudgeMs,
        stem: await store.getStem(take.takeId),
        media: await store.getMedia(take.takeId),
        mediaOffsetMs: take.mediaOffsetMs,
      })),
    )
    fallbackIdsRef.current = await mixer.load(inputs)
    loadedRef.current = true
  }

  const applyVideoAudio = (soloPart: PartId | null) => {
    // videos stay muted; a video is unmuted ONLY as a last-resort fallback
    // when its take's audio couldn't be decoded into the mixer
    for (const [p, take] of activeTakes) {
      const el = refs.current[p]
      if (!el) continue
      const isFallback = fallbackIdsRef.current.has(take.takeId)
      el.muted = !isFallback || (soloPart !== null && soloPart !== p)
    }
  }

  const toggle = async () => {
    if (playing) {
      controller.pause()
      mixer.pause()
      setPlaying(false)
      return
    }
    await ensureRunning()
    await ensureLoaded()
    const tracks = activeTakes.flatMap(([p, take]) => {
      const el = refs.current[p]
      return el ? [{ id: p as string, el, mediaOffsetMs: take.mediaOffsetMs, nudgeMs: take.nudgeMs }] : []
    })
    if (tracks.length === 0) return
    controller.setTracks(tracks)
    controller.setRate(rate)
    applyVideoAudio(solo)
    const resume = controller.masterMs > START_MS && controller.masterMs < durationMs
    const fromMs = resume ? controller.masterMs : START_MS
    // audio first: the mixer's AudioContext clock is the single master clock,
    // shifted by output latency so video shows what is currently AUDIBLE
    mixer.start(fromMs)
    controller.setClock(() => mixer.masterMs() - outputLatency() * 1000)
    await controller.play(fromMs)
    setPlaying(true)
  }

  const onSolo = (p: PartId) => {
    const next = solo === p ? null : p
    setSolo(next)
    const take = next ? takesByPart[next] : undefined
    mixer.setSolo(take ? take.takeId : null)
    applyVideoAudio(next)
  }

  const onRate = (r: number) => {
    setRate(r)
    controller.setRate(r)
    mixer.setRate(r)
  }

  const anyTake = activeTakes.length > 0

  return (
    <div>
      <div className="relative">
        <div className="grid grid-cols-2 gap-[3px] rounded-card overflow-hidden mx-auto">
          {parts.map((p) => {
            const take = takesByPart[p]
            return take ? (
              <div key={p} className="relative" style={{ height: cellHeight }}>
                <Cell take={take} setRef={(el) => { refs.current[p] = el }} />
                <PartTag part={p} />
                {!playing && quadrantOverlay?.(p, take)}
                {solo === p && (
                  <span className="absolute right-1.5 top-1.5 text-[9px] font-bold uppercase tracking-wider bg-ivory text-ink px-1.5 py-0.5 rounded-full z-10">solo</span>
                )}
              </div>
            ) : (
              <div key={p} className="grid" style={{ height: cellHeight }}>
                <OpenSlot part={p} onClick={onOpenSlot ? () => onOpenSlot(p) : undefined} />
              </div>
            )
          })}
        </div>
        {anyTake && (
          <button
            data-testid="grid-play"
            onClick={toggle}
            aria-label={playing ? 'Pause' : 'Play'}
            className="absolute inset-0 m-auto w-14 h-14 rounded-full bg-ivory/95 text-ink text-xl flex items-center justify-center shadow-xl z-20"
            style={playing ? { opacity: 0.25 } : undefined}
          >
            {playing ? '❚❚' : <span className="pl-1">▶</span>}
          </button>
        )}
      </div>

      {learn && anyTake && (
        <div className="mt-3 space-y-2">
          <div className="flex gap-1.5 flex-wrap">
            {parts.filter((p) => takesByPart[p]).map((p) => (
              <button
                key={p}
                data-testid={`solo-${p}`}
                onClick={() => onSolo(p)}
                className={`flex items-center gap-1.5 text-[11.5px] font-bold rounded-full px-2.5 py-1.5 border ${
                  solo === p ? 'text-white' : 'bg-transparent text-ink-soft border-line'
                }`}
                style={solo === p ? { background: PART_COLOR[p], borderColor: PART_COLOR[p] } : undefined}
              >
                <i className="w-2 h-2 rounded-full" style={{ background: solo === p ? '#fff' : PART_COLOR[p] }} />
                {solo === p ? `${PART_LABEL[p]} only` : PART_LABEL[p]}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-1.5 text-[11.5px] font-bold">
            {[1, 0.75, 0.5].map((r) => (
              <button key={r} onClick={() => onRate(r)}
                className={`rounded-full px-2.5 py-1.5 border tabular-nums ${rate === r ? 'bg-ink text-ivory border-ink' : 'text-ink-soft border-line'}`}>
                {r === 1 ? '1×' : r === 0.75 ? '¾×' : '½×'}
              </button>
            ))}
            <button onClick={() => setLoop(!loop)}
              className={`rounded-full px-2.5 py-1.5 border ${loop ? 'bg-ink text-ivory border-ink' : 'text-ink-soft border-line'}`}>
              Loop {loop ? 'on' : 'off'}
            </button>
            <span className="ml-auto text-[10px] font-semibold text-ink-soft uppercase tracking-wider">Learn mode</span>
          </div>
        </div>
      )}
    </div>
  )
}

function Cell({ take, setRef }: { take: Take; setRef: (el: HTMLVideoElement | null) => void }) {
  const url = useMediaUrl(take.takeId)
  return url ? (
    <video ref={setRef} src={url} muted playsInline preload="auto" className="w-full h-full object-cover bg-curtain" />
  ) : (
    <div className="w-full h-full bg-curtain" />
  )
}
