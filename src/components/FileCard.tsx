import { useEffect, useRef } from 'react'
import { type ArchiveFile, thumbSrc, fullSrc, posterSrc, formatDuration } from '../data/archive'
import type { VideoDirector, Playable } from '../lib/videoDirector'
import type { PerfTier } from '../lib/perfTier'

export default function FileCard({
  file, director, tier, focused, muted, onClick,
}: {
  file: ArchiveFile
  director: VideoDirector
  tier: PerfTier
  focused: boolean
  muted: boolean
  onClick: () => void
}) {
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const showVideo = tier === 'full' || focused

  useEffect(() => {
    const v = videoRef.current
    if (!v || !showVideo) return
    // `paused` proxies the live element, so the director always judges against
    // reality — including right after React swaps `src` (thumb <-> full), which
    // resets the element to paused underneath us.
    const el: Playable = {
      play: () => { v.play().catch(() => {}) },
      pause: () => v.pause(),
      get paused() { return v.paused },
    }
    // Deliberately NOT keying this effect on `focused`: re-running register()/
    // unregister() on every focus toggle would re-push this id to the back of
    // the director's `order` queue (register only preserves position for ids it
    // already knows about), which can bump a returned card out of the play cap
    // on grids larger than it — e.g. desktop's 6 cards vs. a cap of 4. The video
    // *element* persists across focus changes (same ref, only `src` changes), so
    // there's no need to re-register it at all.
    //
    // Instead, `loadeddata` fires every time the browser finishes loading a new
    // `src` (on every focus/unfocus swap) and re-invokes register() for an
    // already-tracked id, which is a no-op on `order` and simply re-runs the
    // director's play/pause judgment against the freshly reset element.
    const resync = () => director.register(file.id, el)
    v.addEventListener('loadeddata', resync)
    director.register(file.id, el)
    return () => {
      v.removeEventListener('loadeddata', resync)
      director.unregister(file.id)
    }
  }, [director, file.id, showVideo])

  return (
    <button data-card data-file-id={file.id} className={focused ? 'file-card is-focus' : 'file-card'} onClick={onClick}>
      <div className="file-card-media">
        {showVideo ? (
          <video ref={videoRef} src={focused ? fullSrc(file.id) : thumbSrc(file.id)}
            poster={posterSrc(file.id)} muted={focused ? muted : true} loop playsInline />
        ) : (
          <img src={posterSrc(file.id)} alt={file.name} />
        )}
      </div>
      <div className="file-card-label">
        <span>FILE_{file.index} <span className="tw-dim">// {file.name}.{file.ext}</span></span>
        <span className="tw-dim">{formatDuration(file.durationSec)}</span>
      </div>
    </button>
  )
}
