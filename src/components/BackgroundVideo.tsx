import { media } from '../data/archive'
import type { PerfTier } from '../lib/perfTier'

export default function BackgroundVideo({ tier }: { tier: PerfTier }) {
  return (
    <div className="bg-video" aria-hidden="true">
      {tier === 'full' ? (
        <video src={media('bg.mp4')} poster={media('bg_poster.jpg')} autoPlay muted loop playsInline />
      ) : (
        <img src={media('bg_poster.jpg')} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
      )}
    </div>
  )
}
