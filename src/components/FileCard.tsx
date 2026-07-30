import { useEffect, useRef } from 'react'
import { type ArchiveFile, thumbSrc, fullSrc, posterSrc } from '../data/archive'
import type { VideoDirector } from '../lib/videoDirector'
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
    const el = { play: () => { v.play().catch(() => {}) }, pause: () => v.pause() }
    director.register(file.id, el)
    return () => director.unregister(file.id)
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
        <span className="tw-dim">{file.duration}</span>
      </div>
    </button>
  )
}
