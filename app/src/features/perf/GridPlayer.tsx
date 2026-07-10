import { useEffect, useMemo, useRef, useState } from 'react'
import { useMediaUrl } from '../../appContext'
import { OpenSlot, PartTag } from '../../components/ui'
import { COUNT_IN_CLICKS, CLICK_INTERVAL_SEC } from '../../engine/audio'
import { SyncController } from '../../player/SyncController'
import { PART_COLOR, PART_LABEL, type PartId, type Take } from '../../types'

const COUNT_IN_MS = COUNT_IN_CLICKS * CLICK_INTERVAL_SEC * 1000
const START_MS = Math.max(0, COUNT_IN_MS - 400)

/**
 * The performed collage: any subset of parts plays as one synchronized grid.
 * Learning mode is built in — per-part solo, slow-down, loop (doc 01).
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
  const controller = useMemo(() => new SyncController(), [])
  const refs = useRef<Partial<Record<PartId, HTMLVideoElement | null>>>({})
  const [playing, setPlaying] = useState(false)
  const [solo, setSolo] = useState<PartId | null>(null)
  const [rate, setRate] = useState(1)
  const [loop, setLoop] = useState(false)
  const loopRef = useRef(loop)
  loopRef.current = loop

  useEffect(() => () => controller.destroy(), [controller])

  useEffect(() => {
    controller.onTick = (ms) => {
      if (ms >= durationMs + 300) {
        if (loopRef.current) controller.seek(START_MS)
        else { controller.pause(); controller.seek(START_MS); setPlaying(false) }
      }
    }
  }, [controller, durationMs])

  const applyAudio = (soloPart: PartId | null) => {
    for (const p of parts) {
      const el = refs.current[p]
      if (el) el.muted = soloPart !== null && soloPart !== p
    }
  }

  const toggle = async () => {
    if (playing) { controller.pause(); setPlaying(false); return }
    const tracks = parts.flatMap((p) => {
      const take = takesByPart[p]
      const el = refs.current[p]
      return take && el
        ? [{ id: p as string, el, mediaOffsetMs: take.mediaOffsetMs, nudgeMs: take.nudgeMs }]
        : []
    })
    if (tracks.length === 0) return
    controller.setTracks(tracks)
    controller.setRate(rate)
    applyAudio(solo)
    await controller.play(controller.masterMs > START_MS && controller.masterMs < durationMs ? undefined : START_MS)
    setPlaying(true)
  }

  const onSolo = (p: PartId) => {
    const next = solo === p ? null : p
    setSolo(next)
    applyAudio(next)
  }

  const onRate = (r: number) => {
    setRate(r)
    controller.setRate(r)
  }

  const anyTake = parts.some((p) => takesByPart[p])

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
    <video ref={setRef} src={url} playsInline preload="auto" className="w-full h-full object-cover bg-curtain" />
  ) : (
    <div className="w-full h-full bg-curtain" />
  )
}
