import { describe, it, expect } from 'vitest'
import { cellGone, sweepAt, DISSOLVE_MS } from './dissolve'

describe('sweepAt', () => {
  it('runs 0 at the first corner to 1 at the last', () => {
    expect(sweepAt(0, 0, 10, 10)).toBe(0)
    expect(sweepAt(9, 9, 10, 10)).toBe(1)
    expect(sweepAt(9, 0, 10, 10)).toBeCloseTo(0.5)
  })

  it('is normalised, so the sweep has the same shape at any aspect ratio', () => {
    // A wide window and a tall one must dissolve in the same direction over the
    // same fraction of the animation, not at a rate set by their pixel counts.
    expect(sweepAt(29, 4, 30, 5)).toBe(1)
    expect(sweepAt(4, 29, 5, 30)).toBe(1)
  })

  it('survives a one-cell grid', () => {
    expect(sweepAt(0, 0, 1, 1)).toBe(0)
  })
})

describe('cellGone', () => {
  it('is all present at the start and all gone at the end', () => {
    for (const noise of [0, 0.3, 0.99]) {
      for (const sweep of [0, 0.5, 1]) {
        expect(cellGone(0, noise, sweep)).toBe(false)
        expect(cellGone(1, noise, sweep)).toBe(true)
      }
    }
  })

  it('sweeps: the near corner goes before the far one', () => {
    const near = cellGone(0.3, 0.5, 0.0)
    const far = cellGone(0.3, 0.5, 1.0)
    expect(near).toBe(true)
    expect(far).toBe(false)
  })

  it('is ragged, not a moving line: noise decides between neighbours', () => {
    // Same position along the sweep, different noise — one goes, one stays.
    expect(cellGone(0.45, 0.05, 0.5)).toBe(true)
    expect(cellGone(0.45, 0.95, 0.5)).toBe(false)
  })

  it('is binary — a cell is gone or it is not', () => {
    // The whole point: no partial alpha, so it reads as a signal breaking up
    // rather than as a fade.
    expect(typeof cellGone(0.5, 0.5, 0.5)).toBe('boolean')
  })

  it('finishes in a beat rather than a cutscene', () => {
    expect(DISSOLVE_MS).toBeLessThanOrEqual(600)
  })
})
