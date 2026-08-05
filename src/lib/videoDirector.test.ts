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
  it('plays only focus plus the stated background once a policy exists', () => {
    // Registration order is the fallback, not the policy. mediaController states
    // the background on every pass, and a registered element that is in neither
    // the focus nor the background is not playing — a parked or released node.
    const d = new VideoDirector(5)
    const els = ['a', 'b', 'c'].map((id) => ({ id, el: fake() }))
    els.forEach(({ id, el }) => d.register(id, el))
    expect(d.playingIds()).toEqual(['a', 'b', 'c'])
    d.setFocus('a')
    d.setBackground(['b'])
    expect(d.playingIds()).toEqual(['a', 'b'])
    expect(els[2].el.pause).toHaveBeenCalled()
    d.setBackground(null)
    expect(d.playingIds()).toEqual(['a', 'b', 'c'])
  })

  it('sees exactly one focus id with three windows open', () => {
    // The desktop ceiling: 3 windows + the explorer preview, one of which is
    // focused. The backdrop is not registered here at all.
    const d = new VideoDirector(5)
    const ids = ['w1', 'w2', 'w3', 'preview']
    ids.forEach((id) => d.register(id, fake()))
    d.setFocus('w2')
    d.setBackground(['w1', 'w3', 'preview'])
    expect(d.playingIds().length).toBeLessThanOrEqual(5)
    expect(d.playingIds()).toContain('w2')
    d.setFocus('w3')
    d.setBackground(['w1', 'w2', 'preview'])
    expect(d.playingIds()).toEqual(ids)
  })

  it('ignores background ids with no registered element', () => {
    const d = new VideoDirector(4)
    const a = fake()
    d.register('a', a)
    d.setBackground(['ghost', 'a'])
    expect(d.playingIds()).toEqual(['a'])
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

  it('setMaxPlaying pauses the surplus and resumes it when the cap lifts', () => {
    // The enlarge case: everything but the focused window is behind an opaque
    // picture, so its frames are spent on pixels nobody can see.
    const d = new VideoDirector(4)
    const els = ['a', 'b', 'c', 'd'].map((id) => ({ id, el: fake() }))
    els.forEach(({ id, el }) => d.register(id, el))
    d.setFocus('c')
    expect(d.playingIds()).toEqual(['a', 'b', 'c', 'd'])

    d.setMaxPlaying(1)
    // Focus survives — the enlarged window is exactly the one that must keep going.
    expect(d.playingIds()).toEqual(['c'])
    // Paused, NOT unregistered: the elements are still known, so their frames are
    // held and they resume in place rather than restarting from zero.
    expect(els[0].el.pause).toHaveBeenCalled()

    d.setMaxPlaying(4)
    expect(d.playingIds()).toEqual(['a', 'b', 'c', 'd'])
  })

  it('setMaxPlaying is idempotent and never goes below one', () => {
    const d = new VideoDirector(2)
    const a = fake(), b = fake()
    d.register('a', a); d.register('b', b)
    a.play.mockClear(); b.play.mockClear()
    d.setMaxPlaying(2)
    expect(a.play).not.toHaveBeenCalled()
    // A cap of zero would silence the surface the viewer is actually looking at.
    d.setMaxPlaying(0)
    expect(d.playingIds().length).toBe(1)
  })
})
