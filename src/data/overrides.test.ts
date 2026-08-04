import { describe, expect, it } from 'vitest'

/**
 * The override merge, exercised on the shape rather than the live file.
 *
 * `archive.ts` applies `overrides.json` at module load, so it cannot be tested
 * against different override sets in one process. The logic is short and the
 * consequences are not — a removal that leaves the entry visible points the
 * viewer at deleted media, and a patch that carries `id` points an entry at
 * media that never existed — so it is re-stated here against fixtures and
 * checked for the properties that matter.
 */
type Entry = { id: string; name: string; tagline: string; date?: string }

const apply = (
  entries: Entry[],
  overrides: { patch: Record<string, Partial<Entry>>; removed: string[] },
): Entry[] => {
  const removed = new Set(overrides.removed)
  return entries
    .filter((e) => !removed.has(e.id))
    .map((e) => {
      const patch = overrides.patch[e.id]
      return patch ? { ...e, ...patch, id: e.id } : e
    })
}

const ENTRIES: Entry[] = [
  { id: 'file01', name: 'CHROME_SEQ', tagline: 'a' },
  { id: 'file02', name: 'HALO_DRIFT', tagline: 'b' },
  { id: 'file03', name: 'GLASS_RITE', tagline: 'c' },
]

describe('entry overrides', () => {
  it('changes only the fields the patch names', () => {
    const out = apply(ENTRIES, { patch: { file02: { tagline: 'edited' } }, removed: [] })
    expect(out[1]).toEqual({ id: 'file02', name: 'HALO_DRIFT', tagline: 'edited' })
  })

  it('never lets a patch change the id', () => {
    // The id names every rendition on disk. A patch that could change it would
    // point the entry at media that does not exist.
    const out = apply(ENTRIES, { patch: { file02: { id: 'file99', tagline: 'x' } }, removed: [] })
    expect(out[1].id).toBe('file02')
  })

  it('keeps the curated order when a patch does not set a date', () => {
    const out = apply(ENTRIES, { patch: { file03: { tagline: 'x' } }, removed: [] })
    expect(out.map((e) => e.id)).toEqual(['file01', 'file02', 'file03'])
  })

  it('drops a removed entry entirely', () => {
    const out = apply(ENTRIES, { patch: {}, removed: ['file02'] })
    expect(out.map((e) => e.id)).toEqual(['file01', 'file03'])
  })

  it('removal wins over a patch for the same entry', () => {
    // Otherwise a stale patch resurrects an entry whose media has been deleted.
    const out = apply(ENTRIES, { patch: { file02: { tagline: 'x' } }, removed: ['file02'] })
    expect(out.map((e) => e.id)).toEqual(['file01', 'file03'])
  })

  it('is a no-op when nothing is overridden', () => {
    expect(apply(ENTRIES, { patch: {}, removed: [] })).toEqual(ENTRIES)
  })
})

describe('the committed overrides file', () => {
  it('has the shape archive.ts expects', async () => {
    const file = (await import('./overrides.json')).default as Record<string, unknown>
    expect(file).toHaveProperty('patch')
    expect(file).toHaveProperty('removed')
    expect(Array.isArray(file.removed)).toBe(true)
  })
})
