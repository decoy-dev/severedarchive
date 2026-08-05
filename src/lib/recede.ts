/**
 * The animation a window plays as it closes: it is pulled back into the
 * background until it is gone.
 *
 * This replaced a pixel dissolve that clipped the panel apart into blocks. The
 * dissolve read as the window breaking up in place; a close is the window
 * leaving, and depth says that better than decay does. So the panel shrinks
 * toward its own centre and goes with it.
 *
 * Pure, and expressed as a scale/opacity pair per progress rather than as a
 * keyframe list, because the caller has to COMPOSE the scale with whatever
 * translate the drag left on the element — see `FileWindow`. A CSS animation
 * cannot: it would overwrite the inline transform and snap a dragged window back
 * to its cascade position on the first frame of its own close.
 */

/** How long the whole thing takes. Short — it is a close, not a cutscene. */
export const RECEDE_MS = 360

/**
 * How small the panel gets before it is gone. Not 0: at these durations the last
 * few percent are invisible anyway, and stopping short keeps the final frames
 * reading as *distance* rather than as a point collapsing.
 */
export const RECEDE_MIN_SCALE = 0.08

/**
 * How soft it gets, in CSS pixels of blur, and how far the light drops.
 *
 * The diffusion is the point: a panel that only shrinks and fades stays a crisp
 * rectangle the whole way out, which reads as an element being scaled rather
 * than as something going away from you. Losing focus as it goes is what sells
 * the distance — it is the same reason a defocused background reads as depth.
 */
export const RECEDE_MAX_BLUR = 14
export const RECEDE_MIN_BRIGHTNESS = 0.7

/**
 * The window's scale, opacity, blur and brightness at `progress` (0..1).
 *
 * Scale eases IN — slow to leave, then away fast. That asymmetry is what makes
 * it read as being pulled rather than as a menu animating shut; a linear or
 * ease-out shrink looks like the window politely resizing itself.
 *
 * Opacity holds high through the first half and then drops. Fading in step with
 * the scale would give a crossfade with extra steps, which is the failure the
 * dissolve had. The panel has to stay solid long enough to be seen travelling.
 *
 * Blur and brightness, by contrast, are LINEAR in progress, so the softening
 * starts on the first frame rather than waiting for the acceleration. Diffusion
 * that arrives with the fade lands after the eye has stopped following the
 * panel, and the close goes back to looking hard-edged.
 */
export function recedeAt(progress: number): {
  scale: number; opacity: number; blur: number; brightness: number
} {
  const t = Math.min(1, Math.max(0, progress))
  // Quadratic, not cubic: a cubic ease-in holds the panel within a few percent
  // of full size for the first third, which at this duration reads as a lag
  // before the close rather than as the beginning of one.
  const pull = t * t              // ease-in: the acceleration away
  const fade = t * t * t          // later still, so solidity outlasts the travel
  return {
    scale: 1 - (1 - RECEDE_MIN_SCALE) * pull,
    opacity: 1 - fade,
    blur: RECEDE_MAX_BLUR * t,
    brightness: 1 - (1 - RECEDE_MIN_BRIGHTNESS) * t,
  }
}

/**
 * The transform for a receding window, given whatever transform it already
 * carries.
 *
 * `base` is the element's own inline transform — the translate anime.js wrote
 * while it was being dragged, or '' for a window that was never moved. The scale
 * is appended, not substituted, so a window closes from where it stands.
 * `transform-origin` stays at the centre (set in CSS), so it recedes in place
 * instead of sliding toward a corner.
 */
export function recedeTransform(base: string, scale: number): string {
  const prefix = base.trim()
  return prefix ? `${prefix} scale(${scale})` : `scale(${scale})`
}

/**
 * The `filter` for a receding window: the diffusion, as one declaration.
 *
 * Blur before brightness. Filters apply left to right, so blurring first spreads
 * the panel's own light and the multiply then acts on the spread — the other
 * order dims hard edges and then softens them, which keeps a visible rectangle
 * for longer. Nothing else writes `filter` on a window, so this owns the property
 * outright (the glass is a `backdrop-filter`, which is a different one).
 */
export function recedeFilter(blur: number, brightness: number): string {
  return `blur(${blur}px) brightness(${brightness})`
}
