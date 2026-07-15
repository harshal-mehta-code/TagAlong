import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { useApp } from '../../appContext'
import { PitchPipeFab } from '../../components/PitchPipeFab'
import { Button, Screen } from '../../components/ui'
import { runSoundCheck, storedCalibration } from '../../engine/calibration'
import { performanceFromCombo, withTimeout } from '../../store/localStore'
import { newId } from '../../store/perfId'
import { PART_COLOR, PART_LABEL, type PartId, type Tag, type Take } from '../../types'
import { RecordPanel } from './RecordPanel'
import { SyncCheck } from './SyncCheck'
import { useTakeRecording } from './useTakeRecording'

type Step = 'preflight' | 'record' | 'review' | 'celebrate'

/**
 * Join an open part (or swap-in on a filled one). Guide combination comes
 * from ?combo=takeId,takeId — defaulting to the first take of each other part.
 * Guides play as synced <video> elements on the record screen: you see and
 * hear the quartet you're joining.
 */
export default function JoinFlow() {
  const { tagId, part } = useParams<{ tagId: string; part: PartId }>()
  const [params] = useSearchParams()
  const { store, profile } = useApp()
  const nav = useNavigate()
  const [tag, setTag] = useState<Tag | null>(null)
  const [guides, setGuides] = useState<Take[]>([])
  const [step, setStep] = useState<Step>('preflight')
  const [headphonesOk, setHeadphonesOk] = useState(false)
  const [saving, setSaving] = useState(false)
  const [soundCheck, setSoundCheck] = useState<'idle' | 'running' | 'done' | 'failed'>(
    () => (storedCalibration() ? 'done' : 'idle'),
  )
  const [soundCheckMs, setSoundCheckMs] = useState<number | null>(
    () => { const c = storedCalibration(); return c ? Math.round(c.roundTripSec * 1000) : null },
  )
  const [completedPerfId, setCompletedPerfId] = useState<string | null>(null)
  const [loadError, setLoadError] = useState(false)
  const guideEls = useRef<Record<string, HTMLVideoElement | null>>({})

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
      if (!alive) return
      setTag(t)
      setGuides(guideTakes)
    })()
    return () => { alive = false }
  }, [store, tagId, part, params])

  const rec = useTakeRecording(guides, guideEls, step === 'record')
  const parts = useMemo(() => tag?.parts ?? [], [tag])

  // stable across save retries: if a timed-out save actually landed in the
  // background, retrying overwrites the same row instead of duplicating it
  const pendingTakeIdRef = useRef<string | null>(null)

  const save = async (nudgeMs: number) => {
    if (!profile || !tag || !part || !rec.state.result || saving) return
    setSaving(true)
    const result = rec.state.result
    const take: Take = {
      takeId: (pendingTakeIdRef.current ??= newId('take')),
      tagId: tag.tagId,
      uid: profile.uid,
      displayName: profile.displayName,
      part,
      mediaOffsetMs: result.mediaOffsetMs,
      nudgeMs,
      mimeType: result.mimeType,
      guideTakeIds: guides.map((g) => g.takeId),
      createdAt: Date.now(),
      anchorSource: result.anchorSource,
    }
    try {
      await withTimeout(
        store.addTake(take, result.blob, result.stemBlob ?? undefined), 20_000, 'Saving the take',
      )
      const perf = await performanceFromCombo(tag, take, guides)
      pendingTakeIdRef.current = null
      if (perf) {
        await store.createPerformance(perf)
        setCompletedPerfId(perf.perfId)
        setStep('celebrate')
      } else {
        nav(`/t/${tag.tagId}`, { replace: true })
      }
    } catch (err) {
      window.alert(`Couldn't save your take: ${err instanceof Error ? err.message : String(err)}`)
    } finally {
      setSaving(false)
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
              <li><b className="text-[#F0EAE0]">Run the sound check below</b> with headphones OFF — 2 seconds of clicks measure your device's audio delay so your take lands in time.</li>
              <li><b className="text-[#F0EAE0]">Then put on headphones.</b> You'll see and hear the {guides.length === 1 ? 'other part' : guides.length > 1 ? `other ${guides.length} parts` : 'other parts'} while you record. Wired beats Bluetooth — Bluetooth adds delay no app can measure.</li>
              <li>Need your note? The pitch pipe floats in the corner.</li>
              <li>Four clicks count you in, then everyone's singing.</li>
            </ol>
          </div>

          <div className="bg-curtain-card border border-curtain-line rounded-card p-4 mt-4 flex items-center justify-between gap-3">
            <div className="text-[13px] font-semibold">
              {soundCheck === 'done' && soundCheckMs !== null ? (
                <span className="text-[#8fbf9f]">✓ Sound check done — {soundCheckMs} ms delay measured</span>
              ) : soundCheck === 'running' ? (
                <span className="text-brass">Listen… measuring the clicks</span>
              ) : soundCheck === 'failed' ? (
                <span className="text-[#d68a8a]">Couldn't hear the clicks — headphones off, volume up, try again</span>
              ) : (
                <span>Sound check <span className="text-[#A99FB6] font-normal">· speaker + mic, ~2 s</span></span>
              )}
            </div>
            <Button
              kind="ghost-dark"
              className="!w-auto px-4 !py-2 !text-[12.5px] shrink-0"
              testId="sound-check"
              disabled={soundCheck === 'running'}
              onClick={async () => {
                setSoundCheck('running')
                const r = await runSoundCheck()
                if (r.ok) { setSoundCheckMs(r.roundTripMs); setSoundCheck('done') }
                else setSoundCheck('failed')
              }}
            >
              {soundCheck === 'done' ? 'Redo' : 'Run'}
            </Button>
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
          <PitchPipeFab pitchKey={tag.key} octaveShift={tag.voicing === 'ssaa' ? 1 : 0} />
        </div>
      )}

      {step === 'record' && rec.state.stage !== 'done' && (
        <RecordPanel
          state={rec.state}
          part={part}
          parts={parts}
          guides={guides}
          guideEls={guideEls}
          pitchKey={tag.key}
          octaveShift={tag.voicing === 'ssaa' ? 1 : 0}
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
          onDiscard={() => nav(`/t/${tag.tagId}`, { replace: true })}
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
