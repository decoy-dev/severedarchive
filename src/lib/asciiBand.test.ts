import { describe, expect, it } from 'vitest'
import { bandCentre, contentRight, inkBand, isBeside, type Box } from './asciiBand'

const box = (x: number, right: number, y = 0, bottom = 100): Box => ({ x, right, y, bottom })

describe('isBeside', () => {
  it('is true for a sibling ending before the host and overlapping it vertically', () => {
    expect(isBeside(box(600, 1000), box(40, 560))).toBe(true)
  })

  it('tolerates a sub-pixel overlap from grid rounding', () => {
    expect(isBeside(box(600, 1000), box(40, 600.6))).toBe(true)
  })

  it('is false for a sibling stacked above, however narrow', () => {
    expect(isBeside(box(40, 1000, 300, 460), box(40, 300, 0, 280))).toBe(false)
  })

  it('is false when the sibling overruns the host horizontally', () => {
    expect(isBeside(box(600, 1000), box(40, 700))).toBe(false)
  })
})

describe('contentRight', () => {
  it('reports the blocks edge, not the track edge', () => {
    // The measured case: a 1055px track holding 664px of max-width blocks.
    const track = box(40, 1055)
    const blocks = [box(40, 664), box(40, 664), box(40, 664), box(40, 664)]
    expect(contentRight(track, blocks)).toBe(664)
  })

  it('takes the widest block when they differ', () => {
    expect(contentRight(box(40, 1055), [box(40, 500), box(40, 720), box(40, 300)])).toBe(720)
  })

  it('falls back to the box when there are no children', () => {
    expect(contentRight(box(40, 1055), [])).toBe(1055)
  })

  it('clamps a child that overflows its parent', () => {
    expect(contentRight(box(40, 1055), [box(40, 1400)])).toBe(1055)
  })
})

describe('inkBand', () => {
  it('spans the gap the copy leaves when they sit side by side', () => {
    const band = inkBand(box(600, 1000), box(40, 560), 1040)
    expect(band).toEqual({ left: 560, right: 1040 })
  })

  it('follows the copy narrowing inside its own track', () => {
    // The case that had the mark 135px off: same host column, copy ending far
    // earlier, so the band's centre moves left while the column does not.
    const wide = bandCentre(inkBand(box(600, 1000), box(40, 560), 1040))
    const narrow = bandCentre(inkBand(box(600, 1000), box(40, 380), 1040))
    expect(narrow).toBeLessThan(wide - 80)
  })

  it('falls back to the host box when the copy is stacked above it', () => {
    // One-column layout: the copy's right edge is the panel's right edge, and
    // using it as the band's left would centre the mark on the panel corner.
    const band = inkBand(box(40, 1000, 300, 460), box(40, 1000, 0, 280), 1040)
    expect(band).toEqual({ left: 40, right: 1000 })
  })

  it('falls back to the host box with no sibling at all', () => {
    expect(inkBand(box(40, 1000), null, 1040)).toEqual({ left: 40, right: 1000 })
  })

  it('refuses a band the panel edge would invert', () => {
    expect(inkBand(box(600, 1000), box(40, 560), 500)).toEqual({ left: 600, right: 1000 })
  })
})
