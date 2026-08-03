import { describe, it, expect } from 'vitest'
import { desiredPlacement } from './placement'

const base = { selectedId: 'file03', windowIds: [], focusedWindowId: null, isDesktop: true, tier: 'full' } as const

describe('desiredPlacement', () => {
  it('names both selected-file surfaces, leaving the mounted one to win', () => {
    // Only one of preview/primary is ever registered, and resolveDesired drops
    // placements naming a dead slot — so this is how the policy stays free of a
    // second copy of the breakpoint.
    const { desired } = desiredPlacement(base)
    expect(desired).toEqual([
      { slot: 'preview', fileId: 'file03' },
      { slot: 'primary', fileId: 'file03' },
    ])
  })

  it('focuses the top window on desktop and the primary player on mobile', () => {
    expect(desiredPlacement({ ...base, windowIds: ['file09'], focusedWindowId: 'file09' }).focus).toBe('file09')
    expect(desiredPlacement({ ...base, isDesktop: false }).focus).toBe('file03')
  })

  it('places every window on full tier', () => {
    const { desired } = desiredPlacement({
      ...base, windowIds: ['file09', 'file11'], focusedWindowId: 'file11',
    })
    expect(desired).toContainEqual({ slot: 'window:file09', fileId: 'file09' })
    expect(desired).toContainEqual({ slot: 'window:file11', fileId: 'file11' })
  })

  it('lite spends its one decode on the focused window, and nothing else', () => {
    const { desired, focus } = desiredPlacement({
      ...base, tier: 'lite', windowIds: ['file09', 'file11'], focusedWindowId: 'file11',
    })
    expect(desired).toEqual([{ slot: 'window:file11', fileId: 'file11' }])
    expect(focus).toBe('file11')
  })

  it('lite still gives the mobile primary a real placement — the ruling in §4.2', () => {
    // The mobile project is always lite (390px < the 480px threshold), so this
    // is the ordinary mobile case, not an edge one. Tapping a tile that showed a
    // still image would be a broken promise.
    const { desired, focus } = desiredPlacement({ ...base, tier: 'lite', isDesktop: false })
    expect(desired).toEqual([{ slot: 'primary', fileId: 'file03' }])
    expect(focus).toBe('file03')
  })

  it('lite with nothing focused places nothing at all', () => {
    // Desktop, lite, no window open: the explorer preview pane is a poster and
    // holds no decode.
    expect(desiredPlacement({ ...base, tier: 'lite' })).toEqual({ desired: [], focus: null })
  })
})
