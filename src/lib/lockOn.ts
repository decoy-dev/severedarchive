/**
 * The beat a window plays when it is enlarged or brought back down: the frame
 * travels to its new box while a scanline roll passes through it, as if a
 * display were re-locking onto a new mode.
 *
 * The travel is SMOOTH. It was quantized to six levels on the theory that
 * nothing else in this interface moves smoothly, and the owner read the steps as
 * lag — which, at 50ms a step on an element this large, they visually are. The
 * stepped vocabulary lives on in the overlay (the roll band and the scanlines
 * are `steps(9)`), where a stutter reads as texture instead of as dropped
 * frames. The geometry glides under it.
 *
 * Pure. The geometry is a FLIP, the same shape as `mediaMove.flipMove`, expressed
 * as functions of progress so the curve is testable without a DOM.
 */

/** Short. It is a mode switch, and the window has to feel snapped into place. */
export const LOCK_MS = 300

/**
 * Progress through the travel.
 *
 * A MILD ease-out. The exponent matters: an `outExpo` like `flipMove` uses
 * covers 90% of the distance in the first third, and over a travel this large
 * that reads as a lurch. 2.2 leaves it decisive — well past halfway by
 * mid-beat — while the last third is a settle rather than a stop.
 */
export function lockEase(t: number): number {
  const clamped = Math.min(1, Math.max(0, t))
  return 1 - Math.pow(1 - clamped, 2.2)
}

/** A box, in viewport coordinates. Only what the FLIP needs. */
export type LockBox = { left: number; top: number; width: number; height: number }

/** The FLIP delta that maps the window's NEW box back onto its old one. */
export function lockDelta(from: LockBox, to: LockBox): { dx: number; dy: number; sx: number; sy: number } {
  return {
    dx: from.left - to.left,
    dy: from.top - to.top,
    sx: to.width > 0 ? from.width / to.width : 1,
    sy: to.height > 0 ? from.height / to.height : 1,
  }
}

/** True when the two boxes are close enough that animating between them is noise. */
export function lockIsNoop(d: { dx: number; dy: number; sx: number; sy: number }): boolean {
  return Math.abs(d.dx) < 1 && Math.abs(d.dy) < 1
    && Math.abs(d.sx - 1) < 0.01 && Math.abs(d.sy - 1) < 0.01
}

/**
 * The transform at `progress`: the delta, interpolated toward identity.
 *
 * `base` is whatever transform the element has to end up with — the translate
 * anime.js holds for a dragged window, or '' for a window that is going to be
 * enlarged (the enlarged rule cancels transforms, so it must end with none). The
 * delta is PREPENDED, because the leftmost function is the outermost: `delta base`
 * adjusts the box that `base` already placed, which is the FLIP. Paired with
 * `transform-origin: 0 0`, set by the caller for the duration.
 */
export function lockTransform(
  base: string,
  d: { dx: number; dy: number; sx: number; sy: number },
  progress: number,
): string {
  const p = Math.min(1, Math.max(0, progress))
  const x = d.dx * (1 - p)
  const y = d.dy * (1 - p)
  const sx = d.sx + (1 - d.sx) * p
  const sy = d.sy + (1 - d.sy) * p
  const delta = `translate(${x}px, ${y}px) scale(${sx}, ${sy})`
  const prefix = base.trim()
  return prefix ? `${delta} ${prefix}` : delta
}
