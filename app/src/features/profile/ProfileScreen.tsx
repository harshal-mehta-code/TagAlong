import { useEffect, useState } from 'react'
import { useApp } from '../../appContext'
import { PartChip, Screen, Wordmark } from '../../components/ui'
import { PART_ORDER, type PartId } from '../../types'

export default function ProfileScreen() {
  const { store, profile, setProfile } = useApp()
  const [stats, setStats] = useState({ takes: 0, perfs: 0, tags: 0 })

  useEffect(() => {
    ;(async () => {
      if (!profile) return
      const tags = await store.listTags()
      let takes = 0
      for (const t of tags) {
        const ks = await store.listTakes(t.tagId)
        takes += ks.filter((k) => k.uid === profile.uid).length
      }
      const perfs = (await store.listPerformances()).filter((p) => p.contributorUids.includes(profile.uid))
      setStats({ takes, perfs: perfs.length, tags: tags.filter((t) => t.creatorUid === profile.uid).length })
    })()
  }, [store, profile])

  if (!profile) return <Screen><div /></Screen>

  const toggleVoicePart = (p: PartId) => {
    const has = profile.voiceParts.includes(p)
    const voiceParts = has ? profile.voiceParts.filter((x) => x !== p) : [...profile.voiceParts, p]
    void setProfile({ ...profile, voiceParts })
  }

  return (
    <Screen>
      <header className="px-5 pt-[max(env(safe-area-inset-top),16px)] pb-2">
        <Wordmark />
      </header>

      <div className="px-5">
        <div className="flex items-center gap-4">
          <div className="w-16 h-16 rounded-full bg-gradient-to-br from-brass to-lead text-white text-2xl font-bold flex items-center justify-center">
            {profile.displayName[0]?.toUpperCase()}
          </div>
          <div>
            <h2 className="font-serif text-xl font-semibold">{profile.displayName}</h2>
            <p className="text-[12px] text-ink-soft font-semibold">
              Singing since {new Date(profile.createdAt).toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}
            </p>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-2.5 mt-5">
          {[
            ['Takes sung', stats.takes],
            ['Performances', stats.perfs],
            ['Tags started', stats.tags],
          ].map(([label, n]) => (
            <div key={label} className="bg-white border border-[#EFE9DC] rounded-card p-3 text-center">
              <div className="font-serif text-2xl font-semibold tabular-nums">{n}</div>
              <div className="text-[10px] font-bold uppercase tracking-wider text-ink-soft mt-0.5">{label}</div>
            </div>
          ))}
        </div>

        <div className="mt-6">
          <div className="text-[10.5px] font-bold uppercase tracking-widest text-brass mb-2">My voice parts</div>
          <div className="grid grid-cols-2 gap-2 [&_button]:!bg-white [&_button]:!text-ink [&_button]:!border-line">
            {PART_ORDER.map((p) => (
              <PartChip key={p} part={p}
                active={profile.voiceParts.includes(p)}
                onClick={() => toggleVoicePart(p)} />
            ))}
          </div>
        </div>

        <div className="mt-8 text-[11.5px] text-ink-soft leading-relaxed bg-[#F3ECDD] rounded-card p-4">
          <b className="text-ink">Local test build.</b> Everything you record lives only on this device
          for now — accounts and sharing with other singers arrive with the connected backend.
        </div>
      </div>
      <div className="pb-6" />
    </Screen>
  )
}
