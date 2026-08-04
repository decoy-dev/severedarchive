import { describe, it, expect } from 'vitest'
import { desiredPlacement } from './placement'

const base = { selectedId: 'file03', windowIds: [], focusedWindowId: null, isDesktop: true, tier: 'full' } as const

describe('desiredPlacement', () => {
  it('names the mobile primary for the selected file, and no desktop surface', () => {
    // The desktop explorer pane holds no media — it is a standby prompt — so
    // the only slot the selection can land in is the mobile one. On desktop
    // that placement is inert: resolveDesired drops placements naming a slot
    // that is not registered, which is how this stays free of a second copy of
    // the breakpoint.
    const { desired } = desiredPlacement(base)
    expect(desired).toEqual([{ slot: 'primary', fileId: 'file03' }])
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

describe('stills are never placed', () => {
  /**
   * A still gets no controller node at all, and that single omission is the whole
   * of photo support in the media layer.
   *
   * `mediaController` exists to keep a `<video>` playing across a reparent — the
   * only reason React is forbidden from owning those elements. An image has no
   * playback state, so it needs none of that; and a placement for a still would
   * mean a `<video>` element pointed at a JPEG, which is a broken frame in every
   * slot it lands in.
   */
  const isStill = (id: string) => id.startsWith('photo')

  it('omits a selected still from the mobile primary slot', () => {
    const out = desiredPlacement({
      selectedId: 'photo1', windowIds: [], focusedWindowId: null,
      isDesktop: false, tier: 'full', isStill,
    })
    expect(out.desired).toEqual([])
  })

  it('omits a still window while keeping the clips beside it', () => {
    const out = desiredPlacement({
      selectedId: 'file01', windowIds: ['file01', 'photo1', 'file02'],
      focusedWindowId: 'file01', isDesktop: true, tier: 'full', isStill,
    })
    expect(out.desired.map((p) => p.fileId)).toEqual(['file01', 'file01', 'file02'])
    expect(out.desired.some((p) => p.fileId === 'photo1')).toBe(false)
  })

  it('never names a still as the playback focus', () => {
    // Naming it would have the director hold the focus slot against an element
    // that does not exist, muting whatever is actually audible.
    const out = desiredPlacement({
      selectedId: 'file01', windowIds: ['file01', 'photo1'],
      focusedWindowId: 'photo1', isDesktop: true, tier: 'full', isStill,
    })
    expect(out.focus).toBeNull()
    expect(out.desired.map((p) => p.fileId)).toEqual(['file01', 'file01'])
  })

  it('places nothing at all when the one lite-tier decode would be a still', () => {
    const out = desiredPlacement({
      selectedId: 'photo1', windowIds: ['photo1'], focusedWindowId: 'photo1',
      isDesktop: true, tier: 'lite', isStill,
    })
    expect(out).toEqual({ desired: [], focus: null })
  })

  it('is unchanged for an archive of clips only', () => {
    const args = {
      selectedId: 'file01', windowIds: ['file01', 'file02'], focusedWindowId: 'file02',
      isDesktop: true, tier: 'full' as const,
    }
    expect(desiredPlacement({ ...args, isStill })).toEqual(desiredPlacement(args))
  })
})
