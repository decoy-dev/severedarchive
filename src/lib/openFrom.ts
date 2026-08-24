import { animate } from 'animejs'
import { prefersReducedMotion } from './perfTier'

/**
 * "Opens out of the thing you clicked."
 *
 * One implementation, because two surfaces do it: the commission panel grows out
 * of the COMMISSIONS card, and the terminal body grows out of the tab that was
 * pressed. Both want the same gesture and the same reduced-motion behaviour, and
 * the origin arithmetic is the part that is easy to get subtly wrong — see the
 * note on measurement below.
 *
 * Transform and opacity only, per the binding rules.
 */

/** A point something grows from, in viewport coordinates. */
export type OpenOrigin = { x: number; y: number }

/** The centre of an element, in viewport coordinates. */
export function centreOf(el: Element): OpenOrigin {
  const box = el.getBoundingClientRect()
  return { x: box.left + box.width / 2, y: box.top + box.height / 2 }
}

export type OpenOptions = {
  /** What it grows from. 1 would be no growth; 0.88 is the panel, 0.96 the body. */
  scale: number
  duration?: number
}

/**
 * Grow `el` in from `origin`.
 *
 * MEASURE BEFORE ANIMATING, once. `getBoundingClientRect` reports the box AFTER
 * transforms, so calling this on an element already mid-animation reads a scaled
 * box and puts the origin somewhere it never was. Callers that can run twice —
 * anything in a mount effect, which StrictMode invokes twice in development —
 * must guard with a ref. `CommissionPanel` does.
 *
 * A null origin grows from the element's own centre, which is what a keyboard
 * tab shift gets: there was no pointer, so there is no point to grow from.
 */
export function openFrom(el: HTMLElement, origin: OpenOrigin | null, { scale, duration = 300 }: OpenOptions): void {
  if (origin) {
    const box = el.getBoundingClientRect()
    el.style.transformOrigin = `${origin.x - box.left}px ${origin.y - box.top}px`
  } else {
    el.style.transformOrigin = 'center'
  }

  if (prefersReducedMotion()) {
    // The end state, directly. Surfaces that start at `opacity: 0` in the
    // stylesheet would otherwise never become visible at all.
    el.style.opacity = '1'
    return
  }
  animate(el, { opacity: [0, 1], scale: [scale, 1], duration, ease: 'outQuad' })
}
