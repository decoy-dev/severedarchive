import { describe, it, expect } from 'vitest'
import { loopHandoffDue } from './loopFade'

const base = { time: 5, duration: 12, fade: 0.9, handingOver: false }

describe('loopHandoffDue', () => {
  it('is quiet in the body of a clip', () => {
    expect(loopHandoffDue(base)).toBe(false)
  })

  it('calls the handover once the tail is inside the dissolve, and not before', () => {
    // The boundary is one dissolve from the end: 12 - 0.9 = 11.1.
    expect(loopHandoffDue({ ...base, time: 11.05 })).toBe(false)
    expect(loopHandoffDue({ ...base, time: 11.15 })).toBe(true)
    expect(loopHandoffDue({ ...base, time: 11.9 })).toBe(true)
  })

  it('does not call it twice — the incoming layer already exists', () => {
    // `timeupdate` keeps firing through the whole dissolve. Without this the
    // outgoing layer would stack a new copy of itself on every tick.
    expect(loopHandoffDue({ ...base, time: 11.5, handingOver: true })).toBe(false)
  })

  it('still reports the tail when time overshoots duration by a frame', () => {
    expect(loopHandoffDue({ ...base, time: 12.02 })).toBe(true)
  })

  it('leaves clips too short to dissolve alone', () => {
    // 2.4s with a 0.9s dissolve would spend most of its life doubled.
    expect(loopHandoffDue({ ...base, duration: 2.4, time: 1.6 })).toBe(false)
  })

  it('says nothing until metadata gives it a duration', () => {
    expect(loopHandoffDue({ ...base, duration: NaN })).toBe(false)
    expect(loopHandoffDue({ ...base, duration: Infinity })).toBe(false)
    expect(loopHandoffDue({ ...base, duration: 0 })).toBe(false)
  })
})
