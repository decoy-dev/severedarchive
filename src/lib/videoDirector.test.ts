import { describe, it, expect, vi } from 'vitest'
import { VideoDirector, type Playable } from './videoDirector'

const fake = (): Playable & { play: ReturnType<typeof vi.fn>; pause: ReturnType<typeof vi.fn> } => ({
  play: vi.fn(), pause: vi.fn(),
})

describe('VideoDirector', () => {
  it('plays registered videos up to the cap, in registration order', () => {
    const d = new VideoDirector(4)
    const els = ['a', 'b', 'c', 'd', 'e', 'f'].map((id) => ({ id, el: fake() }))
    els.forEach(({ id, el }) => d.register(id, el))
    expect(d.playingIds()).toEqual(['a', 'b', 'c', 'd'])
    expect(els[4].el.pause).toHaveBeenCalled()
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
})
