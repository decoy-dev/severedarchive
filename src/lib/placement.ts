import type { Placement } from './mediaController'
import type { PerfTier } from './perfTier'

/**
 * The desired placement map — the single statement of where every media node
 * should be, and which one of them is the focus. Pure, so the policy can be
 * tested without a DOM: `Desktop` does nothing with the result but hand it to
 * `mediaController.reconcile`.
 *
 * The selected file is named for the mobile `primary` slot only. The desktop
 * explorer holds no media at all — its pane is a standby prompt, and nothing
 * decodes there — so on desktop the selection drives the backdrop and the
 * metadata readout and nothing else. `resolveDesired` drops placements naming
 * an unregistered slot, so the mobile placement is simply inert on desktop and
 * this stays free of a second copy of the breakpoint.
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
  /**
   * Whether an id is a still rather than a clip.
   *
   * A still is never placed, and that single omission is the whole of photo
   * support in the media layer. `mediaController` exists to keep a `<video>`
   * PLAYING across a reparent — that is the only reason React is not allowed to
   * own those elements. An image has no playback state to lose, so it needs none
   * of that machinery, and giving it a controller node would mean a `<video>`
   * pointed at a JPEG: a broken element in every slot.
   *
   * So a surface showing a still renders its own `<img>` and React owns it
   * outright. Defaults to "nothing is a still", which is what every existing
   * caller means.
   */
  isStill?: (id: string) => boolean
}): { desired: Placement[]; focus: string | null } {
  const { selectedId, windowIds, focusedWindowId, isDesktop, tier, isStill = () => false } = input
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
    if (focus === null || isStill(focus)) return { desired: [], focus: null }
    const slot = isDesktop ? (`window:${focus}` as const) : 'primary'
    return { desired: [{ slot, fileId: focus }], focus }
  }

  return {
    desired: [
      ...(isStill(selectedId) ? [] : [{ slot: 'primary' as const, fileId: selectedId }]),
      ...windowIds.filter((id) => !isStill(id)).map((id) => ({ slot: `window:${id}` as const, fileId: id })),
    ],
    // A still cannot be the playback focus — there is nothing to play, and naming
    // it would have the director hold a focus slot against an element that does
    // not exist, muting whatever is actually audible.
    focus: focus !== null && isStill(focus) ? null : focus,
  }
}
