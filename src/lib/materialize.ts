/**
 * The animation a window plays as it opens: the panel materializes — a grid of
 * cells resolves out of nothing, each stepping up through quantized density
 * levels with a little grain, until the whole window is solid. A pixel-sort
 * settling into place, in the stepped/dithered vocabulary the lock-on and the
 * terminal already speak.
 *
 * It reveals the REAL panel. The whole effect is one property: an alpha mask
 * on the window root, rewritten per frame. The grid is two hard-stop linear
 * gradients — one of columns, one of rows — composited with `intersect`, so a
 * cell's alpha is the product of its column's and its row's. Two short
 * gradient strings buy columns × rows cells; a per-cell gradient would be an
 * order of magnitude more stops for the same picture. No clone, no canvas, no
 * snapshot — the media controller's node, the titlebar, the glass are all
 * simply behind the mask, so whatever they are doing (a video arriving via
 * flipMove, an image still decoding) shows through as it happens.
 *
 * The mask is also why this cannot fight the window's other animations:
 * `transform` belongs to anime's drag and to the recede/lock-on (`!important`
 * writes), `opacity` and `filter` to the recede. Nothing else in the app
 * writes a mask on a window, so this owns the property outright, and at
 * progress 1 every column and every row is exactly 1 — a fully-opaque mask is
 * pixel-identical to no mask, so removing it at the end cannot jump. Nothing
 * else about the panel is touched either — the glass blur stays on the whole
 * way through, so there is no property handback at the end and therefore
 * nothing to pop.
 *
 * The cell math is pure and expressed per progress, like `recede` and
 * `lockOn`, so the curve is testable without a DOM.
 */

import { animate, type JSAnimation } from 'animejs'
import { prefersReducedMotion } from './perfTier'

/**
 * How long the whole thing takes. An open, not a cutscene — long enough that
 * the grid is seen resolving, short enough that a viewer who opens three
 * files in a row is never waiting on one.
 */
export const MATERIALIZE_MS = 520

/**
 * The grid. At cascade size (~600–800px wide) this is cells of roughly
 * 25–35px on a side — granular enough to read as the display filling in
 * point by point rather than as opacity bars sweeping across, coarse enough
 * that each cell is still a visible block of the picture.
 */
export const MATERIALIZE_COLS = 24
export const MATERIALIZE_ROWS = 14

/** How many density steps a lane climbs through. The dither ladder. */
const LEVELS = 5

/**
 * The slowest lane starts when the overall beat is this far along. Spread
 * wide enough that the stagger reads as disorder (the "sort"), narrow enough
 * that every lane still gets most of the duration to climb its ladder.
 */
const MAX_DELAY = 0.45

/** How hard the grain bites, at the start. Fades linearly to 0 by the end. */
const GRAIN_DEPTH = 0.35

/**
 * The grain's clock: how many discrete flicker frames fit in the beat. ~43ms
 * a frame at 520ms — the same stutter-as-texture rate as the lock-on's
 * steps(9), and deterministic in progress so a replayed progress value is the
 * same picture.
 */
const GRAIN_STEPS = 24

/**
 * Rows hash from a different neighbourhood than columns, so row i and column
 * i never share a delay — a shared seed puts a visible diagonal in the grid.
 */
const ROW_SEED = 517.13

/**
 * Deterministic noise in [0, 1). The classic sin-fract hash — not random,
 * which is the point: the stagger is a property of the lane index, so every
 * frame at a given progress is the same frame, and there is no RNG state to
 * carry or to differ between the pure math and a test of it.
 */
const hash = (n: number): number => {
  const s = Math.sin(n) * 43758.5453
  return s - Math.floor(s)
}

/**
 * One lane's mask alpha at `progress` (0..1). A lane is a column or a row;
 * a cell's alpha is the product of its two lanes' (that is what `intersect`
 * computes), which is where the per-cell variation comes from.
 *
 * Each lane waits out its own hashed delay, then climbs: its local progress
 * is quantized onto the LEVELS ladder (the dither), and a per-lane,
 * per-grain-frame noise bites chunks OUT of that (the grain) — subtractive
 * only, and scaled by (1 - progress), so the flicker can never make a lane
 * more solid than its ladder says and dies out completely by the end.
 *
 * Exactly 1 at progress 1, for every lane, by construction: local progress
 * reaches 1 regardless of delay, the ladder's top rung is 1, and the grain's
 * (1 - p) factor is 0. The final frame is a no-op mask.
 */
export function laneAlpha(lane: number, progress: number): number {
  const p = Math.min(1, Math.max(0, progress))
  const delay = hash(lane * 12.9898 + 78.233) * MAX_DELAY
  const local = Math.min(1, Math.max(0, (p - delay) / (1 - delay)))
  const rung = Math.round(local * LEVELS) / LEVELS
  const grain = hash(lane * 7.31 + Math.floor(p * GRAIN_STEPS) * 3.7) * GRAIN_DEPTH * (1 - p)
  return Math.min(1, Math.max(0, rung - grain))
}

/**
 * One gradient of `lanes` hard-stop bands along `angle`, offset into the hash
 * space by `seed`. Hard stops rather than a smooth ramp because the cells ARE
 * the effect — a ramp is a wipe, which is the soft thing this deliberately is
 * not.
 */
function laneGradient(progress: number, lanes: number, angle: string, seed: number): string {
  const stops: string[] = []
  for (let i = 0; i < lanes; i++) {
    const from = ((i / lanes) * 100).toFixed(2)
    const to = (((i + 1) / lanes) * 100).toFixed(2)
    stops.push(`rgba(0,0,0,${laneAlpha(i + seed, progress).toFixed(3)}) ${from}% ${to}%`)
  }
  return `linear-gradient(${angle}, ${stops.join(', ')})`
}

/**
 * The whole mask at `progress`: the column layer and the row layer, as one
 * comma-separated image list for `mask-image`. The caller composites them
 * with `intersect` (alpha multiply). A browser that draws multiple mask
 * layers but not `intersect` unions them instead — the grid degrades to
 * bands, earlier frames run a little more revealed, and the end state is
 * still exact, because a union of two fully-opaque layers is fully opaque.
 */
export function materializeMask(
  progress: number,
  cols: number = MATERIALIZE_COLS,
  rows: number = MATERIALIZE_ROWS,
): string {
  return `${laneGradient(progress, cols, '90deg', 0)}, ${laneGradient(progress, rows, '0deg', ROW_SEED)}`
}

/**
 * Plays the arrival on a window root. Returns a cancel that is idempotent and
 * safe after completion: it stops the animation and strips every property this
 * function ever wrote, immediately — which is what a close landing mid-arrival
 * needs, because the recede is about to animate this same element and a
 * half-revealed mask under it would read as the window tearing.
 *
 * Call it from a LAYOUT effect: progress 0 is written synchronously, before
 * paint, so the window's first painted frame is already masked. Deferring even
 * one frame paints the full panel first — a flash of the end state before the
 * materialization, which is the same bug the lock-on's pre-paint write exists
 * to prevent.
 *
 * Writes the mask properties (`mask-image`/`mask-composite` and their
 * -webkit- forms; `-webkit-mask-composite` speaks the legacy `source-in`
 * dialect for the WebKits that never adopted the standard keywords) and
 * NOTHING else — never `transform` (the drag's, the recede's, the lock-on's),
 * never `opacity` or `filter` (the recede's), no data attribute, no class.
 * The panel's settled appearance, glass blur included, holds throughout; the
 * end of the animation changes nothing on screen.
 *
 * Reduced motion: nothing plays and nothing is written. The window is simply
 * there, the same way the recede and the lock-on simply happen.
 */
export function playMaterialize(el: HTMLElement): () => void {
  if (prefersReducedMotion()) return () => {}

  const write = (p: number) => {
    const mask = materializeMask(p)
    el.style.setProperty('mask-image', mask)
    el.style.setProperty('-webkit-mask-image', mask)
  }
  const clear = () => {
    el.style.removeProperty('mask-image')
    el.style.removeProperty('-webkit-mask-image')
    el.style.removeProperty('mask-composite')
    el.style.removeProperty('-webkit-mask-composite')
  }

  // The composite mode is constant; only the images are rewritten per frame.
  el.style.setProperty('mask-composite', 'intersect')
  el.style.setProperty('-webkit-mask-composite', 'source-in')
  write(0)

  const state = { p: 0 }
  const anim: JSAnimation = animate(state, {
    p: 1,
    duration: MATERIALIZE_MS,
    // Mild ease-out on the master clock; the character comes from the per-lane
    // delays and the dither ladder, not from the curve. Ease-out means the
    // early frames (the most visible ones) get the most motion.
    ease: 'outQuad',
    onUpdate: () => write(state.p),
    onComplete: clear,
  })

  let done = false
  return () => {
    if (done) return
    done = true
    anim.cancel()
    clear()
  }
}
