import { describe, it, expect } from 'vitest'
import { RND, rndById, isRndId, rndThumbSrc, rndFullSrc, formatRndDate, type RndFile } from './rnd'
import { MEDIA_META } from './mediaMeta.generated'

/**
 * The collection ships empty until the owner uploads: the R+D tab then shows its
 * designed empty state (NO SIGNAL tiles, FIRST TRANSMISSION PENDING). So every
 * invariant here is stated over whatever entries exist — vacuously true at zero,
 * load-bearing the moment the first upload lands — and nothing assumes RND[0].
 */
describe('rnd collection', () => {
  it('gives every entry generated metadata, a usable box, and a rnd_ id', () => {
    // The module throws at load on a missing width, so reaching here already
    // proves the join; these pin the shape the grid and focus view read.
    for (const f of RND) {
      expect(f.id.startsWith('rnd_'), `${f.id} is not rnd_-namespaced`).toBe(true)
      expect(f.kind).toBe('photo')
      expect(f.width).toBeGreaterThan(0)
      expect(f.height).toBeGreaterThan(0)
      expect(MEDIA_META[f.id], `${f.id} has no generated metadata`).toBeDefined()
    }
  })

  it('orders newest first, ties broken on name', () => {
    for (let i = 1; i < RND.length; i++) {
      const prev = RND[i - 1]
      const cur = RND[i]
      const ordered = prev.date > cur.date || (prev.date === cur.date && prev.name <= cur.name)
      expect(ordered, `${prev.id} (${prev.date}) should not precede ${cur.id} (${cur.date})`).toBe(true)
    }
  })

  it('resolves every live id and rejects strangers', () => {
    for (const f of RND) {
      expect(isRndId(f.id)).toBe(true)
      expect(rndById(f.id)?.name).toBe(f.name)
    }
    expect(isRndId('nope')).toBe(false)
    expect(rndById('nope')).toBeUndefined()
  })

  it('builds still-ladder thumb and full URLs from each namespaced id', () => {
    for (const f of RND) {
      expect(rndThumbSrc(f.id)).toContain(`${f.id}_thumb.jpg`)
      expect(rndFullSrc(f.id)).toContain(`${f.id}_full.jpg`)
    }
  })

  it('formats a full calendar date as DD MON YYYY', () => {
    const fixture: RndFile = {
      id: 'rnd_fixture', name: 'FIXTURE', ext: 'JPG', kind: 'photo',
      tagline: '', description: '', date: '2026-08-28', year: '2026',
      postUrl: 'https://instagram.com/severedarchive',
      width: 1080, height: 1440, durationSec: 0,
    }
    expect(formatRndDate(fixture)).toBe('28 AUG 2026')
  })
})
