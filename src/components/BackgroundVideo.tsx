import { useEffect, useRef, useState } from 'react'
import { animate } from 'animejs'
import { thumbSrc, posterSrc } from '../data/archive'
import { prefersReducedMotion, type PerfTier } from '../lib/perfTier'

export default function BackgroundVideo({ tier, fileId }: { tier: PerfTier; fileId: string }) {
  const [layers, setLayers] = useState<string[]>([fileId]) // newest last
  const fading = useRef(false)

  useEffect(() => {
    if (layers[layers.length - 1] === fileId) return
    if (tier === 'lite' || prefersReducedMotion()) { setLayers([fileId]); return }
    setLayers((l) => [...l.slice(-1), fileId])
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fileId, tier])

  const incomingRef = useRef<HTMLVideoElement | null>(null)
  useEffect(() => {
    if (layers.length < 2 || !incomingRef.current || fading.current) return
    fading.current = true
    animate(incomingRef.current, {
      opacity: [0, 1],
      duration: 600,
      ease: 'outQuad',
      onComplete: () => { fading.current = false; setLayers((l) => l.slice(-1)) },
    })
  }, [layers])

  if (tier === 'lite') {
    return (
      <div className="bg-video" aria-hidden="true">
        <img src={posterSrc(fileId)} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
      </div>
    )
  }
  return (
    <div className="bg-video" aria-hidden="true">
      {layers.map((id, i) => {
        const incoming = i === layers.length - 1 && layers.length > 1
        return (
          <video
            key={id}
            ref={incoming ? incomingRef : undefined}
            src={thumbSrc(id)}
            poster={posterSrc(id)}
            autoPlay
            muted
            loop
            playsInline
            style={{ position: 'absolute', inset: 0, opacity: incoming ? 0 : 1 }}
          />
        )
      })}
    </div>
  )
}
