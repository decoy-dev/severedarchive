import { describe, it, expect } from 'vitest'
import { stackLayout } from './stackLayout'

describe('stackLayout', () => {
  it('front card sits at depth 0, full scale, top z', () => {
    const pos = stackLayout(6, 0, 24)
    expect(pos[0]).toEqual({ depth: 0, sliverX: 0, scale: 1, z: 6 })
  })
  it('depth wraps around the sequence', () => {
    const pos = stackLayout(6, 4, 24)
    expect(pos[4].depth).toBe(0)
    expect(pos[5].depth).toBe(1)
    expect(pos[0].depth).toBe(2)
    expect(pos[3].depth).toBe(5)
  })
  it('slivers pack left-to-right by depth at sliverW spacing', () => {
    const pos = stackLayout(6, 0, 24)
    expect(pos[1].sliverX).toBe(0)
    expect(pos[2].sliverX).toBe(24)
    expect(pos[5].sliverX).toBe(96)
  })
  it('fanned spacing widens with sliverW', () => {
    const pos = stackLayout(6, 0, 72)
    expect(pos[3].sliverX).toBe(144)
  })
  it('scale decays with depth but never below 0.9', () => {
    const pos = stackLayout(6, 0, 24)
    expect(pos[1].scale).toBeCloseTo(0.98)
    expect(pos[5].scale).toBeGreaterThanOrEqual(0.9)
  })
  it('z-index strictly decreases with depth', () => {
    const pos = stackLayout(6, 2, 24)
    const byDepth = [...pos].sort((a, b) => a.depth - b.depth)
    for (let i = 1; i < byDepth.length; i++) expect(byDepth[i].z).toBeLessThan(byDepth[i - 1].z)
  })
})
