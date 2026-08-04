import { useCallback, useEffect, useRef, useState } from 'react'
import { animate } from 'animejs'
import { thumbSrc, posterSrc } from '../data/archive'
import { prefersReducedMotion, type PerfTier } from '../lib/perfTier'
import { loopFadeAction, type LoopFadePhase } from '../lib/loopFade'

/** Seconds. Long enough to read as a transition, short enough not to eat the clip. */
const LOOP_FADE = 0.55
/** How far down the tail goes. Not 0 — a hole to the void reads as a dropout. */
const LOOP_FLOOR = 0.12

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

  // Loop softening for the settled layer. The backdrop is one clip on repeat,
  // so its hard wrap is the most-seen cut in the app; `loopFadeAction` decides
  // when to dip and when to come back, and this only carries out the verdict.
  //
  // Deliberately NOT attached while a file change is crossfading: that beat
  // animates opacity on the incoming layer, and two owners of one property
  // fight. `layers.length === 1` is the steady state, which is also the only
  // time a wrap is what the eye is on.
  const loopPhase = useRef<LoopFadePhase>('in')
  const lastTime = useRef(0)
  const settled = layers.length === 1
  const attachLoopFade = useCallback((el: HTMLVideoElement | null) => {
    if (!el || prefersReducedMotion()) return
    loopPhase.current = 'in'
    lastTime.current = el.currentTime
    const onTime = () => {
      const action = loopFadeAction({
        time: el.currentTime,
        last: lastTime.current,
        duration: el.duration,
        fade: LOOP_FADE,
        phase: loopPhase.current,
      })
      lastTime.current = el.currentTime
      if (action.kind === 'none') return
      loopPhase.current = action.to
      animate(el, {
        opacity: action.to === 'out' ? LOOP_FLOOR : 1,
        duration: action.ms,
        ease: 'linear',
      })
    }
    el.addEventListener('timeupdate', onTime)
    return () => {
      el.removeEventListener('timeupdate', onTime)
      el.style.opacity = ''
    }
  }, [])

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
            ref={incoming ? incomingRef : settled ? attachLoopFade : undefined}
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
