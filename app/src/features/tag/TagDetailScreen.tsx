import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useApp } from '../../appContext'
import { Button, KeyChip, Screen } from '../../components/ui'
import { PART_COLOR, PART_LABEL, type PartId, type Tag, type Take } from '../../types'
import { GridPlayer } from '../perf/GridPlayer'

/**
 * One tag: the current combination plays big; every part offers its takes
 * (swipe through alternates); open parts carry the join CTA.
 */
export default function TagDetailScreen() {
  const { tagId } = useParams<{ tagId: string }>()
  const { store } = useApp()
  const nav = useNavigate()
  const [tag, setTag] = useState<Tag | null>(null)
  const [takes, setTakes] = useState<Take[]>([])
  const [selected, setSelected] = useState<Partial<Record<PartId, string>>>({})
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    let alive = true
    ;(async () => {
      if (!tagId) return
      const t = await store.getTag(tagId)
      const ks = await store.listTakes(tagId)
      if (!alive) return
      setTag(t ?? null)
      setTakes(ks)
      const sel: Partial<Record<PartId, string>> = {}
      for (const k of ks) if (!sel[k.part]) sel[k.part] = k.takeId
      setSelected(sel)
      setLoaded(true)
    })()
    return () => { alive = false }
  }, [store, tagId])

  const takesByPart = useMemo(() => {
    const map: Partial<Record<PartId, Take[]>> = {}
    for (const k of takes) (map[k.part] = map[k.part] ?? []).push(k)
    return map
  }, [takes])

  const selectedTakes = useMemo(() => {
    const out: Partial<Record<PartId, Take>> = {}
    for (const [part, id] of Object.entries(selected) as [PartId, string][]) {
      const t = takes.find((k) => k.takeId === id)
      if (t) out[part] = t
    }
    return out
  }, [selected, takes])

  if (!loaded) return <Screen><div /></Screen>
  if (!tag) {
    return (
      <Screen>
        <div className="flex-1 flex items-center justify-center text-ink-soft text-sm">Tag not found.</div>
      </Screen>
    )
  }

  const openParts = tag.parts.filter((p) => !(takesByPart[p]?.length))
  const comboParam = Object.values(selected).join(',')

  return (
    <Screen>
      <header className="flex items-center justify-between px-5 pt-[max(env(safe-area-inset-top),16px)] pb-1">
        <button onClick={() => nav(-1)} className="text-xl w-8 text-left" aria-label="Back">‹</button>
        <span className="text-[11px] font-bold uppercase tracking-widest text-ink-soft">
          {openParts.length > 0 ? 'Open tag' : 'Tag'}
        </span>
        <span className="w-8" />
      </header>

      <div className="px-4">
        <GridPlayer
          parts={tag.parts}
          takesByPart={selectedTakes}
          durationMs={tag.durationMs}
          onOpenSlot={(p) => nav(`/join/${tag.tagId}/${p}?combo=${comboParam}`)}
        />
      </div>

      <div className="px-5 pt-3 pb-1">
        <h2 className="font-serif text-[21px] font-semibold">{tag.title}</h2>
        <div className="flex items-center gap-1.5 text-[12px] font-semibold text-ink-soft mt-0.5">
          <KeyChip k={tag.key} />
          <span>{tag.voicing.toUpperCase()}</span>
          <span>·</span>
          <span>{takes.length} take{takes.length === 1 ? '' : 's'}</span>
        </div>
      </div>

      {/* per-part take picker */}
      <div className="px-5 pt-2 space-y-2.5">
        {tag.parts.map((p) => {
          const list = takesByPart[p] ?? []
          if (list.length === 0) return null
          return (
            <div key={p}>
              <div className="text-[10.5px] font-bold uppercase tracking-widest mb-1" style={{ color: PART_COLOR[p] }}>
                {PART_LABEL[p]} · {list.length} take{list.length === 1 ? '' : 's'}
              </div>
              <div className="flex gap-1.5 flex-wrap">
                {list.map((k, i) => (
                  <button
                    key={k.takeId}
                    data-testid={`pick-${p}-${i}`}
                    onClick={() => setSelected((s) => ({ ...s, [p]: k.takeId }))}
                    className={`text-[12px] font-semibold rounded-full px-3 py-1.5 border ${
                      selected[p] === k.takeId ? 'bg-ink text-ivory border-ink' : 'text-ink-soft border-line bg-white'
                    }`}
                  >
                    {k.displayName}
                  </button>
                ))}
                <button
                  data-testid={`swapin-${p}`}
                  onClick={() => nav(`/join/${tag.tagId}/${p}?combo=${Object.entries(selected).filter(([pp]) => pp !== p).map(([, id]) => id).join(',')}`)}
                  className="text-[12px] font-semibold rounded-full px-3 py-1.5 border border-dashed"
                  style={{ color: PART_COLOR[p], borderColor: PART_COLOR[p] }}
                >
                  + Sing it yourself
                </button>
              </div>
            </div>
          )
        })}
      </div>

      {openParts.length > 0 && (
        <div className="px-5 mt-5 mb-6 space-y-2">
          {openParts.map((p) => (
            <Button key={p} color={PART_COLOR[p]} testId={`join-${p}`}
              onClick={() => nav(`/join/${tag.tagId}/${p}?combo=${comboParam}`)}>
              Sing the {PART_LABEL[p]}
            </Button>
          ))}
          <p className="text-center text-[11px] text-ink-soft font-semibold">
            You'll hear the other parts in your earbuds while you record
          </p>
        </div>
      )}
      <div className="pb-4" />
    </Screen>
  )
}
