/**
 * The horizontal band the About mark centres itself in.
 *
 * Pulled out of the component because getting it wrong is invisible in one
 * layout and catastrophic in the other, and the difference is pure arithmetic
 * that deserves tests rather than another screenshot.
 *
 * Beside the copy, the band is the gap the copy leaves: from its right edge to
 * the inside of the panel. Below the copy — the one-column layout — there is no
 * gap, and the copy's right edge IS the panel's right edge, so using it would
 * put the band's centre at the panel's corner and shove the mark off the edge.
 * There the band is simply the element's own box.
 */
export type Box = { x: number; right: number; y: number; bottom: number }

export type Band = { left: number; right: number }

/**
 * True when `sibling` sits to the LEFT of `host` rather than above it.
 *
 * Both conditions are needed. Ending before the host starts is what makes it a
 * neighbour and not a block above; overlapping vertically is what rules out a
 * stacked sibling that happens to be narrow. The 1px tolerance absorbs
 * sub-pixel grid rounding.
 */
export function isBeside(host: Box, sibling: Box): boolean {
  return sibling.right <= host.x + 1 && sibling.bottom > host.y + 1
}

/**
 * How far the sibling's visible content actually reaches.
 *
 * Not its own box. A grid track is as wide as the grid gives it, and the copy's
 * blocks are `max-width` capped well inside theirs — measured at 2000px, the
 * track ended at 1055px and the blocks at 664px. Centring in the gap that starts
 * at 1055 puts the mark ~195px right of where the eye puts it, which is exactly
 * the offset that survived five rounds of fixes: every measurement confirmed the
 * placement because every measurement used the same track edge the placement did.
 *
 * The children's edges are what someone actually sees, so they define the gap.
 * Clamped to the sibling's box: a child overflowing its parent would otherwise
 * report a gap that starts past the panel.
 */
export function contentRight(sibling: Box, children: readonly Box[]): number {
  let right = -Infinity
  for (const child of children) if (child.right > right) right = child.right
  if (right === -Infinity) return sibling.right
  return Math.min(right, sibling.right)
}

export function inkBand(host: Box, sibling: Box | null, panelRight: number | null): Band {
  if (sibling && panelRight !== null && isBeside(host, sibling)) {
    // Guard against a panel edge inside the sibling — nothing produces that
    // today, but a band of negative width would place the mark at a nonsense
    // coordinate rather than merely an imperfect one.
    if (panelRight > sibling.right) return { left: sibling.right, right: panelRight }
  }
  return { left: host.x, right: host.right }
}

export const bandCentre = (band: Band): number => (band.left + band.right) / 2
