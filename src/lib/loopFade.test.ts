import { describe, it, expect } from 'vitest'
import { loopFadeAction } from './loopFade'

const base = { time: 5, last: 4.75, duration: 12, fade: 0.5, phase: 'in' } as const

describe('loopFadeAction', () => {
  it('does nothing in the body of a clip', () => {
    expect(loopFadeAction(base)).toEqual({ kind: 'none' })
  })

  it('dips across the tail, over exactly the time that is left', () => {
    expect(loopFadeAction({ ...base, time: 11.7, last: 11.45 })).toEqual({
      kind: 'fade', to: 'out', ms: expect.closeTo(300, 5),
    })
  })

  it('does not restart the dip on every tick', () => {
    // `timeupdate` fires ~4x a second; a fade re-issued each time would reset to
    // full opacity and never actually darken.
    expect(loopFadeAction({ ...base, time: 11.8, last: 11.7, phase: 'out' })).toEqual({ kind: 'none' })
  })

  it('comes back up when time goes backwards', () => {
    // The wrap fires no event of its own — this is the only signal there is.
    expect(loopFadeAction({ ...base, time: 0.05, last: 11.95, phase: 'out' })).toEqual({
      kind: 'fade', to: 'in', ms: 500,
    })
  })

  it('reads the wrap as a wrap even though the new time is also near a boundary', () => {
    // The first tick after wrapping is within `fade` of the start; if the tail
    // test ran first on a very short clip it would re-dip immediately.
    const a = loopFadeAction({ ...base, duration: 1.6, time: 0.02, last: 1.55, phase: 'out' })
    expect(a).toEqual({ kind: 'fade', to: 'in', ms: 500 })
  })

  it('leaves clips too short to fade alone', () => {
    // 1.4s with a 0.5s fade would be dipping or recovering most of its life.
    expect(loopFadeAction({ ...base, duration: 1.4, time: 1.1, last: 0.85 })).toEqual({ kind: 'none' })
  })

  it('says nothing until metadata gives it a duration', () => {
    expect(loopFadeAction({ ...base, duration: NaN })).toEqual({ kind: 'none' })
    expect(loopFadeAction({ ...base, duration: Infinity })).toEqual({ kind: 'none' })
    expect(loopFadeAction({ ...base, duration: 0 })).toEqual({ kind: 'none' })
  })

  it('floors the dip so a late tick is not a blackout', () => {
    const a = loopFadeAction({ ...base, time: 11.99, last: 11.8 })
    expect(a).toEqual({ kind: 'fade', to: 'out', ms: 80 })
  })
})
