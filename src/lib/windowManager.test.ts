import { describe, it, expect } from 'vitest'
import { openWindow, focusWindow, closeWindow, cascadePosition, MAX_WINDOWS } from './windowManager'
import type { WinState } from './windowManager'

const at = (x: number, y: number) => ({ x, y })

describe('openWindow', () => {
  it('opens onto an empty desktop with the top z', () => {
    const r = openWindow([], 'file01', at(0, 0))
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.windows).toEqual([{ id: 'file01', x: 0, y: 0, z: 0 }])
  })

  it('gives each new window the top z', () => {
    const a = openWindow([], 'file01', at(0, 0))
    if (!a.ok) throw new Error('unreachable')
    const b = openWindow(a.windows, 'file02', at(28, 24))
    if (!b.ok) throw new Error('unreachable')
    expect(b.windows.find((w) => w.id === 'file02')!.z).toBe(1)
    expect(b.windows.find((w) => w.id === 'file01')!.z).toBe(0)
  })

  it('focuses instead of duplicating when the file is already open', () => {
    const a = openWindow([], 'file01', at(0, 0))
    if (!a.ok) throw new Error('unreachable')
    const b = openWindow(a.windows, 'file02', at(0, 0))
    if (!b.ok) throw new Error('unreachable')
    const again = openWindow(b.windows, 'file01', at(0, 0))
    if (!again.ok) throw new Error('unreachable')
    expect(again.windows).toHaveLength(2)
    expect(again.windows.find((w) => w.id === 'file01')!.z).toBe(1)
  })

  it('refuses the fourth window', () => {
    let ws: WinState[] = []
    for (const id of ['file01', 'file02', 'file03']) {
      const r = openWindow(ws, id, at(0, 0))
      if (!r.ok) throw new Error('unreachable')
      ws = r.windows
    }
    expect(ws).toHaveLength(MAX_WINDOWS)
    const refused = openWindow(ws, 'file04', at(0, 0))
    expect(refused).toEqual({ ok: false, reason: 'cap' })
  })
})

describe('focusWindow', () => {
  it('raises the target to the top and keeps z dense', () => {
    let ws: WinState[] = []
    for (const id of ['a', 'b', 'c']) {
      const r = openWindow(ws, id, at(0, 0))
      if (!r.ok) throw new Error('unreachable')
      ws = r.windows
    }
    const focused = focusWindow(ws, 'a')
    expect(focused.find((w) => w.id === 'a')!.z).toBe(2)
    expect([...focused.map((w) => w.z)].sort()).toEqual([0, 1, 2])
  })

  it('is a no-op for an unknown id', () => {
    const ws = [{ id: 'a', x: 0, y: 0, z: 0 }]
    expect(focusWindow(ws, 'nope')).toEqual(ws)
  })
})

describe('closeWindow', () => {
  it('removes the window and re-densifies z', () => {
    let ws: WinState[] = []
    for (const id of ['a', 'b', 'c']) {
      const r = openWindow(ws, id, at(0, 0))
      if (!r.ok) throw new Error('unreachable')
      ws = r.windows
    }
    const after = closeWindow(ws, 'b')
    expect(after).toHaveLength(2)
    expect([...after.map((w) => w.z)].sort()).toEqual([0, 1])
  })
})

describe('cascadePosition', () => {
  it('offsets each successive window down and right', () => {
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
