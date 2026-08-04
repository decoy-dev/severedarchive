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
export const DISSOLVE_CELL = 12

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
