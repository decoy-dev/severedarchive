import { describe, it, expect, vi } from 'vitest'
import { applyActivation, parseView, DESKTOP_MIN_WIDTH, type ViewMode } from './activation'

const fx = () => ({ setView: vi.fn<(v: ViewMode) => void>(), open: vi.fn<(id: string) => void>() })

describe('applyActivation', () => {
  it('opens a window at and above the 861px split', () => {
    const f = fx()
    applyActivation('file09', 'row', DESKTOP_MIN_WIDTH, f)
    expect(f.open).toHaveBeenCalledWith('file09')
    applyActivation('file09', 'row', 1440, f)
    expect(f.open).toHaveBeenCalledTimes(2)
  })

  it('opens nothing below the split — selection alone drives the mobile player', () => {
    const f = fx()
    applyActivation('file09', 'row', DESKTOP_MIN_WIDTH - 1, f)
    applyActivation('file09', 'tile', 390, f)
    expect(f.open).not.toHaveBeenCalled()
    expect(f.setView).not.toHaveBeenCalled()
  })

  it('leaves the grid before opening, but only for a tile', () => {
    const f = fx()
    applyActivation('file03', 'tile', 1440, f)
    expect(f.setView).toHaveBeenCalledWith('list')
    expect(f.open).toHaveBeenCalledWith('file03')

    const g = fx()
    for (const via of ['row', 'preview', 'keyboard'] as const) applyActivation('file03', via, 1440, g)
    expect(g.setView).not.toHaveBeenCalled()
    expect(g.open).toHaveBeenCalledTimes(3)
  })

  it('is inert, not fatal, when no desktop has registered an opener', () => {
    expect(() => applyActivation('file03', 'tile', 1440, { setView: vi.fn(), open: null })).not.toThrow()
  })
})

describe('parseView', () => {
  it('migrates the legacy stack value to list', () => {
    expect(parseView('stack')).toBe('list')
    expect(parseView('list')).toBe('list')
    expect(parseView('grid')).toBe('grid')
    expect(parseView(null)).toBe('list')
    expect(parseView('nonsense')).toBe('list')
  })
})
