import { useEffect, useRef } from 'react'
import { animate } from 'animejs'
import { prefersReducedMotion } from '../lib/perfTier'

export default function HomeNotification({ onDismiss }: { onDismiss: () => void }) {
  // animate an inner wrapper, never the outer .notification element — the outer owns
  // the mobile centering transform (translateX(-50%)), and anime's inline `transform`
  // writes would otherwise clobber that positioning rule.
  const ref = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (!ref.current) return
    if (prefersReducedMotion()) { ref.current.style.opacity = '1'; return }
    animate(ref.current, { opacity: [0, 1], translateY: [10, 0], scale: [0.96, 1], duration: 380, ease: 'outExpo' })
  }, [])

  const dismiss = () => {
    if (!ref.current) return onDismiss()
    if (prefersReducedMotion()) { onDismiss(); return }
    animate(ref.current, { opacity: [1, 0], scale: [1, 0.97], duration: 160, ease: 'inQuad', onComplete: onDismiss })
  }

  return (
    <div className="notification" data-notification role="alertdialog" aria-label="Incoming transmission">
      <div className="notification-inner" ref={ref}>
        <div className="notification-head">
          <span className="notification-dot" />
          INCOMING TRANSMISSION
        </div>
        <div className="notification-body">
          <p className="panel-big">SEVEREDARCHIVE</p>
          <p className="tw-dim">MOTION + VISUAL ART // RENDERS SET TO SOUND</p>
        </div>
        <button className="notification-ack" aria-label="Acknowledge" onClick={dismiss}>
          [ ACKNOWLEDGE ]
        </button>
      </div>
    </div>
  )
}
