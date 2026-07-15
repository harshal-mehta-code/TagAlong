import { useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useApp } from '../../appContext'
import { PitchPipeFab } from '../../components/PitchPipeFab'
import { Button, PartChip, Screen } from '../../components/ui'
import { COUNT_IN_CLICKS, CLICK_INTERVAL_SEC } from '../../engine/audio'
import { withTimeout } from '../../store/localStore'
import { newId } from '../../store/perfId'
import { KEYS, PART_ORDER, type Key, type PartId, type Tag, type Take, type Voicing } from '../../types'
import { RecordPanel } from './RecordPanel'
import { SyncCheck } from './SyncCheck'
import { useTakeRecording } from './useTakeRecording'

type Step = 'setup' | 'record' | 'review'

export default function StartTagFlow() {
  const { store, profile } = useApp()
  const nav = useNavigate()
  const [step, setStep] = useState<Step>('setup')
  const [title, setTitle] = useState('')
  const [voicing, setVoicing] = useState<Voicing>('ttbb')
  const [part, setPart] = useState<PartId>(profile?.voiceParts[0] ?? 'lead')
  const [key, setKey] = useState<Key>('B♭')
  const [saving, setSaving] = useState(false)
  const guideEls = useRef<Record<string, HTMLVideoElement | null>>({})
  const rec = useTakeRecording([], guideEls, step === 'record')

  // stable across save retries: if a timed-out save actually landed in the
  // background, retrying overwrites the same rows instead of duplicating them
  const pendingIdsRef = useRef<{ tagId: string; takeId: string } | null>(null)

  const save = async (nudgeMs: number) => {
    if (!profile || !rec.state.result || saving) return
    setSaving(true)
    const result = rec.state.result
    const ids = (pendingIdsRef.current ??= { tagId: newId('tag'), takeId: newId('take') })
    const tag: Tag = {
      tagId: ids.tagId,
      title: title.trim() || 'Untitled tag',
      creatorUid: profile.uid,
      voicing,
      parts: PART_ORDER,
      key,
      durationMs: COUNT_IN_CLICKS * CLICK_INTERVAL_SEC * 1000 + result.sungDurationMs,
      createdAt: Date.now(),
    }
    const take: Take = {
      takeId: ids.takeId,
      tagId: tag.tagId,
      uid: profile.uid,
      displayName: profile.displayName,
      part,
      mediaOffsetMs: result.mediaOffsetMs,
      nudgeMs,
      mimeType: result.mimeType,
      guideTakeIds: [],
      createdAt: Date.now(),
      anchorSource: result.anchorSource,
    }
    try {
      await store.createTag(tag)
      await withTimeout(
        store.addTake(take, result.blob, result.stemBlob ?? undefined), 20_000, 'Saving the take',
      )
      pendingIdsRef.current = null
      nav(`/t/${tag.tagId}`, { replace: true })
    } catch (err) {
      window.alert(`Couldn't save your take: ${err instanceof Error ? err.message : String(err)}`)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Screen dark noTabs>
      <header className="flex items-center justify-between px-5 pt-[max(env(safe-area-inset-top),16px)] pb-1">
        <button onClick={() => (step === 'setup' ? nav(-1) : setStep('setup'))} className="text-xl w-8 text-left" aria-label="Back">‹</button>
        <div className="text-center">
          <div className="text-[10.5px] font-bold uppercase tracking-widest text-brass">
            Start a Tag · {step === 'setup' ? '1' : step === 'record' ? '2' : '3'} of 3
          </div>
          <div className="font-serif text-lg font-semibold">
            {step === 'setup' ? 'Set the stage' : step === 'record' ? 'Sing your part' : 'Lock it in'}
          </div>
        </div>
        <span className="w-8" />
      </header>

      {step === 'setup' && (
        <div className="flex-1 flex flex-col px-5 pt-2">
          <input
            data-testid="tag-title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Tag name (e.g. Lost Chord)"
            className="bg-curtain-card border border-curtain-line rounded-xl px-4 py-3 text-[15px] font-serif placeholder:text-[#776b85] focus:outline-none focus:border-brass"
          />

          <div className="flex bg-[#35244d] rounded-xl p-[3px] mt-3.5 text-[13px] font-semibold">
            {(['ttbb', 'ssaa', 'mixed'] as Voicing[]).map((v) => (
              <button key={v} data-testid={`voicing-${v}`} onClick={() => setVoicing(v)}
                className={`flex-1 py-1.5 rounded-lg ${voicing === v ? 'bg-[#4a3566] text-[#F0EAE0]' : 'text-[#A99FB6]'}`}>
                {v.toUpperCase()}
              </button>
            ))}
          </div>

          <div className="grid grid-cols-2 gap-2 mt-3.5">
            {PART_ORDER.map((p) => (
              <PartChip key={p} part={p} active={part === p} onClick={() => setPart(p)}
                suffix={part === p ? ' · you' : ''} />
            ))}
          </div>

          <div className="flex gap-1.5 justify-center flex-wrap mt-5 px-1 text-[12px] font-bold tabular-nums">
            {KEYS.map((k) => (
              <button key={k} data-testid={`key-${k}`} onClick={() => setKey(k)}
                className={`px-2.5 py-1.5 rounded-lg ${key === k ? 'bg-brass text-[#2e2410]' : 'bg-curtain-card text-[#A99FB6]'}`}>
                {k}
              </button>
            ))}
          </div>

          <div className="mt-auto mb-6 pt-6">
            <Button kind="brass" onClick={() => setStep('record')} testId="to-record">
              Continue →
            </Button>
          </div>
          <PitchPipeFab pitchKey={key} octaveShift={voicing === 'ssaa' ? 1 : 0} />
        </div>
      )}

      {step === 'record' && rec.state.stage !== 'done' && (
        <RecordPanel
          state={rec.state}
          part={part}
          parts={PART_ORDER}
          guides={[]}
          guideEls={guideEls}
          pitchKey={key}
          octaveShift={voicing === 'ssaa' ? 1 : 0}
          onBegin={() => void rec.begin()}
          onStop={() => { void rec.stop().then(() => setStep('review')) }}
          onRetryPermission={rec.retryPermission}
        />
      )}
      {(step === 'review' || rec.state.stage === 'done') && rec.state.result && (
        <SyncCheck
          result={rec.state.result}
          part={part}
          guides={[]}
          parts={PART_ORDER}
          saving={saving}
          onSave={(n) => void save(n)}
          onRetake={() => { rec.reset(); setStep('record') }}
          onDiscard={() => nav('/', { replace: true })}
        />
      )}
    </Screen>
  )
}
