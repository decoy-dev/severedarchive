import { animate } from 'animejs'
import { prefersReducedMotion } from './perfTier'
import type { MoveAnimator } from './mediaController'

export const MOVE_MS = 520

const inFlight = new WeakMap<HTMLElement, { cancel: () => unknown }>()

const clearHost = (host: HTMLElement) => {
  host.style.transform = ''
  host.style.transformOrigin = ''
  host.style.willChange = ''
}

/** A move arriving mid-beat cancels the previous one rather than stacking on it. */
export const cancelMove = (host: HTMLElement) => {
  const prev = inFlight.get(host)
  if (!prev) return
  inFlight.delete(host)
  prev.cancel()
  clearHost(host)
}

/**
 * The open beat: the video is visibly pulled out of the explorer pane and into
 * the new window.
 *
 * Single-element FLIP on the media host, not `createLayout`. `createLayout`
 * stamps `data-layout-id` across its root subtree and writes inline `width`,
 * `height`, `min/maxWidth`, `min/maxHeight` and `translate` onto every animating
 * node. Rooting it anywhere that contains both parents necessarily contains
 * `.file-window`, whose `width`, `left`, `top` and `zIndex` React drives inline
 * — and the window has just mounted, so React re-renders several times during
 * the beat and overwrites whatever anime wrote. The host is not React-styled,
 * so nothing can clobber it, and one element is measured instead of the whole
 * desktop subtree twice at the most contended moment in the app.
 *
 * Binding invariant behind all of that: the move must not depend on any
 * React-rendered node's inline style surviving the beat, and must leave no
 * residual inline style behind when it ends.
 */
export const flipMove: MoveAnimator = (host, from, to) => {
  cancelMove(host)

  const dx = from.left - to.left
  const dy = from.top - to.top
  const sx = to.width > 0 ? from.width / to.width : 1
  const sy = to.height > 0 ? from.height / to.height : 1

  // Sub-pixel deltas are not a move anyone can see; animating them only risks
  // leaving a transform on an element that never appeared to go anywhere.
  if (Math.abs(dx) < 1 && Math.abs(dy) < 1 && Math.abs(sx - 1) < 0.01 && Math.abs(sy - 1) < 0.01) return

  if (prefersReducedMotion()) return

  host.style.transformOrigin = 'top left'
  host.style.willChange = 'transform'
  const anim = animate(host, {
    translateX: [dx, 0],
    translateY: [dy, 0],
    scaleX: [sx, 1],
    scaleY: [sy, 1],
    duration: MOVE_MS,
    ease: 'outExpo',
    // Self-reverting: transform, origin and will-change are wiped when the beat
    // ends, so nothing accumulates on the host and no compositor layer is left
    // pinned. Cancellation clears through cancelMove instead.
    onComplete: () => { inFlight.delete(host); clearHost(host) },
  })
  inFlight.set(host, anim)
}
