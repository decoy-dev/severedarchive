import { describe, it, expect } from 'vitest'
import {
  lockEase, lockDelta, lockIsNoop, lockTransform, LOCK_MS,
} from './lockOn'

const CASCADE = { left: 240, top: 151, width: 720, height: 446 }
const FULL = { left: 1, top: 25, width: 1438, height: 850 }

describe('lockEase', () => {
  it('runs 0 to 1 and clamps', () => {
    expect(lockEase(0)).toBe(0)
    expect(lockEase(1)).toBe(1)
    expect(lockEase(-1)).toBe(0)
    expect(lockEase(2)).toBe(1)
  })

  it('is continuous — no step is ever visible in the geometry', () => {
    // It was quantized to six levels and the owner read the steps as lag. The
    // stepped vocabulary belongs to the overlay now; the travel itself glides.
    // Largest jump between adjacent 60fps samples stays a small fraction of the
    // whole, which is what "no visible step" means at this duration.
    let prev = lockEase(0)
    for (let t = 1 / 18; t <= 1.0001; t += 1 / 18) {   // 300ms at 60fps ≈ 18 frames
      const v = lockEase(t)
      expect(v - prev).toBeLessThan(0.16)
      prev = v
    }
  })

  it('eases out mildly: decisive early, settling late, never a lurch', () => {
    expect(lockEase(0.5)).toBeGreaterThan(0.6)
    // outExpo covers ~90% in the first third; over a travel this large that
    // reads as a lurch, so the curve must stay well short of it.
    expect(lockEase(0.33)).toBeLessThan(0.75)
  })

  it('never goes backwards', () => {
    let prev = -1
    for (let t = 0; t <= 1.0001; t += 0.01) {
      const v = lockEase(t)
      expect(v).toBeGreaterThanOrEqual(prev)
      prev = v
    }
  })

  it('is a beat, not a transition', () => {
    expect(LOCK_MS).toBeLessThanOrEqual(400)
  })
})

describe('lockDelta', () => {
  it('maps the new box back onto the old one', () => {
    const d = lockDelta(CASCADE, FULL)
    expect(d.dx).toBe(239)
    expect(d.dy).toBe(126)
    expect(d.sx).toBeCloseTo(720 / 1438)
    expect(d.sy).toBeCloseTo(446 / 850)
  })

  it('survives a zero-sized target rather than dividing by it', () => {
    const d = lockDelta(CASCADE, { left: 0, top: 0, width: 0, height: 0 })
    expect(d.sx).toBe(1)
    expect(d.sy).toBe(1)
  })

  it('is a no-op between boxes nobody could tell apart', () => {
    expect(lockIsNoop(lockDelta(CASCADE, CASCADE))).toBe(true)
    expect(lockIsNoop(lockDelta(CASCADE, FULL))).toBe(false)
  })
})

describe('lockTransform', () => {
  const d = lockDelta(CASCADE, FULL)

  it('starts on the old box and ends on the new one', () => {
    expect(lockTransform('', d, 0)).toBe(
      `translate(239px, 126px) scale(${d.sx}, ${d.sy})`,
    )
    expect(lockTransform('', d, 1)).toBe('translate(0px, 0px) scale(1, 1)')
  })

  it('PREPENDS the delta, so a dragged window ends where anime.js left it', () => {
    // Leftmost function is outermost: `delta base` adjusts the box base placed.
    // Appending instead would apply the drag offset inside the FLIP's scale and
    // the window would drift as it grew.
    const out = lockTransform('translate(-264px, 327px)', d, 1)
    expect(out).toBe('translate(0px, 0px) scale(1, 1) translate(-264px, 327px)')
  })

  it('clamps, so a late frame cannot overshoot the target box', () => {
    expect(lockTransform('', d, 2)).toBe(lockTransform('', d, 1))
    expect(lockTransform('', d, -1)).toBe(lockTransform('', d, 0))
  })
})
