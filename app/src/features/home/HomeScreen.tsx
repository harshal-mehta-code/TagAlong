import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useApp } from '../../appContext'
import { Button, EmptyState, Grid, KeyChip, OpenSlot, PartTag, Screen, Wordmark } from '../../components/ui'
import { PART_COLOR, PART_LABEL, type PartId, type Performance, type Tag, type Take } from '../../types'
import { TakeThumb } from '../perf/TakeThumb'

type FeedTab = 'performances' | 'open'

export default function HomeScreen() {
  const { store, profile } = useApp()
  const nav = useNavigate()
  const [tab, setTab] = useState<FeedTab>('performances')
  const [tags, setTags] = useState<Tag[]>([])
  const [takesByTag, setTakesByTag] = useState<Record<string, Take[]>>({})
  const [perfs, setPerfs] = useState<Performance[]>([])
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    let alive = true
    ;(async () => {
      const [tagList, perfList] = await Promise.all([store.listTags(), store.listPerformances()])
      const takes: Record<string, Take[]> = {}
      await Promise.all(
        tagList.map(async (t) => { takes[t.tagId] = await store.listTakes(t.tagId) }),
      )
      if (!alive) return
      setTags(tagList)
      setTakesByTag(takes)
      setPerfs(perfList)
      setLoaded(true)
      // default to In Progress when nothing is complete yet
      if (perfList.length === 0 && tagList.length > 0) setTab('open')
    })()
    return () => { alive = false }
  }, [store])

  const openTags = useMemo(
    () => tags.filter((t) => t.parts.some((p) => !(takesByTag[t.tagId] ?? []).some((k) => k.part === p))),
    [tags, takesByTag],
  )
  const tagById = useMemo(() => Object.fromEntries(tags.map((t) => [t.tagId, t])), [tags])

  return (
    <Screen>
      <header className="flex items-center justify-between px-5 pt-[max(env(safe-area-inset-top),16px)] pb-1">
        <Wordmark />
        <Link to="/profile" data-testid="home-avatar"
          className="w-8 h-8 rounded-full bg-gradient-to-br from-brass to-lead text-white text-[13px] font-bold flex items-center justify-center">
          {profile?.displayName?.[0]?.toUpperCase() ?? '♪'}
        </Link>
      </header>

      <div className="flex bg-[#EFE9DC] rounded-xl p-[3px] mx-5 my-2 text-[13px] font-semibold">
        {(['performances', 'open'] as FeedTab[]).map((t) => (
          <button key={t} data-testid={`tab-${t}`} onClick={() => setTab(t)}
            className={`flex-1 py-1.5 rounded-lg transition-colors ${tab === t ? 'bg-white text-ink shadow-sm' : 'text-ink-soft'}`}>
            {t === 'performances' ? 'Performances' : 'In Progress'}
          </button>
        ))}
      </div>

      {!loaded ? null : tab === 'performances' ? (
        perfs.length === 0 ? (
          <EmptyState
            title="No completed tags yet"
            body="When every part of a tag gets sung, the performance shows up here. Start one, or add your voice to a tag in progress."
            cta={<Button kind="brass" onClick={() => nav('/start')} testId="empty-start">Start a tag</Button>}
          />
        ) : (
          <div className="pb-4">
            {perfs.map((p) => (
              <PerfCard key={p.perfId} perf={p} tag={tagById[p.tagId]} takes={takesByTag[p.tagId] ?? []} />
            ))}
          </div>
        )
      ) : openTags.length === 0 ? (
        <EmptyState
          title="Nothing in progress"
          body="Every tag here is an open invitation. Record one part and let others tag along — or be the one who starts it all."
          cta={<Button kind="brass" onClick={() => nav('/start')} testId="empty-start-open">Start a tag</Button>}
        />
      ) : (
        <div className="pb-4">
          {openTags.map((t) => (
            <OpenTagCard key={t.tagId} tag={t} takes={takesByTag[t.tagId] ?? []} />
          ))}
        </div>
      )}
    </Screen>
  )
}

function latestTakePerPart(takes: Take[]): Partial<Record<PartId, Take>> {
  const out: Partial<Record<PartId, Take>> = {}
  for (const t of takes) out[t.part] = out[t.part] ?? t // takes sorted oldest→newest; keep first
  return out
}

function OpenTagCard({ tag, takes }: { tag: Tag; takes: Take[] }) {
  const nav = useNavigate()
  const byPart = latestTakePerPart(takes)
  const open = tag.parts.filter((p) => !byPart[p])
  const firstOpen = open[0]
  return (
    <div className="bg-white rounded-card border border-[#EFE9DC] shadow-sm mx-4 mb-3 p-3" data-testid={`tag-card-${tag.tagId}`}>
      <Link to={`/t/${tag.tagId}`}>
        <Grid className="mb-2.5">
          {tag.parts.map((p) =>
            byPart[p] ? (
              <div key={p} className="relative h-[74px]">
                <TakeThumb take={byPart[p]!} />
                <PartTag part={p} />
              </div>
            ) : (
              <div key={p} className="h-[74px] grid">
                <OpenSlot part={p} small />
              </div>
            ),
          )}
        </Grid>
        <h3 className="font-serif text-[17px] font-semibold">{tag.title}</h3>
      </Link>
      <div className="flex items-center gap-1.5 text-[11.5px] font-semibold text-ink-soft mt-0.5">
        <KeyChip k={tag.key} /><span>{tag.voicing.toUpperCase()}</span>
        <span>·</span><span>{takes.length} take{takes.length === 1 ? '' : 's'}</span>
        <span>·</span><span>needs {open.map((p) => PART_LABEL[p]).join(', ')}</span>
      </div>
      {firstOpen && (
        <div className="mt-2.5">
          <Button color={PART_COLOR[firstOpen]} onClick={() => nav(`/join/${tag.tagId}/${firstOpen}`)}
            testId={`card-join-${tag.tagId}`} className="!py-2.5 !text-[13px]">
            Sing the {PART_LABEL[firstOpen]}
          </Button>
        </div>
      )}
    </div>
  )
}

function PerfCard({ perf, tag, takes }: { perf: Performance; tag?: Tag; takes: Take[] }) {
  const { store, profile } = useApp()
  const [likes, setLikes] = useState(perf.likeCount)
  if (!tag) return null
  const takeById = Object.fromEntries(takes.map((t) => [t.takeId, t]))
  return (
    <div className="bg-white rounded-card border border-[#EFE9DC] shadow-sm mx-4 mb-3 p-3" data-testid={`perf-card-${perf.perfId}`}>
      <Link to={`/p/${perf.perfId}`}>
        <Grid className="mb-2.5">
          {tag.parts.map((p) => {
            const take = takeById[perf.takeIds[p] ?? '']
            return (
              <div key={p} className="relative h-[74px]">
                {take ? <TakeThumb take={take} /> : <div className="bg-curtain h-full" />}
                <PartTag part={p} />
              </div>
            )
          })}
        </Grid>
        <h3 className="font-serif text-[17px] font-semibold">{tag.title}</h3>
      </Link>
      <div className="flex items-center justify-between mt-1">
        <div className="flex items-center gap-1.5 text-[11.5px] font-semibold text-ink-soft">
          <KeyChip k={tag.key} /><span>{tag.voicing.toUpperCase()}</span>
          <span>·</span>
          <span>{[...new Set(Object.values(perf.takeIds).map((id) => takeById[id!]?.displayName).filter(Boolean))].join(', ')}</span>
        </div>
        <button
          onClick={async () => {
            if (!profile) return
            const updated = await store.toggleLike(perf.perfId, profile.uid)
            if (updated) setLikes(updated.likeCount)
          }}
          className="text-[13px] font-semibold text-ink-soft"
          data-testid={`like-${perf.perfId}`}
        >
          ♥ {likes}
        </button>
      </div>
    </div>
  )
}
