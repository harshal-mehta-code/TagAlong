import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { useApp } from '../../appContext'
import { Button, Screen } from '../../components/ui'
import { ensureRunning, playPitch } from '../../engine/audio'
import { decodeGuide, type GuideClip } from '../../engine/recorder'
import { performanceFromCombo } from '../../store/localStore'
import { newId } from '../../store/perfId'
import { PART_COLOR, PART_LABEL, type PartId, type Tag, type Take } from '../../types'
import { RecordPanel } from './RecordPanel'
import { SyncCheck } from './SyncCheck'
import { useTakeRecording } from './useTakeRecording'

type Step = 'preflight' | 'record' | 'review' | 'celebrate'

/**
 * Join an open part (or swap-in on a filled one). Guide combination comes
 * from ?combo=takeId,takeId — defaulting to the first take of each other part.
 */
export default function JoinFlow() {
  const { tagId, part } = useParams<{ tagId: string; part: PartId }>()
  const [params] = useSearchParams()
  const { store, profile } = useApp()
  const nav = useNavigate()
  const [tag, setTag] = useState<Tag | null>(null)
  const [guides, setGuides] = useState<Take[]>([])
  const [clips, setClips] = useState<GuideClip[]>([])
  const [step, setStep] = useState<Step>('preflight')
  const [headphonesOk, setHeadphonesOk] = useState(false)
  const [saving, setSaving] = useState(false)
  const [completedPerfId, setCompletedPerfId] = useState<string | null>(null)
  const [loadError, setLoadError] = useState(false)

  useEffect(() => {
    let alive = true
    ;(async () => {
      if (!tagId || !part) return
      const t = await store.getTag(tagId)
      const takes = await store.listTakes(tagId)
      if (!t || !alive) { setLoadError(true); return }
      const comboIds = params.get('combo')?.split(',').filter(Boolean)
      let guideTakes: Take[]
      if (comboIds?.length) {
        guideTakes = takes.filter((k) => comboIds.includes(k.takeId) && k.part !== part)
      } else {
        const byPart = new Map<PartId, Take>()
        for (const k of takes) if (k.part !== part && !byPart.has(k.part)) byPart.set(k.part, k)
        guideTakes = [...byPart.values()]
      }
      const decoded: GuideClip[] = []
      for (const g of guideTakes) {
        const blob = await store.getMedia(g.takeId)
        if (!blob) continue
        try {
          decoded.push({
            takeId: g.takeId,
            buffer: await decodeGuide(blob),
            mediaOffsetMs: g.mediaOffsetMs,
            nudgeMs: g.nudgeMs,
          })
        } catch {
          // media that fails to decode is skipped; recording proceeds without it
        }
      }
      if (!alive) return
      setTag(t)
      setGuides(guideTakes)
      setClips(decoded)
    })()
    return () => { alive = false }
  }, [store, tagId, part, params])

  const rec = useTakeRecording(clips)
  const parts = useMemo(() => tag?.parts ?? [], [tag])

  const save = async (nudgeMs: number) => {
    if (!profile || !tag || !part || !rec.state.result || saving) return
    setSaving(true)
    const result = rec.state.result
    const take: Take = {
      takeId: newId('take'),
      tagId: tag.tagId,
      uid: profile.uid,
      displayName: profile.displayName,
      part,
      mediaOffsetMs: result.mediaOffsetMs,
      nudgeMs,
      mimeType: result.mimeType,
      guideTakeIds: guides.map((g) => g.takeId),
      createdAt: Date.now(),
    }
    await store.addTake(take, result.blob)
    const perf = await performanceFromCombo(tag, take, guides)
    if (perf) {
      await store.createPerformance(perf)
      setCompletedPerfId(perf.perfId)
      setStep('celebrate')
    } else {
      nav(`/t/${tag.tagId}`, { replace: true })
    }
  }

  if (loadError) {
    return (
      <Screen dark noTabs>
        <div className="flex-1 flex items-center justify-center text-[#A99FB6] text-sm">Tag not found.</div>
      </Screen>
    )
  }
  if (!tag || !part) return <Screen dark noTabs><div /></Screen>

  return (
    <Screen dark noTabs>
      <header className="flex items-center justify-between px-5 pt-[max(env(safe-area-inset-top),16px)] pb-1">
        <button onClick={() => nav(-1)} className="text-xl w-8 text-left" aria-label="Back">‹</button>
        <div className="text-center">
          <div className="text-[10.5px] font-bold uppercase tracking-widest" style={{ color: PART_COLOR[part] }}>
            Sing the {PART_LABEL[part]}
          </div>
          <div className="font-serif text-lg font-semibold">{tag.title} · {tag.key}</div>
        </div>
        <span className="w-8" />
      </header>

      {step === 'preflight' && (
        <div className="flex-1 flex flex-col px-6 pt-4">
          <div className="bg-curtain-card border border-curtain-line rounded-card p-5">
            <h3 className="font-serif text-lg font-semibold mb-3">Before you sing</h3>
            <ol className="text-[13.5px] text-[#A99FB6] leading-relaxed space-y-2.5 list-decimal pl-4">
              <li><b className="text-[#F0EAE0]">Put on headphones.</b> You'll hear the {guides.length === 1 ? 'other part' : guides.length > 1 ? `other ${guides.length} parts` : 'other parts'} while you record — without headphones they'd bleed into your mic.</li>
              <li>Tap the pitch pipe to hear <b className="text-[#F0EAE0]">{tag.key}</b>, find your note.</li>
              <li>Four clicks count you in, then everyone's singing.</li>
              <li>If your timing feels off afterwards, the nudge slider fixes it.</li>
            </ol>
          </div>

          <div className="text-center mt-6">
            <button
              data-testid="pitch-pipe"
              onClick={async () => { await ensureRunning(); playPitch(tag.key, tag.voicing === 'ssaa' ? 1 : 0) }}
              className="w-[110px] h-[110px] rounded-full mx-auto flex flex-col items-center justify-center text-[#2e2410] active:scale-95 transition-transform
                bg-[radial-gradient(circle_at_34%_28%,#E3C685,#C79A3D_52%,#8a6a24)]
                shadow-[0_10px_30px_rgba(199,154,61,.35),inset_0_-5px_14px_rgba(80,58,10,.45)]"
              aria-label={`Play pitch ${tag.key}`}
            >
              <span className="font-serif text-[30px] font-bold leading-none">{tag.key}</span>
              <span className="text-[8px] font-bold uppercase tracking-[.13em] mt-1">blow pitch</span>
            </button>
          </div>

          <label className="flex items-center gap-3 mt-6 text-[13.5px] font-semibold">
            <input
              data-testid="headphones-check"
              type="checkbox"
              checked={headphonesOk}
              onChange={(e) => setHeadphonesOk(e.target.checked)}
              className="w-5 h-5 accent-[#C79A3D]"
            />
            I'm wearing headphones
          </label>

          <div className="mt-auto mb-6 pt-4">
            <Button
              color={PART_COLOR[part]}
              disabled={!headphonesOk}
              onClick={() => setStep('record')}
              testId="to-record"
            >
              I'm ready →
            </Button>
          </div>
        </div>
      )}

      {step === 'record' && rec.state.stage !== 'done' && (
        <RecordPanel
          state={rec.state}
          part={part}
          onBegin={() => void rec.begin()}
          onStop={() => { void rec.stop().then(() => setStep('review')) }}
          onRetryPermission={rec.retryPermission}
        />
      )}

      {(step === 'review' || (step === 'record' && rec.state.stage === 'done')) && rec.state.result && (
        <SyncCheck
          result={rec.state.result}
          part={part}
          guides={guides}
          parts={parts}
          saving={saving}
          onSave={(n) => void save(n)}
          onRetake={() => { rec.reset(); setStep('record') }}
        />
      )}

      {step === 'celebrate' && completedPerfId && (
        <div className="flex-1 flex flex-col items-center justify-center gap-3 px-8 text-center">
          <div className="text-[64px] leading-none">🎉</div>
          <h2 className="font-serif text-2xl font-semibold">Chord locked</h2>
          <p className="text-[14px] text-[#A99FB6] leading-relaxed">
            Your {PART_LABEL[part].toLowerCase()} completed this tag. The performance is live on the feed.
          </p>
          <div className="w-full mt-4 space-y-2.5">
            <Button color="#5E8C6E" onClick={() => nav(`/p/${completedPerfId}`, { replace: true })} testId="see-performance">
              Watch the performance
            </Button>
            <Button kind="ghost-dark" onClick={() => nav('/', { replace: true })}>Back to feed</Button>
          </div>
        </div>
      )}
    </Screen>
  )
}
