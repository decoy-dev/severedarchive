import { describe, it, expect } from 'vitest'
import { openWindow, focusWindow, closeWindow, cascadePosition, freeSlot, windowBox, windowWidthCss, FW_TITLEBAR_H, FW_BORDER, MAX_WINDOWS } from './windowManager'
import type { WinState, Geometry } from './windowManager'

const GEOM: Geometry = { area: { w: 1440, h: 900 }, size: { w: 640, h: 360 } }

/** Every id used here must exist in ARCHIVE — openWindow validates. */
const IDS = ['file01', 'file02', 'file03', 'file04', 'file05'] as const

const openAll = (ids: readonly string[], geom: Geometry = GEOM): WinState[] => {
  let ws: WinState[] = []
  for (const id of ids) {
    const r = openWindow(ws, id, geom)
    if (!r.ok) throw new Error(`unreachable: ${id} refused (${r.reason})`)
    ws = r.windows
  }
  return ws
}

describe('openWindow', () => {
  it('opens onto an empty desktop with the top z and slot 0', () => {
    const r = openWindow([], 'file01', GEOM)
    expect(r.ok).toBe(true)
    if (!r.ok) throw new Error('unreachable')
    expect(r.windows).toHaveLength(1)
    expect(r.windows[0]).toMatchObject({ id: 'file01', z: 0, slot: 0 })
  })

  it('gives each new window the top z', () => {
    const ws = openAll(['file01', 'file02'])
    expect(ws.find((w) => w.id === 'file02')!.z).toBe(1)
    expect(ws.find((w) => w.id === 'file01')!.z).toBe(0)
  })

  it('focuses instead of duplicating when the file is already open', () => {
    const ws = openAll(['file01', 'file02'])
    const again = openWindow(ws, 'file01', GEOM)
    if (!again.ok) throw new Error('unreachable')
    expect(again.windows).toHaveLength(2)
    expect(again.windows.find((w) => w.id === 'file01')!.z).toBe(1)
    // reopening must not move the window that is already there
    expect(again.windows.find((w) => w.id === 'file01')!.slot).toBe(0)
  })

  it('refuses the fourth window', () => {
    const ws = openAll(IDS.slice(0, 3))
    expect(ws).toHaveLength(MAX_WINDOWS)
    expect(openWindow(ws, 'file04', GEOM)).toEqual({ ok: false, reason: 'cap' })
  })

  it('focuses rather than refusing when re-opening an existing id at the cap', () => {
    const ws = openAll(IDS.slice(0, 3))
    expect(ws.find((w) => w.id === 'file01')!.z).toBe(0)
    const again = openWindow(ws, 'file01', GEOM)
    if (!again.ok) throw new Error('unreachable')
    expect(again.windows).toHaveLength(MAX_WINDOWS)
    expect(again.windows.find((w) => w.id === 'file01')!.z).toBe(MAX_WINDOWS - 1)
  })

  it('refuses an id that is not in the archive, without mutating state', () => {
    const ws = openAll(['file01'])
    const r = openWindow(ws, 'file99', GEOM)
    expect(r).toEqual({ ok: false, reason: 'unknown' })
    const empty = openWindow([], '', GEOM)
    expect(empty).toEqual({ ok: false, reason: 'unknown' })
  })
})

describe('slot allocation', () => {
  it('reuses the vacated slot rather than drifting (§4.3)', () => {
    const abc = openAll(['file01', 'file02', 'file03'])
    expect(abc.map((w) => w.slot)).toEqual([0, 1, 2])

    const afterClose = closeWindow(abc, 'file02')
    expect(freeSlot(afterClose)).toBe(1)

    const withD = openWindow(afterClose, 'file04', GEOM)
    if (!withD.ok) throw new Error('unreachable')
    expect(withD.windows.find((w) => w.id === 'file04')!.slot).toBe(1)

    // three live windows, three distinct positions
    const points = withD.windows.map((w) => `${w.x},${w.y}`)
    expect(new Set(points).size).toBe(3)

    // and again after a second close/open cycle
    const afterCloseA = closeWindow(withD.windows, 'file01')
    const withE = openWindow(afterCloseA, 'file05', GEOM)
    if (!withE.ok) throw new Error('unreachable')
    expect(withE.windows.find((w) => w.id === 'file05')!.slot).toBe(0)
    expect(new Set(withE.windows.map((w) => `${w.x},${w.y}`)).size).toBe(3)
  })

  it('never hands out a slot that is already held', () => {
    const ws = openAll(['file01', 'file02', 'file03'])
    expect(new Set(ws.map((w) => w.slot)).size).toBe(MAX_WINDOWS)
    expect(freeSlot(ws)).toBe(-1)
  })

  it('positions a window inside the desktop for a portrait box too', () => {
    // 406x720 is file08's real encode; the old caller fabricated 720x405 for
    // every file and could spawn a tall window past the viewport bottom.
    const geom: Geometry = { area: { w: 1440, h: 900 }, size: { w: 406, h: 720 } }
    for (let slot = 0; slot < MAX_WINDOWS; slot++) {
      const p = cascadePosition(slot, geom.area, geom.size)
      expect(p.x).toBeGreaterThanOrEqual(0)
      expect(p.y).toBeGreaterThanOrEqual(0)
      expect(p.x + geom.size.w).toBeLessThanOrEqual(geom.area.w)
      expect(p.y + geom.size.h).toBeLessThanOrEqual(geom.area.h)
    }
  })
})

describe('focusWindow', () => {
  it('raises the target to the top and keeps z dense', () => {
    const ws = openAll(['file01', 'file02', 'file03'])
    const focused = focusWindow(ws, 'file01')
    expect(focused.find((w) => w.id === 'file01')!.z).toBe(2)
    expect(focused.find((w) => w.id === 'file02')!.z).toBe(0)
    expect(focused.find((w) => w.id === 'file03')!.z).toBe(1)
  })

  it('leaves slots alone when focus changes', () => {
    const ws = openAll(['file01', 'file02', 'file03'])
    const focused = focusWindow(ws, 'file01')
    for (const w of focused) expect(w.slot).toBe(ws.find((o) => o.id === w.id)!.slot)
  })

  it('is a no-op for an unknown id', () => {
    const ws = openAll(['file01'])
    expect(focusWindow(ws, 'file99')).toEqual(ws)
  })
})

describe('closeWindow', () => {
  it('removes the window and re-densifies z', () => {
    const ws = openAll(['file01', 'file02', 'file03'])
    const after = closeWindow(ws, 'file02')
    expect(after).toHaveLength(2)
    expect(after.find((w) => w.id === 'file01')!.z).toBe(0)
    expect(after.find((w) => w.id === 'file03')!.z).toBe(1)
  })

  it('is a no-op for an id that is not open', () => {
    const ws = openAll(['file01', 'file02', 'file03'])
    expect(closeWindow(ws, 'file99')).toEqual(ws)
  })
})

describe('cascadePosition', () => {
  it('offsets each successive slot down and right', () => {
    const area = { w: 1440, h: 900 }
    const size = { w: 640, h: 360 }
    const first = cascadePosition(0, area, size)
    const second = cascadePosition(1, area, size)
    expect(second.x).toBe(first.x + 28)
    expect(second.y).toBe(first.y + 24)
  })

  it('never positions a window outside the area', () => {
    const area = { w: 500, h: 400 }
    const size = { w: 480, h: 380 }
    for (let i = 0; i < 6; i++) {
      const p = cascadePosition(i, area, size)
      expect(p.x).toBeGreaterThanOrEqual(0)
      expect(p.y).toBeGreaterThanOrEqual(0)
      expect(p.x + size.w).toBeLessThanOrEqual(area.w)
      expect(p.y + size.h).toBeLessThanOrEqual(area.h)
    }
  })
})

describe('windowBox', () => {
  const AREA = { w: 1440, h: 900 }
  const CASES: [string, number][] = [
    ['16:9', 1280 / 720],
    ['9:16-ish', 406 / 720],
    ['1:1', 720 / 720],
    ['3:4', 540 / 720],
  ]

  it('is exactly the media box plus the title bar and the border', () => {
    for (const [label, ar] of CASES) {
      const { w, h } = windowBox(ar, AREA)
      const bodyH = h - FW_TITLEBAR_H - FW_BORDER
      const bodyW = w - FW_BORDER
      expect(bodyW / bodyH, `${label} body ratio`).toBeCloseTo(ar, 6)
    }
  })

  it('keeps every aspect class inside the viewport once cascaded', () => {
    // The invariant §4.5 states: a freshly spawned window is fully within the
    // desktop before any interaction. The old code fed cascadePosition a
    // fabricated 16:9 {720,405} box, so a portrait window was clamped against
    // the wrong shape and spawned overflowing the bottom.
    for (const area of [AREA, { w: 861, h: 700 }]) {
      for (const [label, ar] of CASES) {
        const size = windowBox(ar, area)
        for (let slot = 0; slot < MAX_WINDOWS; slot++) {
          const p = cascadePosition(slot, area, size)
          expect(p.x, `${label} @${area.w} slot${slot}`).toBeGreaterThanOrEqual(0)
          expect(p.y + size.h, `${label} @${area.w} slot${slot} bottom`).toBeLessThanOrEqual(area.h + 0.001)
          expect(p.x + size.w, `${label} @${area.w} slot${slot} right`).toBeLessThanOrEqual(area.w + 0.001)
        }
      }
    }
  })

  it('states the same box in CSS as it does in numbers', () => {
    expect(windowWidthCss(1.5)).toBe('min(52vw, 720px, calc(1.5 * 62vh + 2px))')
  })
})
