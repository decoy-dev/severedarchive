import { animate } from 'animejs'
import { prefersReducedMotion } from './perfTier'

export function captureRects(els: HTMLElement[]): Map<HTMLElement, DOMRect> {
  return new Map(els.map((el) => [el, el.getBoundingClientRect()]))
}

export function playFlip(
  prev: Map<HTMLElement, DOMRect>,
  els: HTMLElement[],
  opts: { duration?: number } = {},
) {
  // Elements already sit at their final (post-layout) position/size by the time
  // this runs — the FLIP is purely cosmetic. Skip it outright under reduced motion.
  if (prefersReducedMotion()) return
  const duration = opts.duration ?? 420
  for (const el of els) {
    const before = prev.get(el)
    if (!before) continue
    const after = el.getBoundingClientRect()
    const dx = before.left - after.left
    const dy = before.top - after.top
    const sx = before.width / after.width
    const sy = before.height / after.height
    if (!dx && !dy && sx === 1 && sy === 1) continue
    el.style.transformOrigin = 'top left'
    el.style.transform = `translate(${dx}px, ${dy}px) scale(${sx}, ${sy})`
    animate(el, {
      translateX: [dx, 0], translateY: [dy, 0],
      scaleX: [sx, 1], scaleY: [sy, 1],
      duration, ease: 'outExpo',
      onComplete: () => { el.style.transform = '' },
    })
  }
}
