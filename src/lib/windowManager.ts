import { isArchiveId } from '../data/archive'

export const MAX_WINDOWS = 3

/**
 * `slot` is the cascade index, not a count. Passing `windows.length` looked
 * equivalent and is not: open A, B, C, close B, open D and the count says 2,
 * which is C's position. The slot space is exactly MAX_WINDOWS wide, so
 * allocating the lowest free index makes a collision impossible rather than
 * unlikely, and a reopened window reuses the vacated position instead of
 * drifting toward the bottom-right corner.
 */
export type WinState = { id: string; x: number; y: number; z: number; slot: number }

export type OpenRefusal = 'cap' | 'unknown'
export type OpenResult = { ok: true; windows: WinState[] } | { ok: false; reason: OpenRefusal }

/** Viewport and the window's true box. Size comes from the file's generated metadata. */
export type Geometry = { area: { w: number; h: number }; size: { w: number; h: number } }

/** Rewrite z so the list is a dense 0..n-1 rank preserving current order. */
const densify = (windows: WinState[]): WinState[] => {
  const order = [...windows].sort((a, b) => a.z - b.z)
  return windows.map((w) => ({ ...w, z: order.findIndex((o) => o.id === w.id) }))
}

export function freeSlot(windows: WinState[]): number {
  const taken = new Set(windows.map((w) => w.slot))
  for (let i = 0; i < MAX_WINDOWS; i++) if (!taken.has(i)) return i
  return -1
}

export function openWindow(windows: WinState[], id: string, geom: Geometry): OpenResult {
  // Validate before mutating state: an id that is not in ARCHIVE used to reach
  // `windows` and render nothing, leaving a phantom holding a slot and a z-rank.
  if (!isArchiveId(id)) return { ok: false, reason: 'unknown' }
  if (windows.some((w) => w.id === id)) return { ok: true, windows: focusWindow(windows, id) }
  if (windows.length >= MAX_WINDOWS) return { ok: false, reason: 'cap' }
  const slot = freeSlot(windows)
  if (slot < 0) return { ok: false, reason: 'cap' }
  // Allocation and positioning are one step so the wrong index cannot be passed.
  const { x, y } = cascadePosition(slot, geom.area, geom.size)
  return { ok: true, windows: [...windows, { id, x, y, z: windows.length, slot }] }
}

export function focusWindow(windows: WinState[], id: string): WinState[] {
  if (!windows.some((w) => w.id === id)) return windows
  // push the target above everything, then re-rank so z stays dense
  return densify(windows.map((w) => (w.id === id ? { ...w, z: Infinity } : w)))
}

export function closeWindow(windows: WinState[], id: string): WinState[] {
  // The slot frees implicitly: it is held by the record, and the record is gone.
  return densify(windows.filter((w) => w.id !== id))
}

/** Title bar height and the glass border, the only chrome between body and root. */
export const FW_TITLEBAR_H = 40
export const FW_BORDER = 2

/**
 * The true frame, in one place, because two places would disagree.
 *
 * Aspect ratio belongs to `.fw-body`, never to the window root — the root
 * carrying it is what produced the pillarboxing the rulings forbid. So the root
 * is width-driven and its height falls out of the body: the media box fits
 * within the viewport minus chrome and a margin, and the window is exactly
 * `FW_TITLEBAR_H + FW_BORDER` taller than the media.
 *
 * `bodyWidthCss` is the same expression in CSS units, so the spawn maths and the
 * rendered box cannot drift apart. Read it as: no wider than half the viewport,
 * no wider than 720px, and no taller than 62vh of *media*.
 */
export function windowBox(ar: number, area: { w: number; h: number }): { w: number; h: number } {
  const w = Math.min(area.w * 0.52, 720, ar * area.h * 0.62 + FW_BORDER)
  return { w, h: (w - FW_BORDER) / ar + FW_TITLEBAR_H + FW_BORDER }
}

export const windowWidthCss = (ar: number): string =>
  `min(52vw, 720px, calc(${ar} * 62vh + ${FW_BORDER}px))`

const STEP_X = 28
const STEP_Y = 24

export function cascadePosition(
  slot: number,
  area: { w: number; h: number },
  size: { w: number; h: number },
): { x: number; y: number } {
  const maxX = Math.max(0, area.w - size.w)
  const maxY = Math.max(0, area.h - size.h)
  // start a third of the way in so the first window doesn't hug the corner
  const baseX = Math.min(maxX, Math.round(maxX / 3))
  const baseY = Math.min(maxY, Math.round(maxY / 3))
  return {
    x: Math.max(0, Math.min(maxX, baseX + slot * STEP_X)),
    y: Math.max(0, Math.min(maxY, baseY + slot * STEP_Y)),
  }
}
