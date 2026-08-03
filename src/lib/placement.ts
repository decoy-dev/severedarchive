import type { Placement } from './mediaController'
import type { PerfTier } from './perfTier'

/**
 * The desired placement map — the single statement of where every media node
 * should be, and which one of them is the focus. Pure, so the policy can be
 * tested without a DOM: `Desktop` does nothing with the result but hand it to
 * `mediaController.reconcile`.
 *
 * Two surfaces are named for the selected file, `primary` and `preview`, and
 * exactly one of them is ever mounted (mobile renders the row, desktop renders
 * the explorer). `resolveDesired` drops placements naming a slot that is not
 * registered, so emitting both is how this stays free of a second copy of the
 * breakpoint — the mounted surface wins by existing, not by being asked for.
 *
 * The focus target is the mobile primary player or the top window, per §4.7:
 * the primary player *is* the mobile equivalent of a focused window.
 */
export function desiredPlacement(input: {
  selectedId: string
  windowIds: readonly string[]
  /** the top window, or null — meaningless below the desktop split */
  focusedWindowId: string | null
  isDesktop: boolean
  tier: PerfTier
}): { desired: Placement[]; focus: string | null } {
  const { selectedId, windowIds, focusedWindowId, isDesktop, tier } = input
  const focus = isDesktop ? focusedWindowId : selectedId

  // Lite is one decode, and it belongs to the surface the viewer is actually
  // looking at (§4.2). Everything else falls back to its poster, which each
  // surface already renders underneath its slot — so "no video here" needs no
  // state anywhere, only the absence of a placement.
  //
  // The ruling this encodes: the primary/focused surface always gets a real
  // <video>, at every tier. Perf tier changes which encode and how many
  // decodes, never whether the content exists.
  if (tier === 'lite') {
    if (focus === null) return { desired: [], focus: null }
    const slot = isDesktop ? (`window:${focus}` as const) : 'primary'
    return { desired: [{ slot, fileId: focus }], focus }
  }

  return {
    desired: [
      { slot: 'preview', fileId: selectedId },
      { slot: 'primary', fileId: selectedId },
      ...windowIds.map((id) => ({ slot: `window:${id}` as const, fileId: id })),
    ],
    focus,
  }
}
