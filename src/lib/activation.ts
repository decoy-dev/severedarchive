/**
 * What "activating a file" means. One function, resolved by viewport width, not
 * by which surface called — that is the whole point of it existing.
 *
 * Three surfaces (explorer rows, grid tiles, the mobile row) must not grow three
 * selection models, and none of them gets to decide what a click does. They call
 * `select` or `activate`; this decides the rest.
 */
export type ActivationVia = 'row' | 'preview' | 'tile' | 'keyboard'

export type ViewMode = 'list' | 'grid'

/** Deliberately a width query, not a pointer-capability query (binding ruling 3). */
export const DESKTOP_MIN_WIDTH = 861

export type ActivationEffects = {
  setView: (v: ViewMode) => void
  /** Desktop's opener, or null when no desktop is mounted. */
  open: ((id: string) => void) | null
}

/**
 * Called after `select(id)` has already run — activation always selects first.
 * That rule closes a hole the 861px width ruling created: on a touch tablet
 * there is no hover, so `onMouseEnter` never fires, and without it the backdrop
 * and preview would never track the user's actual choice.
 */
export function applyActivation(
  id: string,
  via: ActivationVia,
  width: number,
  fx: ActivationEffects,
): void {
  // Below the split, selection alone drives the mobile primary player and no
  // window is ever created.
  if (width < DESKTOP_MIN_WIDTH) return
  // A tile click leaves the wall of posters before the window appears, so the
  // window does not open behind a grid the user is still looking at.
  if (via === 'tile') fx.setView('list')
  fx.open?.(id)
}

const VIEW_KEY = 'severedarchive.archiveView'

/** `stack` is the legacy value; the view it named is now called `list`. */
export function parseView(raw: string | null): ViewMode {
  return raw === 'grid' ? 'grid' : 'list'
}

export function readView(): ViewMode {
  try { return parseView(localStorage.getItem(VIEW_KEY)) } catch { return 'list' }
}

export function writeView(v: ViewMode): void {
  try { localStorage.setItem(VIEW_KEY, v) } catch { /* private mode */ }
}
