import { useMediaUrl } from '../../appContext'
import type { Take } from '../../types'

/** Static video poster for feed cards: first sung frame, no playback. */
export function TakeThumb({ take }: { take: Take }) {
  const url = useMediaUrl(take.takeId)
  return (
    <div className="w-full h-full bg-curtain overflow-hidden">
      {url && (
        <video
          src={url}
          muted
          playsInline
          preload="metadata"
          className="w-full h-full object-cover"
          onLoadedMetadata={(e) => {
            const v = e.currentTarget
            v.currentTime = Math.max(0.1, (take.mediaOffsetMs + take.nudgeMs) / 1000 + 2.8)
          }}
        />
      )}
    </div>
  )
}
