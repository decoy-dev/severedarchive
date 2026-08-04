/**
 * The shape of the pulse that crosses the title bar when the session dot
 * blinks: a band of light travelling out from the dot, breaking into grain at
 * its edges, sloshing rather than sweeping.
 *
 * Pure — it answers "how bright is this cell, this far from the source, this
 * far into the pulse" and nothing else. The canvas that draws it owns the
 * clock and the pixels. That split is the only reason any of this is testable:
 * the interesting parts are the falloff and the front, not the drawing.
 */
export type PulseCell = {
  /** distance from the source, in pixels */
  distance: number
  /** 0→1 through the pulse */
  progress: number
  /** how far the front travels by the end, in pixels */
  reach: number
  /** 0→1 noise for this cell, stable per cell so the grain does not crawl */
  noise: number
  /** the cell's vertical offset from the bar's centre line, 0→1 */
  spread: number
}

/**
 * The distance over which the light falls off behind the front, in pixels.
 *
 * There is deliberately NO hard back edge. The dot sits near the right edge of
 * the bar, so the strip to its right is reached in the first instant; with a
 * band of any finite width, the front moves on and that side goes dark while
 * the left is still lit — which reads as the effect cutting off prematurely on
 * the right, because that is exactly what it is. Everything behind the front is
 * now lit, dimming with distance, and the whole field goes out together as the
 * pulse spends itself. A level dropping, not a ring passing.
 */
export const BAND = 700

/**
 * The liquid part. The front does not travel at a constant rate: it leaves
 * fast, slows as it spends itself, and the trailing edge catches up — which is
 * what makes it read as a body of light with mass rather than an expanding
 * ring. `1 - (1-p)^2` is the ease; the wobble is a slow sine across the front so
 * the edge is never a clean arc.
 */
export function frontAt(progress: number, reach: number): number {
  const eased = 1 - (1 - progress) * (1 - progress)
  return eased * reach
}

/**
 * Cell brightness, 0→1.
 *
 * Three factors multiplied: the band (how close this cell is to the front),
 * the life of the pulse (it fades as it spends itself), and the grain. The
 * grain is a threshold rather than a multiplier — a cell is lit or it is not,
 * with the odds set by brightness — because that is what makes it read as
 * pixels rather than as a soft gradient.
 */
export function pulseCell({ distance, progress, reach, noise, spread }: PulseCell): number {
  if (progress <= 0 || progress >= 1) return 0
  // The surface of the wave, not a clean arc: the leading edge undulates as it
  // travels, so different heights of the bar are reached at slightly different
  // moments. This is the whole of the "liquid" — a circle expanding at a
  // constant rate reads as a radar sweep, and this does not.
  const wobble = 1 + 0.09 * Math.sin(spread * 5.5 + progress * 7)
  const front = frontAt(progress, reach) * wobble

  // Behind the front only: nothing lights up before the wave arrives.
  const behind = front - distance
  if (behind < 0) return 0

  // Brightest just behind the front, falling off with distance but never
  // cutting to nothing — see BAND. What ends the pulse is `life`, not this.
  const band = 1 / (1 + behind / BAND)
  // The pulse spends itself, but holds its strength through the first half
  // rather than decaying from the moment it leaves — otherwise it is already
  // dim by the time it reaches the middle of the bar.
  const life = 1 - progress * progress
  // A slight vertical falloff so the light has a body rather than a hard
  // rectangular edge — but only slight: this is meant to FILL the title bar
  // top to bottom, washing behind FILE SYSTEM and SESSION OPEN alike, not to
  // run along it as a thin band.
  const pool = 1 - spread * 0.18

  // And it fades with absolute distance from the dot, so the far end of the bar
  // is dimmer than the near end even at the moment the wave arrives there — the
  // light is spending itself as it travels, not just as time passes.
  const spent = 1 - 0.55 * Math.min(1, distance / reach)

  const brightness = Math.pow(band, 1.4) * life * pool * spent
  // Dither: the odds of a cell lighting are its own brightness, so the wave is
  // solid at its core and dissolves into scattered pixels at its edges rather
  // than fading to a clean grey. Below 1 on purpose: it thins the whole field,
  // which is what keeps this a suggestion of light moving under the chrome
  // rather than a lit panel.
  return noise < brightness * 0.8 ? brightness : 0
}
