import { describe, it, expect, vi } from 'vitest'
import type { Mock } from 'vitest'
import { VideoDirector, type Playable } from './videoDirector'

const fake = (): Playable & { play: Mock; pause: Mock } => {
  let paused = true
  return {
    play: vi.fn(() => { paused = false }),
    pause: vi.fn(() => { paused = true }),
    get paused() { return paused },
  }
}

describe('VideoDirector', () => {
  it('plays registered videos up to the cap, in registration order', () => {
    const d = new VideoDirector(4)
    const els = ['a', 'b', 'c', 'd', 'e', 'f'].map((id) => ({ id, el: fake() }))
    els.forEach(({ id, el }) => d.register(id, el))
    expect(d.playingIds()).toEqual(['a', 'b', 'c', 'd'])
    // e never made it into the cap, so it never played — and, per the paused-state
    // judgment in apply(), never gets a redundant pause() call either.
    expect(els[4].el.play).not.toHaveBeenCalled()
  })
  it('focus always plays and counts toward the cap', () => {
    const d = new VideoDirector(4)
    const els = ['a', 'b', 'c', 'd', 'e'].map((id) => ({ id, el: fake() }))
    els.forEach(({ id, el }) => d.register(id, el))
    d.setFocus('e')
    expect(d.playingIds()).toContain('e')
    expect(d.playingIds().length).toBeLessThanOrEqual(4)
  })
  it('unregister frees a slot; clearing focus restores order', () => {
    const d = new VideoDirector(2)
    const a = fake(), b = fake(), c = fake()
    d.register('a', a); d.register('b', b); d.register('c', c)
    expect(d.playingIds()).toEqual(['a', 'b'])
    d.unregister('a')
    expect(d.playingIds()).toEqual(['b', 'c'])
    d.setFocus('c'); d.setFocus(null)
    expect(d.playingIds()).toEqual(['b', 'c'])
  })
  it('does not re-fire pause() on an element that is already paused', () => {
    const d = new VideoDirector(1)
    const a = fake(), b = fake()
    d.register('a', a)
    d.register('b', b) // b never enters the cap, stays paused throughout
    expect(b.pause).not.toHaveBeenCalled()
  })
  it('pauses a playing element on unregister', () => {
    const d = new VideoDirector(4)
    const a = fake()
    d.register('a', a)
    expect(a.paused).toBe(false)
    d.unregister('a')
    expect(a.pause).toHaveBeenCalled()
    expect(a.paused).toBe(true)
  })
  it('unregister immediately followed by register of the same id does not drop focus', () => {
    // Mirrors FileCard's effect cleanup-then-setup cycle when `focused` flips:
    // the outgoing element is unregistered and a fresh one registered for the
    // very id that just became focused. Focus must survive that cycle.
    const d = new VideoDirector(4)
    const a = fake(), b = fake()
    d.register('a', a)
    d.register('b', b)
    d.setFocus('a')
    expect(a.play).toHaveBeenCalled()
    const a2 = fake()
    d.unregister('a') // cleanup of the old element
    d.register('a', a2) // setup of the new (post src-swap) element
    expect(a2.play).toHaveBeenCalled() // still desired: focus was not cleared
  })
  it('re-judges against a src-swap style external pause instead of a stale ledger', () => {
    // Simulates: element was playing, then something external (e.g. a video src
    // change) resets it to paused without going through the director's own
    // pause(). apply() must notice via the live `paused` getter and reissue
    // play() rather than trusting a shadow "already playing" ledger.
    let paused = true
    const el: Playable & { play: Mock; pause: Mock } = {
      play: vi.fn(() => { paused = false }),
      pause: vi.fn(() => { paused = true }),
      get paused() { return paused },
    }
    const d = new VideoDirector(4)
    d.register('a', el)
    expect(el.play).toHaveBeenCalledTimes(1)
    paused = true // external reset (simulated src swap), bypassing d entirely
    d.setFocus('a') // triggers apply() again; must re-issue play() for 'a'
    expect(el.play).toHaveBeenCalledTimes(2)
  })
})
