export const MAX_WINDOWS = 3

export type WinState = { id: string; x: number; y: number; z: number }
export type OpenResult = { ok: true; windows: WinState[] } | { ok: false; reason: 'cap' }

/** Rewrite z so the list is a dense 0..n-1 rank preserving current order. */
const densify = (windows: WinState[]): WinState[] => {
  const order = [...windows].sort((a, b) => a.z - b.z)
  return windows.map((w) => ({ ...w, z: order.findIndex((o) => o.id === w.id) }))
}

export function openWindow(windows: WinState[], id: string, pos: { x: number; y: number }): OpenResult {
  if (windows.some((w) => w.id === id)) return { ok: true, windows: focusWindow(windows, id) }
  if (windows.length >= MAX_WINDOWS) return { ok: false, reason: 'cap' }
  return { ok: true, windows: [...windows, { id, x: pos.x, y: pos.y, z: windows.length }] }
}

export function focusWindow(windows: WinState[], id: string): WinState[] {
  if (!windows.some((w) => w.id === id)) return windows
  // push the target above everything, then re-rank so z stays dense
  return densify(windows.map((w) => (w.id === id ? { ...w, z: Infinity } : w)))
}

export function closeWindow(windows: WinState[], id: string): WinState[] {
  return densify(windows.filter((w) => w.id !== id))
}

const STEP_X = 28
const STEP_Y = 24

export function cascadePosition(
  count: number,
  area: { w: number; h: number },
  size: { w: number; h: number },
): { x: number; y: number } {
  const maxX = Math.max(0, area.w - size.w)
  const maxY = Math.max(0, area.h - size.h)
  // start a third of the way in so the first window doesn't hug the corner
  const baseX = Math.min(maxX, Math.round(maxX / 3))
  const baseY = Math.min(maxY, Math.round(maxY / 3))
  return {
    x: Math.max(0, Math.min(maxX, baseX + count * STEP_X)),
    y: Math.max(0, Math.min(maxY, baseY + count * STEP_Y)),
  }
}
