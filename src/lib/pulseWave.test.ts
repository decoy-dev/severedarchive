import { describe, it, expect } from 'vitest'
import { BAND, frontAt, pulseCell } from './pulseWave'

const cell = { distance: 100, progress: 0.3, reach: 1300, noise: 0, spread: 0 }

describe('frontAt', () => {
  it('starts at the source and reaches the far edge', () => {
    expect(frontAt(0, 1300)).toBe(0)
    expect(frontAt(1, 1300)).toBe(1300)
  })

  it('leaves fast and slows — the front has mass', () => {
    // More than half the distance is covered in the first third of the time.
    expect(frontAt(0.33, 1000)).toBeGreaterThan(500)
    // and the last third covers comparatively little
    expect(frontAt(1, 1000) - frontAt(0.66, 1000)).toBeLessThan(200)
  })
})

describe('pulseCell', () => {
  it('is dark before the pulse and after it', () => {
    expect(pulseCell({ ...cell, progress: 0 })).toBe(0)
    expect(pulseCell({ ...cell, progress: 1 })).toBe(0)
  })

  it('lights nothing ahead of the front', () => {
    // front at p=0.1 over a 1300px reach is ~247px, so 900px out is untouched
    expect(pulseCell({ ...cell, distance: 900, progress: 0.1 })).toBe(0)
    // and the wobble is a ripple on the edge, not a way to arrive early
    expect(pulseCell({ ...cell, distance: 900, progress: 0.1, spread: 1 })).toBe(0)
  })

  it('keeps everything behind the front lit, dimming with distance', () => {
    // No hard back edge: the strip beside the dot must not go dark while the
    // far end of the bar is still lit. That asymmetry is what read as the
    // effect cutting off prematurely on the right.
    const front = frontAt(0.3, 1300)
    const near = pulseCell({ ...cell, distance: front - 10 })
    const deep = pulseCell({ ...cell, distance: front - BAND - 400 })
    expect(deep).toBeGreaterThan(0)
    expect(deep).toBeLessThan(near)
  })

  it('is brightest just behind the front', () => {
    const front = frontAt(0.3, 1300)
    const near = pulseCell({ ...cell, distance: front - 5 })
    const far = pulseCell({ ...cell, distance: front - BAND })
    expect(near).toBeGreaterThan(far)
  })

  it('spends itself as the pulse ages', () => {
    const early = pulseCell({ ...cell, distance: frontAt(0.2, 1300) - 10, progress: 0.2 })
    const late = pulseCell({ ...cell, distance: frontAt(0.9, 1300) - 10, progress: 0.9 })
    expect(late).toBeLessThan(early)
  })

  it('fades with distance, so the far end of the bar is dimmer than the near', () => {
    // Sampled at the moment the wave reaches each point, so this is the light
    // spending itself as it travels rather than simply as time passes.
    const near = pulseCell({ ...cell, distance: frontAt(0.15, 1300) - 5, progress: 0.15 })
    const far = pulseCell({ ...cell, distance: frontAt(0.75, 1300) - 5, progress: 0.75 })
    expect(far).toBeLessThan(near)
  })

  it('pools along the centre line and thins toward the bar edges', () => {
    const front = frontAt(0.3, 1300)
    const middle = pulseCell({ ...cell, distance: front - 10, spread: 0 })
    const edge = pulseCell({ ...cell, distance: front - 10, spread: 1 })
    expect(edge).toBeLessThan(middle)
    expect(edge).toBeGreaterThan(0)
  })

  it('dithers: a dim cell with unlucky noise goes dark rather than grey', () => {
    const front = frontAt(0.3, 1300)
    const dim = { ...cell, distance: front - BAND * 3 }
    expect(pulseCell({ ...dim, noise: 0 })).toBeGreaterThan(0)
    expect(pulseCell({ ...dim, noise: 0.99 })).toBe(0)
  })

  it('keeps bright cells lit through the same noise that kills dim ones', () => {
    const front = frontAt(0.25, 1300)
    expect(pulseCell({ ...cell, distance: front - 2, progress: 0.25, noise: 0.2 })).toBeGreaterThan(0)
  })
})
