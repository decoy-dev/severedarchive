import { describe, it, expect } from 'vitest'
import {
  recedeAt, recedeTransform, recedeFilter,
  RECEDE_MS, RECEDE_MIN_SCALE, RECEDE_MAX_BLUR, RECEDE_MIN_BRIGHTNESS,
} from './recede'

describe('recedeAt', () => {
  it('starts at rest and ends gone', () => {
    expect(recedeAt(0)).toEqual({ scale: 1, opacity: 1, blur: 0, brightness: 1 })
    const end = recedeAt(1)
    expect(end.scale).toBeCloseTo(RECEDE_MIN_SCALE)
    expect(end.opacity).toBe(0)
    expect(end.blur).toBeCloseTo(RECEDE_MAX_BLUR)
    expect(end.brightness).toBeCloseTo(RECEDE_MIN_BRIGHTNESS)
  })

  it('softens from the first frame, ahead of the shrink', () => {
    // Diffusion that arrives with the fade lands after the eye has stopped
    // following the panel, and the close goes back to looking hard-edged.
    const early = recedeAt(0.15)
    expect(early.blur).toBeGreaterThan(RECEDE_MAX_BLUR * 0.1)
    expect(1 - early.scale).toBeLessThan(0.1)
    let prev = -1
    for (let t = 0; t <= 1.0001; t += 0.05) {
      const { blur } = recedeAt(t)
      expect(blur).toBeGreaterThanOrEqual(prev)
      prev = blur
    }
  })

  it('clamps, so a late frame past the deadline cannot invert it', () => {
    expect(recedeAt(-0.5)).toEqual(recedeAt(0))
    expect(recedeAt(2)).toEqual(recedeAt(1))
  })

  it('only ever shrinks', () => {
    let prev = Infinity
    for (let t = 0; t <= 1.0001; t += 0.05) {
      const { scale } = recedeAt(t)
      expect(scale).toBeLessThanOrEqual(prev)
      prev = scale
    }
  })

  it('eases in: it leaves slowly, then goes fast', () => {
    // The first half must cover less ground than the second, or it reads as the
    // window resizing itself rather than being pulled away.
    const first = 1 - recedeAt(0.5).scale
    const second = recedeAt(0.5).scale - recedeAt(1).scale
    expect(first).toBeLessThan(second)
  })

  it('stays solid while it travels — the fade trails the shrink', () => {
    // A panel that fades in step with its scale is a crossfade with extra steps,
    // which is what the pixel dissolve got wrong.
    for (const t of [0.25, 0.5, 0.75]) {
      const { scale, opacity } = recedeAt(t)
      expect(opacity).toBeGreaterThan(1 - scale)
    }
    expect(recedeAt(0.5).opacity).toBeGreaterThan(0.85)
  })

  it('finishes in a beat rather than a cutscene', () => {
    expect(RECEDE_MS).toBeLessThanOrEqual(600)
  })
})

describe('recedeTransform', () => {
  it('composes with the translate a drag left behind', () => {
    // Substituting instead of appending would snap a dragged window back to its
    // cascade position on the first frame of its own close.
    expect(recedeTransform('translateX(120px) translateY(-40px)', 0.5))
      .toBe('translateX(120px) translateY(-40px) scale(0.5)')
  })

  it('is just the scale for a window that was never moved', () => {
    expect(recedeTransform('', 0.5)).toBe('scale(0.5)')
    expect(recedeTransform('   ', 1)).toBe('scale(1)')
  })
})

describe('recedeFilter', () => {
  it('blurs before it dims', () => {
    // Filters apply left to right: the other order dims hard edges and then
    // softens them, which keeps a visible rectangle for longer.
    expect(recedeFilter(6, 0.85)).toBe('blur(6px) brightness(0.85)')
  })
})
