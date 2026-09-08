import { describe, expect, it } from 'vitest'
import { laneAlpha, materializeMask, MATERIALIZE_COLS, MATERIALIZE_ROWS } from './materialize'

describe('archive materialization mask', () => {
  it('is fully hidden at arrival and fully opaque at completion', () => {
    for (let lane = 0; lane < Math.max(MATERIALIZE_COLS, MATERIALIZE_ROWS); lane++) {
      expect(laneAlpha(lane, 0)).toBe(0)
      expect(laneAlpha(lane, 1)).toBe(1)
    }
  })

  it('uses both axes so the interim reveal resolves as granular cells', () => {
    const mask = materializeMask(0.5)
    // Two composited hard-stop gradients, not one full-height band wipe.
    expect(mask.match(/linear-gradient/g)).toHaveLength(2)
    expect(mask.match(/rgba\(0,0,0,/g)).toHaveLength(MATERIALIZE_COLS + MATERIALIZE_ROWS)

    const alphas = Array.from({ length: MATERIALIZE_COLS }, (_, lane) => laneAlpha(lane, 0.5))
    expect(new Set(alphas).size).toBeGreaterThan(3)
  })
})
