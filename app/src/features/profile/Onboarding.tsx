import { useState } from 'react'
import { useApp } from '../../appContext'
import { Button, PartChip } from '../../components/ui'
import { newId } from '../../store/perfId'
import { PART_COLOR, PART_ORDER, type PartId } from '../../types'

/** First run: a name and your part(s). Under 15 seconds, no account needed. */
export default function Onboarding() {
  const { setProfile } = useApp()
  const [name, setName] = useState('')
  const [parts, setParts] = useState<PartId[]>([])

  const toggle = (p: PartId) =>
    setParts((s) => (s.includes(p) ? s.filter((x) => x !== p) : [...s, p]))

  return (
    <div className="h-full max-w-[520px] mx-auto bg-curtain-deep text-[#F0EAE0] flex flex-col px-7 overflow-y-auto">
      <div className="flex-1 flex flex-col justify-center py-10">
        <div className="grid grid-cols-2 gap-1 w-14 h-14 rounded-2xl overflow-hidden mb-6">
          {(['tenor', 'lead', 'bass', 'bari'] as PartId[]).map((p) => (
            <i key={p} style={{ background: PART_COLOR[p] }} />
          ))}
        </div>
        <h1 className="font-serif text-[32px] font-semibold leading-tight text-balance">
          Sing one part.<br />The world sings the rest.
        </h1>
        <p className="text-[14.5px] text-[#A99FB6] leading-relaxed mt-3">
          TagAlong is asynchronous quartet singing: record your part of a barbershop tag,
          and every combination of voices that completes it becomes its own performance.
        </p>

        <label className="block text-[10.5px] font-bold uppercase tracking-widest text-brass mt-8 mb-2">
          What do we call you?
        </label>
        <input
          data-testid="onboard-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Your name"
          autoComplete="nickname"
          className="w-full bg-curtain-card border border-curtain-line rounded-xl px-4 py-3 text-[15px] placeholder:text-[#776b85] focus:outline-none focus:border-brass"
        />

        <label className="block text-[10.5px] font-bold uppercase tracking-widest text-brass mt-5 mb-2">
          Which part(s) do you sing? <span className="text-[#776b85] normal-case tracking-normal">(optional)</span>
        </label>
        <div className="grid grid-cols-2 gap-2">
          {PART_ORDER.map((p) => (
            <PartChip key={p} part={p} active={parts.includes(p)} onClick={() => toggle(p)} />
          ))}
        </div>

        <div className="mt-8">
          <Button
            kind="brass"
            disabled={name.trim().length < 1}
            testId="onboard-go"
            onClick={() =>
              void setProfile({
                uid: newId('u'),
                displayName: name.trim(),
                voiceParts: parts,
                createdAt: Date.now(),
              })
            }
          >
            Let's sing →
          </Button>
        </div>
      </div>
    </div>
  )
}
