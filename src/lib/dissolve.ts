/**
 * The pixel dissolve a window plays as it closes.
 *
 * A cell is either gone or it is not — no partial alpha. That is what makes it
 * read as a signal breaking up rather than as a fade: the window comes apart
 * into blocks and the blocks go out, which is the same logic as the title bar's
 * pulse dither and for the same reason.
 *
 * Pure, and the noise is supplied rather than generated, so the order cells go
 * out in is fixed for a given window and testable.
 */

/** Cell edge in CSS pixels. Coarse enough to read as pixels at window scale. */
export const DISSOLVE_CELL = 18

/** How long the whole thing takes. Short — it is a close, not a cutscene. */
export const DISSOLVE_MS = 420

/**
 * True when this cell has gone.
 *
 * The threshold runs ahead of `progress` toward the bottom-right, so the window
 * comes apart from one corner rather than uniformly — a uniform dissolve at
 * these durations reads as a crossfade with extra steps. `bias` is how much of
 * the effect that sweep accounts for; the rest is the cell's own noise, which
 * is what keeps the edge ragged instead of a moving diagonal line.
 */
export function cellGone(progress: number, noise: number, sweep: number, bias = 0.55): boolean {
  if (progress <= 0) return false
  if (progress >= 1) return true
  // Each cell's own moment to go: mostly its position along the sweep, partly
  // its noise. Scaled into 0..1 so the last cell leaves exactly at the end.
  const threshold = sweep * bias + noise * (1 - bias)
  return progress > threshold
}

/**
 * Where a cell sits along the sweep, 0 at the first corner and 1 at the last.
 * Normalised by the grid, so the sweep takes the same shape whatever the
 * window's aspect ratio.
 */
export function sweepAt(col: number, row: number, cols: number, rows: number): number {
  if (cols <= 1 && rows <= 1) return 0
  const x = cols > 1 ? col / (cols - 1) : 0
  const y = rows > 1 ? row / (rows - 1) : 0
  return (x + y) / 2
}

/**
 * The surviving region as a `clip-path` path: the window's rectangle with a hole
 * where every gone cell was.
 *
 * A clip is the only thing that actually REMOVES those squares. Drawing over
 * them — with any colour, at any blend mode — leaves a rectangle standing that
 * fills in as it goes, which reads as the opposite of coming apart. CSS has no
 * `destination-out` for `mix-blend-mode` (that is a canvas compositing
 * operator, not a blend mode), so an overlay cannot punch through either. With
 * `evenodd`, an outer rectangle plus inner rectangles gives holes.
 */
export function dissolveClipPath(
  progress: number,
  width: number,
  height: number,
  noise: Float32Array | readonly number[],
): string {
  const cols = Math.max(1, Math.ceil(width / DISSOLVE_CELL))
  const rows = Math.max(1, Math.ceil(height / DISSOLVE_CELL))
  const parts: string[] = [`M0 0H${width}V${height}H0Z`]
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const n = noise[row * cols + col] ?? 0
      if (!cellGone(progress, n, sweepAt(col, row, cols, rows))) continue
      const x = col * DISSOLVE_CELL
      const y = row * DISSOLVE_CELL
      // Clamped to the box, or the last row and column punch past the window and
      // the clip stops matching its own outer rectangle.
      const w = Math.min(DISSOLVE_CELL, width - x)
      const h = Math.min(DISSOLVE_CELL, height - y)
      if (w <= 0 || h <= 0) continue
      parts.push(`M${x} ${y}h${w}v${h}h${-w}Z`)
    }
  }
  return `path(evenodd, "${parts.join('')}")`
}
