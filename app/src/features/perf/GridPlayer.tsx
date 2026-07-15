import { useEffect, useMemo, useRef, useState } from 'react'
import { useApp, useMediaUrl } from '../../appContext'
import { OpenSlot, PartTag } from '../../components/ui'
import { COUNT_IN_CLICKS, CLICK_INTERVAL_SEC } from '../../engine/audio'
import { SyncController } from '../../player/SyncController'
import { CollageAudio, PremixEngine } from '../../player/premix'
import { canPrerender, renderPerformanceMp4 } from '../../player/prerender'
import { PART_COLOR, PART_LABEL, type PartId, type Take } from '../../types'

const COUNT_IN_MS = COUNT_IN_CLICKS * CLICK_INTERVAL_SEC * 1000
// start just past the last click's decay so count-in bleed isn't audible
const START_MS = Math.max(0, COUNT_IN_MS - 150)
// end pad matches the live path's stop point (durationMs + 300)
const END_PAD_MS = 300

/**
 * The performed collage.
 *
 * Default watch path: the whole grid (video + mixed audio) is pre-rendered
 * into ONE mp4 played by a single native <video> — A/V sync is the
 * container's job, deterministic on every browser, and it is the one unmuted
 * media element iOS allows. The render happens in the background and is
 * cached in IndexedDB.
 *
 * Live path (fallback + learn mode): offline-premixed audio in one <audio>
 * element (CollageAudio) with muted per-take videos slaved to its clock.
 * Used while a render isn't ready, where WebCodecs can't encode (Firefox,
 * desktop Linux), and whenever a part is soloed.
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
  const audio = useMemo(() => new CollageAudio(), [])
  const refs = useRef<Partial<Record<PartId, HTMLVideoElement | null>>>({})
  const [playing, setPlaying] = useState(false)
  const [solo, setSolo] = useState<PartId | null>(null)
  const [rate, setRate] = useState(1)
  const [loop, setLoop] = useState(false)
  const loopRef = useRef(loop)
  loopRef.current = loop
  const fallbackIdsRef = useRef<Set<string>>(new Set())
  const [renderUrl, setRenderUrl] = useState<string | null>(null)
  const [rendering, setRendering] = useState(false)
  const renderVideoRef = useRef<HTMLVideoElement | null>(null)
  const renderPlayingRef = useRef(false)

  useEffect(() => () => { controller.destroy(); audio.destroy() }, [controller, audio])

  useEffect(() => {
    controller.onTick = (ms) => {
      if (ms >= durationMs + 300) {
        if (loopRef.current) {
          audio.seek(START_MS) // element keeps playing across a seek — no play() needed
          controller.seek(START_MS)
        } else {
          controller.pause()
          audio.pause()
          controller.seek(START_MS)
          audio.seek(START_MS)
          setPlaying(false)
        }
      }
    }
  }, [controller, audio, durationMs])

  const activeTakes = useMemo(
    () => parts.flatMap((p) => (takesByPart[p] ? [[p, takesByPart[p]!] as const] : [])),
    [parts, takesByPart],
  )

  // fingerprint of everything the mp4 render depends on — a change means the
  // cached render is stale (bump v1 when the renderer itself changes)
  const renderKey = useMemo(() => {
    const slotSig = parts
      .map((p) => {
        const t = takesByPart[p]
        return t ? `${t.takeId}@${t.mediaOffsetMs + t.nudgeMs}` : '-'
      })
      .join('|')
    return `v1|${slotSig}|${durationMs}`
  }, [parts, takesByPart, durationMs])

  // background pre-render: cache hit shows instantly; a miss renders while
  // the live path stays usable, then swaps in for the next play
  useEffect(() => {
    let cancelled = false
    let url: string | null = null
    setRenderUrl(null)
    if (activeTakes.length === 0) return
    const setKey = activeTakes.map(([, t]) => t.takeId).sort().join('|')
    void (async () => {
      try {
        if (!(await canPrerender())) return
        const cached = await store.getRender(setKey)
        if (cancelled) return
        if (cached && cached.key === renderKey) {
          url = URL.createObjectURL(cached.blob)
          setRenderUrl(url)
          return
        }
        setRendering(true)
        const engine = new PremixEngine()
        const inputs = await Promise.all(
          activeTakes.map(async ([, take]) => ({
            id: take.takeId,
            nudgeMs: take.nudgeMs,
            stem: await store.getStem(take.takeId),
            media: await store.getMedia(take.takeId),
            mediaOffsetMs: take.mediaOffsetMs,
          })),
        )
        const failed = await engine.prepare(inputs)
        if (failed.size > 0 || cancelled) return // live path handles undecodable audio
        const premix = await engine.renderBuffer(durationMs)
        const slots = await Promise.all(
          parts.map(async (p) => {
            const take = takesByPart[p]
            if (!take) return null
            const media = await store.getMedia(take.takeId)
            if (!media) throw new Error('media missing')
            return { media, skewMs: take.mediaOffsetMs + take.nudgeMs }
          }),
        )
        if (cancelled) return
        const blob = await renderPerformanceMp4({
          slots,
          premix,
          startMs: START_MS,
          endMs: durationMs + END_PAD_MS,
          cancelled: () => cancelled,
        })
        if (!blob || cancelled) return
        await store.putRender(setKey, renderKey, activeTakes.map(([, t]) => t.takeId), blob)
        url = URL.createObjectURL(blob)
        setRenderUrl(url)
      } catch (err) {
        // the render is an upgrade — the live path keeps working without it
        console.warn('collage pre-render failed; using live playback', err)
      } finally {
        if (!cancelled) setRendering(false)
      }
    })()
    return () => {
      cancelled = true
      if (url) URL.revokeObjectURL(url)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [renderKey, store])

  // the rendered mp4 is the default watch path; solo needs the live mix
  const usingRender = renderUrl !== null && solo === null

  // CollageAudio.load is keyed on take ids + nudges: picking a different
  // take re-renders the mix instead of silently reusing the old one
  const ensureLoaded = async () => {
    const inputs = await Promise.all(
      activeTakes.map(async ([, take]) => ({
        id: take.takeId,
        nudgeMs: take.nudgeMs,
        stem: await store.getStem(take.takeId),
        media: await store.getMedia(take.takeId),
        mediaOffsetMs: take.mediaOffsetMs,
      })),
    )
    fallbackIdsRef.current = await audio.load(inputs, durationMs)
  }

  const applyVideoAudio = (soloPart: PartId | null) => {
    // videos stay muted; a video is unmuted ONLY as a last-resort fallback
    // when its take's audio couldn't be decoded into the premix
    for (const [p, take] of activeTakes) {
      const el = refs.current[p]
      if (!el) continue
      const isFallback = fallbackIdsRef.current.has(take.takeId)
      el.muted = !isFallback || (soloPart !== null && soloPart !== p)
    }
  }

  const stopAll = () => {
    if (renderPlayingRef.current) {
      renderVideoRef.current?.pause()
      renderPlayingRef.current = false
    } else {
      controller.pause()
      audio.pause()
    }
    setPlaying(false)
  }

  const toggle = async () => {
    if (playing) {
      stopAll()
      return
    }
    if (usingRender && renderVideoRef.current) {
      const v = renderVideoRef.current
      if (v.ended) v.currentTime = 0
      v.loop = loopRef.current
      v.playbackRate = rate
      ;(v as HTMLVideoElement & { preservesPitch?: boolean }).preservesPitch = true
      await v.play().catch(() => { /* user will tap again */ })
      renderPlayingRef.current = true
      setPlaying(true)
      return
    }
    renderPlayingRef.current = false
    await ensureLoaded()
    const tracks = activeTakes.flatMap(([p, take]) => {
      const el = refs.current[p]
      return el ? [{ id: p as string, el, mediaOffsetMs: take.mediaOffsetMs, nudgeMs: take.nudgeMs }] : []
    })
    if (tracks.length === 0) return
    controller.setTracks(tracks)
    controller.setRate(rate)
    applyVideoAudio(solo)
    const pos = audio.masterMs()
    const fromMs = pos > START_MS && pos < durationMs ? pos : START_MS
    // videos first: decoded and parked on their start frames, THEN the audio
    // gun — otherwise they join the running audio late and get yanked in
    await controller.preroll(fromMs)
    await audio.play(fromMs)
    controller.setClock(() => audio.masterMs())
    await controller.play(fromMs)
    setPlaying(true)
  }

  const onSolo = (p: PartId) => {
    const next = solo === p ? null : p
    // solo switches between the rendered and live paths — never mid-play
    if (playing) stopAll()
    setSolo(next)
    const take = next ? takesByPart[next] : undefined
    void audio.setSolo(take ? take.takeId : null)
    applyVideoAudio(next)
  }

  const onRate = (r: number) => {
    setRate(r)
    controller.setRate(r)
    audio.setRate(r)
    const v = renderVideoRef.current
    if (v) {
      v.playbackRate = r
      ;(v as HTMLVideoElement & { preservesPitch?: boolean }).preservesPitch = true
    }
  }

  // keep the mp4's native loop flag in step with the Loop toggle mid-play
  useEffect(() => {
    if (renderVideoRef.current) renderVideoRef.current.loop = loop
  }, [loop])

  const anyTake = activeTakes.length > 0

  return (
    <div>
      <div className="relative">
        {renderUrl && (
          <video
            ref={renderVideoRef}
            data-testid="grid-render-video"
            src={renderUrl}
            playsInline
            preload="auto"
            onEnded={() => { renderPlayingRef.current = false; setPlaying(false) }}
            className="absolute inset-0 w-full h-full object-cover rounded-card z-0"
          />
        )}
        <div className="relative z-10 grid grid-cols-2 gap-[3px] rounded-card overflow-hidden mx-auto">
          {parts.map((p) => {
            const take = takesByPart[p]
            return take ? (
              <div key={p} className="relative" style={{ height: cellHeight }}>
                <Cell take={take} transparent={usingRender} setRef={(el) => { refs.current[p] = el }} />
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
      {rendering && !renderUrl && (
        <div className="text-center text-[9.5px] font-semibold uppercase tracking-wider text-ink-soft mt-1.5">
          sharpening the final mix…
        </div>
      )}

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

function Cell({ take, setRef, transparent }: {
  take: Take
  setRef: (el: HTMLVideoElement | null) => void
  /** rendered-mp4 mode: keep the element mounted for the live fallback, but let the mp4 show through */
  transparent?: boolean
}) {
  const url = useMediaUrl(take.takeId)
  return url ? (
    <video
      ref={setRef}
      src={url}
      muted
      playsInline
      preload="auto"
      className={`w-full h-full object-cover ${transparent ? 'invisible' : 'bg-curtain'}`}
    />
  ) : (
    <div className={`w-full h-full ${transparent ? '' : 'bg-curtain'}`} />
  )
}
