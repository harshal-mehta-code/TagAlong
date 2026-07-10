import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useApp } from '../../appContext'
import { KeyChip, Screen } from '../../components/ui'
import { PART_COLOR, PART_LABEL, type PartId, type Performance, type Tag, type Take } from '../../types'
import { GridPlayer } from './GridPlayer'

export default function PerformanceScreen() {
  const { perfId } = useParams<{ perfId: string }>()
  const { store, profile } = useApp()
  const nav = useNavigate()
  const [perf, setPerf] = useState<Performance | null>(null)
  const [tag, setTag] = useState<Tag | null>(null)
  const [takes, setTakes] = useState<Take[]>([])
  const [siblings, setSiblings] = useState(0)
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    let alive = true
    ;(async () => {
      if (!perfId) return
      const p = await store.getPerformance(perfId)
      if (!p) { if (alive) setLoaded(true); return }
      const [t, ks, sibs] = await Promise.all([
        store.getTag(p.tagId),
        store.listTakes(p.tagId),
        store.listPerformances(p.tagId),
      ])
      if (!alive) return
      setPerf(p)
      setTag(t ?? null)
      setTakes(ks)
      setSiblings(sibs.length)
      setLoaded(true)
    })()
    return () => { alive = false }
  }, [store, perfId])

  const takesByPart = useMemo(() => {
    const out: Partial<Record<PartId, Take>> = {}
    if (!perf) return out
    for (const [part, id] of Object.entries(perf.takeIds) as [PartId, string][]) {
      const t = takes.find((k) => k.takeId === id)
      if (t) out[part] = t
    }
    return out
  }, [perf, takes])

  if (!loaded) return <Screen><div /></Screen>
  if (!perf || !tag) {
    return (
      <Screen>
        <div className="flex-1 flex items-center justify-center text-ink-soft text-sm">Performance not found.</div>
      </Screen>
    )
  }

  const singers = [...new Set(Object.values(takesByPart).map((t) => t!.displayName))]

  return (
    <Screen>
      <header className="flex items-center justify-between px-5 pt-[max(env(safe-area-inset-top),16px)] pb-1">
        <button onClick={() => nav(-1)} className="text-xl w-8 text-left" aria-label="Back">‹</button>
        <span className="text-[11px] font-bold uppercase tracking-widest text-ink-soft">Performance</span>
        <span className="w-8" />
      </header>

      <div className="px-4">
        <GridPlayer
          parts={tag.parts}
          takesByPart={takesByPart}
          durationMs={tag.durationMs}
          cellHeight={148}
          quadrantOverlay={(p) => (
            <button
              data-testid={`swap-${p}`}
              onClick={() => nav(`/join/${tag.tagId}/${p}?combo=${Object.entries(perf.takeIds).filter(([pp]) => pp !== p).map(([, id]) => id).join(',')}`)}
              className="absolute right-1.5 top-1.5 z-10 text-[9.5px] font-bold text-white px-2 py-1 rounded-full bg-black/45 backdrop-blur-sm"
            >
              Sing this part ↻
            </button>
          )}
        />
      </div>

      <div className="px-5 pt-3">
        <h2 className="font-serif text-[21px] font-semibold">{tag.title}</h2>
        <div className="flex items-center gap-1.5 text-[12px] font-semibold text-ink-soft mt-0.5 flex-wrap">
          <KeyChip k={tag.key} />
          <span>{tag.voicing.toUpperCase()}</span>
          <span>·</span>
          <span>{singers.join(' · ')}</span>
        </div>

        <div className="flex items-center gap-3 mt-4">
          <LikeButton perf={perf} uid={profile?.uid} />
          <button
            onClick={() => nav(`/t/${tag.tagId}`)}
            className="text-[13px] font-semibold text-ink-soft border border-line rounded-full px-4 py-2"
            data-testid="see-tag"
          >
            {siblings > 1 ? `${siblings} performances of this tag →` : 'View tag →'}
          </button>
        </div>

        <div className="mt-5 bg-white border border-[#EFE9DC] rounded-card p-4">
          <div className="text-[10.5px] font-bold uppercase tracking-widest text-brass mb-1.5">Who's in it</div>
          {tag.parts.flatMap((p) => {
            const t = takesByPart[p]
            return t ? [[p, t] as [PartId, Take]] : []
          }).map(([p, t]) => (
            <div key={p} className="flex items-center gap-2.5 py-1.5 text-[13.5px]">
              <i className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: PART_COLOR[p] }} />
              <span className="font-semibold w-14" style={{ color: PART_COLOR[p] }}>{PART_LABEL[p]}</span>
              <span className="text-ink font-medium">{t.displayName}</span>
            </div>
          ))}
        </div>
      </div>
      <div className="pb-6" />
    </Screen>
  )
}

function LikeButton({ perf, uid }: { perf: Performance; uid?: string }) {
  const { store } = useApp()
  const [likes, setLikes] = useState(perf.likeCount)
  return (
    <button
      data-testid="perf-like"
      onClick={async () => {
        if (!uid) return
        const updated = await store.toggleLike(perf.perfId, uid)
        if (updated) setLikes(updated.likeCount)
      }}
      className="text-[13px] font-bold text-white bg-lead rounded-full px-4 py-2"
    >
      ♥ {likes}
    </button>
  )
}
