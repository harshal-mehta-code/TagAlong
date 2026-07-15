import { useState } from 'react'
import { ensureRunning, playPitch } from '../engine/audio'
import type { Key } from '../types'

/**
 * The pitch pipe as an on-demand floating button: a small brass FAB in the
 * corner that opens a sheet with the big pipe. Nothing pipe-related sits
 * inline in the flow — you tap it only when you need your note.
 */
export function PitchPipeFab({ pitchKey, octaveShift = 0 }: { pitchKey: Key; octaveShift?: number }) {
  const [open, setOpen] = useState(false)

  return (
    <>
      <button
        data-testid="pitch-pipe"
        onClick={() => setOpen(true)}
        aria-label="Open pitch pipe"
        className="fixed right-4 bottom-[max(env(safe-area-inset-bottom),16px)] z-40 w-[54px] h-[54px] rounded-full flex flex-col items-center justify-center text-[#2e2410] active:scale-95 transition-transform
          bg-[radial-gradient(circle_at_34%_28%,#E3C685,#C79A3D_52%,#8a6a24)]
          shadow-[0_6px_18px_rgba(0,0,0,.45),inset_0_-3px_8px_rgba(80,58,10,.45)]"
      >
        <span className="font-serif text-[17px] font-bold leading-none">{pitchKey}</span>
        <span className="text-[6.5px] font-bold uppercase tracking-[.1em] mt-0.5">pitch</span>
      </button>

      {open && (
        <div
          data-testid="pitch-pipe-sheet"
          className="fixed inset-0 z-50 bg-black/70 flex flex-col items-center justify-center gap-6 px-8"
          onClick={() => setOpen(false)}
        >
          <button
            data-testid="pitch-pipe-blow"
            onClick={async (e) => { e.stopPropagation(); await ensureRunning(); playPitch(pitchKey, octaveShift) }}
            aria-label={`Play pitch ${pitchKey}`}
            className="w-[134px] h-[134px] rounded-full flex flex-col items-center justify-center text-[#2e2410] active:scale-95 transition-transform relative
              bg-[radial-gradient(circle_at_34%_28%,#E3C685,#C79A3D_52%,#8a6a24)]
              shadow-[0_10px_30px_rgba(199,154,61,.35),inset_0_-5px_14px_rgba(80,58,10,.45),inset_0_4px_8px_rgba(255,240,200,.5)]
              after:content-[''] after:absolute after:inset-[11px] after:rounded-full after:border after:border-[#3c2c08]/35"
          >
            <span className="font-serif text-[36px] font-bold leading-none">{pitchKey}</span>
            <span className="text-[8.5px] font-bold uppercase tracking-[.13em] mt-1">tap to blow pitch</span>
          </button>
          <button
            data-testid="pitch-pipe-close"
            onClick={() => setOpen(false)}
            className="text-[13px] font-semibold text-white/80 underline underline-offset-2"
          >
            Close
          </button>
        </div>
      )}
    </>
  )
}
