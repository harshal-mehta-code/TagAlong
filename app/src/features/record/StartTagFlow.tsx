import { useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useApp } from '../../appContext'
import { Button, PartChip, Screen } from '../../components/ui'
import { ensureRunning, playPitch, COUNT_IN_CLICKS, CLICK_INTERVAL_SEC } from '../../engine/audio'
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
  const rec = useTakeRecording([], guideEls)

  const save = async (nudgeMs: number) => {
    if (!profile || !rec.state.result || saving) return
    setSaving(true)
    const result = rec.state.result
    const tag: Tag = {
      tagId: newId('tag'),
      title: title.trim() || 'Untitled tag',
      creatorUid: profile.uid,
      voicing,
      parts: PART_ORDER,
      key,
      durationMs: COUNT_IN_CLICKS * CLICK_INTERVAL_SEC * 1000 + result.sungDurationMs,
      createdAt: Date.now(),
    }
    const take: Take = {
      takeId: newId('take'),
      tagId: tag.tagId,
      uid: profile.uid,
      displayName: profile.displayName,
      part,
      mediaOffsetMs: result.mediaOffsetMs,
      nudgeMs,
      mimeType: result.mimeType,
      guideTakeIds: [],
      createdAt: Date.now(),
    }
    await store.createTag(tag)
    await store.addTake(take, result.blob, result.stemBlob ?? undefined)
    nav(`/t/${tag.tagId}`, { replace: true })
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

          <div className="text-center mt-6">
            <button
              data-testid="pitch-pipe"
              onClick={async () => { await ensureRunning(); playPitch(key, voicing === 'ssaa' ? 1 : 0) }}
              className="w-[134px] h-[134px] rounded-full mx-auto flex flex-col items-center justify-center text-[#2e2410] active:scale-95 transition-transform relative
                bg-[radial-gradient(circle_at_34%_28%,#E3C685,#C79A3D_52%,#8a6a24)]
                shadow-[0_10px_30px_rgba(199,154,61,.35),inset_0_-5px_14px_rgba(80,58,10,.45),inset_0_4px_8px_rgba(255,240,200,.5)]
                after:content-[''] after:absolute after:inset-[11px] after:rounded-full after:border after:border-[#3c2c08]/35"
              aria-label={`Play pitch ${key}`}
            >
              <span className="font-serif text-[36px] font-bold leading-none">{key}</span>
              <span className="text-[8.5px] font-bold uppercase tracking-[.13em] mt-1">tap to blow pitch</span>
            </button>
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
