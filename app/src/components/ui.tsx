import type { ReactNode } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { PART_COLOR, PART_LABEL, type PartId } from '../types'

export function Button({
  children, onClick, kind = 'primary', color, disabled, className = '', testId,
}: {
  children: ReactNode
  onClick?: () => void
  kind?: 'primary' | 'brass' | 'ghost' | 'ghost-dark' | 'danger'
  color?: string
  disabled?: boolean
  className?: string
  testId?: string
}) {
  const base = 'block w-full text-center font-bold rounded-2xl px-4 py-3.5 text-[15px] transition-opacity select-none'
  const kinds: Record<string, string> = {
    primary: 'text-white shadow-lg',
    brass: 'bg-brass text-[#2e2410] shadow-[0_4px_16px_rgba(199,154,61,.35)]',
    ghost: 'border-[1.5px] border-line text-ink bg-transparent',
    'ghost-dark': 'border-[1.5px] border-[#4a3566] text-[#F0EAE0] bg-transparent',
    danger: 'bg-record text-white',
  }
  // light accents (tenor blue, bari brass) need ink text to stay readable
  const LIGHT_ACCENTS = new Set(['#8FB7E8', '#C79A3D'])
  const textColor = color && LIGHT_ACCENTS.has(color) ? '#1e2433' : '#fff'
  return (
    <button
      data-testid={testId}
      disabled={disabled}
      onClick={onClick}
      className={`${base} ${kinds[kind]} ${disabled ? 'opacity-40' : 'active:opacity-70'} ${className}`}
      style={kind === 'primary' ? { background: color ?? '#251C31', color: textColor } : undefined}
    >
      {children}
    </button>
  )
}

export function PartChip({ part, active, onClick, suffix }: {
  part: PartId; active?: boolean; onClick?: () => void; suffix?: string
}) {
  return (
    <button
      data-testid={`part-${part}`}
      onClick={onClick}
      className={`flex items-center gap-2 rounded-xl px-3 py-2.5 text-[13px] font-bold border-[1.5px] transition-colors ${
        active
          ? 'text-[#F0EAE0] bg-white/10'
          : 'text-[#A99FB6] bg-[#2c1d42] border-curtain-line'
      }`}
      style={active ? { borderColor: PART_COLOR[part] } : undefined}
    >
      <i className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: PART_COLOR[part] }} />
      {PART_LABEL[part]}{suffix}
    </button>
  )
}

/** Quadrant grid; children rendered in order. Works for any part count (2x2 for 4). */
export function Grid({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <div className={`grid grid-cols-2 gap-[3px] rounded-card overflow-hidden ${className}`}>
      {children}
    </div>
  )
}

export function OpenSlot({ part, onClick, small }: { part: PartId; onClick?: () => void; small?: boolean }) {
  return (
    <button
      data-testid={`open-slot-${part}`}
      onClick={onClick}
      className={`flex flex-col items-center justify-center gap-0.5 bg-ivory animate-pulse-slot ${onClick ? '' : 'cursor-default'}`}
      style={{ border: `1.5px dashed ${PART_COLOR[part]}`, color: PART_COLOR[part] }}
    >
      <span className={`font-bold ${small ? 'text-[11px]' : 'text-[13px]'}`}>Sing the {PART_LABEL[part]}</span>
      <span className="text-[9px] font-semibold uppercase tracking-widest text-ink-soft">open slot</span>
    </button>
  )
}

export function PartTag({ part }: { part: PartId }) {
  const bg: Record<PartId, string> = {
    tenor: '#4a72a8', lead: '#c05244', bari: '#a37c2b', bass: '#4a7057',
  }
  return (
    <span
      className="absolute left-1.5 bottom-1.5 text-[9px] font-bold uppercase tracking-wider text-white px-1.5 py-0.5 rounded-full z-10"
      style={{ background: bg[part] }}
    >
      {PART_LABEL[part]}
    </span>
  )
}

export function KeyChip({ k }: { k: string }) {
  return (
    <span className="bg-[#F3ECDD] text-[#8a6a24] rounded-md px-1.5 py-0.5 text-[11px] font-semibold tabular-nums">
      {k}
    </span>
  )
}

export function TabBar() {
  const { pathname } = useLocation()
  const nav = useNavigate()
  const tab = (to: string, label: string, icon: string, active: boolean) => (
    <Link to={to} className={`flex-1 text-center text-[10px] font-semibold ${active ? 'text-ink' : 'text-[#9a92a6]'}`}>
      <span className="block text-[21px] leading-6">{icon}</span>
      {label}
    </Link>
  )
  return (
    <nav className="shrink-0 border-t border-line bg-white/95 backdrop-blur flex items-start pt-2 pb-[max(env(safe-area-inset-bottom),10px)]">
      {tab('/', 'Home', '⌂', pathname === '/')}
      <button
        data-testid="tab-start"
        onClick={() => nav('/start')}
        className="flex-1 text-center"
        aria-label="Start a tag"
      >
        <span className="inline-block w-11 h-11 -mt-1.5 rounded-full bg-brass text-white text-[26px] leading-[42px] font-normal shadow-[0_4px_12px_rgba(199,154,61,.4)]">
          +
        </span>
      </button>
      {tab('/profile', 'Profile', '◉', pathname === '/profile')}
    </nav>
  )
}

export function Screen({ children, dark, noTabs }: { children: ReactNode; dark?: boolean; noTabs?: boolean }) {
  return (
    <div className={`h-full flex flex-col max-w-[520px] mx-auto ${dark ? 'bg-curtain-deep text-[#F0EAE0]' : 'bg-ivory text-ink'}`}>
      <div className="flex-1 overflow-y-auto flex flex-col">{children}</div>
      {!noTabs && <TabBar />}
    </div>
  )
}

export function Wordmark() {
  return <span className="font-serif text-[24px] font-semibold tracking-tight">TagAlong</span>
}

export function EmptyState({ title, body, cta }: { title: string; body: string; cta?: ReactNode }) {
  return (
    <div className="flex-1 flex flex-col items-center justify-center gap-2 px-10 text-center">
      <div className="grid grid-cols-2 gap-1 w-12 h-12 mb-2 opacity-80">
        {(['tenor', 'lead', 'bass', 'bari'] as PartId[]).map((p) => (
          <i key={p} className="rounded-md" style={{ background: PART_COLOR[p] }} />
        ))}
      </div>
      <h2 className="font-serif text-xl font-semibold">{title}</h2>
      <p className="text-[13.5px] text-ink-soft leading-relaxed">{body}</p>
      {cta && <div className="mt-3 w-full">{cta}</div>}
    </div>
  )
}
