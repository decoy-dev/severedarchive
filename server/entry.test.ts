import { describe, it, expect } from 'vitest'
import { byNewest, isCalendarDate, normaliseName, validateEntry } from './entry'

const good = {
  name: 'NEW_RENDER', kind: 'video', tagline: 'chrome study',
  description: 'A longer note about the piece.', date: '2026-08-04',
  postUrl: 'https://instagram.com/p/abc',
}

describe('normaliseName', () => {
  it('matches the archive convention rather than inventing another', () => {
    expect(normaliseName(' chrome seq ')).toBe('CHROME_SEQ')
    expect(normaliseName('ash-meridian')).toBe('ASH_MERIDIAN')
    expect(normaliseName('null choir!!')).toBe('NULL_CHOIR')
  })
})

describe('isCalendarDate', () => {
  it('accepts real dates', () => {
    expect(isCalendarDate('2026-08-04')).toBe(true)
    expect(isCalendarDate('2024-02-29')).toBe(true) // leap year
  })

  it('rejects dates that only look real', () => {
    // The Date constructor would roll these over rather than fail.
    expect(isCalendarDate('2025-02-30')).toBe(false)
    expect(isCalendarDate('2025-13-01')).toBe(false)
    expect(isCalendarDate('2025-00-10')).toBe(false)
    expect(isCalendarDate('2025-8-4')).toBe(false)
    expect(isCalendarDate('')).toBe(false)
  })
})

describe('validateEntry', () => {
  it('accepts a complete entry and normalises the name', () => {
    const result = validateEntry({ ...good, name: 'new render' })
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.value.name).toBe('NEW_RENDER')
  })

  it('rejects a name already in the archive', () => {
    // Nothing is numbered any more, so the name is the identity — a duplicate
    // is genuinely ambiguous rather than merely untidy.
    const result = validateEntry(good, ['CHROME_SEQ', 'NEW_RENDER'])
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.errors.join()).toMatch(/already in the archive/)
  })

  it('rejects a javascript: postUrl', () => {
    // This string becomes an href on the viewer's popout.
    const result = validateEntry({ ...good, postUrl: 'javascript:alert(1)' })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.errors.join()).toMatch(/http/)
  })

  it('allows an empty postUrl', () => {
    expect(validateEntry({ ...good, postUrl: '' }).ok).toBe(true)
  })

  it('rejects a bad kind, a bad date and an over-long description', () => {
    const result = validateEntry({
      ...good, kind: 'audio', date: '04/08/2026', description: 'x'.repeat(2001),
    })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.errors).toHaveLength(3)
  })

  it('reports every problem at once rather than one per attempt', () => {
    const result = validateEntry({})
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.errors.length).toBeGreaterThan(1)
  })
})

describe('byNewest', () => {
  it('sorts newest first', () => {
    const sorted = byNewest([
      { name: 'OLD', date: '2024-01-01' },
      { name: 'NEW', date: '2026-08-04' },
      { name: 'MID', date: '2025-06-01' },
    ])
    expect(sorted.map((e) => e.name)).toEqual(['NEW', 'MID', 'OLD'])
  })

  it('places a backdated entry by its date, not by when it was added', () => {
    // The owner can set an older date at upload; it must land in the middle.
    const sorted = byNewest([
      { name: 'A', date: '2026-01-01' },
      { name: 'B', date: '2026-03-01' },
      { name: 'BACKDATED', date: '2026-02-01' },
    ])
    expect(sorted.map((e) => e.name)).toEqual(['B', 'BACKDATED', 'A'])
  })

  it('breaks ties on name so the order is total', () => {
    // Two files the same day must not swap places between builds.
    const a = byNewest([{ name: 'B', date: '2026-01-01' }, { name: 'A', date: '2026-01-01' }])
    const b = byNewest([{ name: 'A', date: '2026-01-01' }, { name: 'B', date: '2026-01-01' }])
    expect(a).toEqual(b)
    expect(a.map((e) => e.name)).toEqual(['A', 'B'])
  })

  it('does not mutate its input', () => {
    const input = [{ name: 'A', date: '2024-01-01' }, { name: 'B', date: '2026-01-01' }]
    byNewest(input)
    expect(input.map((e) => e.name)).toEqual(['A', 'B'])
  })
})
