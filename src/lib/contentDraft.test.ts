import { describe, it, expect } from 'vitest'
import { SITE_CONTENT } from '../data/content'
import {
  parseContent, serialiseContent, moveItem, removeItem, replaceItem,
  blankAbout, blankLink, LINK_ICONS,
} from './contentDraft'

const seed = `${JSON.stringify(SITE_CONTENT, null, 2)}\n`

describe('parseContent', () => {
  it('reads the live content the editor seeds itself from', () => {
    const draft = parseContent(seed)
    expect(draft).not.toBeNull()
    expect(draft!.about).toHaveLength(SITE_CONTENT.about.length)
    expect(draft!.links.map((l) => l.label)).toEqual(SITE_CONTENT.links.map((l) => l.label))
    expect(draft!.about[0].big).toBe(true)
  })

  it('keeps every top-level key it does not model', () => {
    // A future field, or something hand-added in the GitHub UI, must survive the
    // form rather than being deleted by it.
    const raw = JSON.stringify({ ...SITE_CONTENT, version: 3, notes: { a: 1 } })
    const draft = parseContent(raw)!
    expect(draft.rest).toEqual({ version: 3, notes: { a: 1 } })
    expect(JSON.parse(serialiseContent(draft))).toMatchObject({ version: 3, notes: { a: 1 } })
  })

  it('refuses anything it cannot model instead of guessing', () => {
    // Every one of these would otherwise be silently rewritten by the form.
    expect(parseContent('{')).toBeNull()
    expect(parseContent('[]')).toBeNull()
    expect(parseContent('null')).toBeNull()
    expect(parseContent('{"about":[],"links":{}}')).toBeNull()
    expect(parseContent('{"about":[{"label":"A"}],"links":[]}')).toBeNull()
    expect(parseContent('{"about":[],"links":[{"label":"A","value":"b","href":"#","icon":"tiktok"}]}')).toBeNull()
    expect(parseContent('{"about":[{"label":"A","body":"b","big":"yes"}],"links":[]}')).toBeNull()
  })

  it('accepts empty lists — a site with nothing in it is still editable', () => {
    expect(parseContent('{"about":[],"links":[]}')).toEqual({ about: [], links: [], rest: {} })
  })

  it('only offers icons that have a glyph in code', () => {
    for (const l of SITE_CONTENT.links) expect(LINK_ICONS).toContain(l.icon)
  })
})

describe('serialiseContent', () => {
  it('round-trips the seed byte for byte', () => {
    // The form has to produce the same diff shape as a hand edit, or the history
    // becomes unreadable the first time it is used.
    expect(serialiseContent(parseContent(seed)!)).toBe(seed)
  })

  it('omits `big` rather than writing false', () => {
    const out = serialiseContent({ about: [{ label: 'A', body: 'b' }], links: [], rest: {} })
    expect(out).not.toContain('big')
    expect(JSON.parse(out).about[0]).toEqual({ label: 'A', body: 'b' })
  })

  it('ends with a newline, like the seed', () => {
    expect(serialiseContent({ about: [], links: [], rest: {} }).endsWith('}\n')).toBe(true)
  })
})

describe('list edits', () => {
  const list = ['a', 'b', 'c']

  it('moves one place and stops at the ends', () => {
    expect(moveItem(list, 0, 1)).toEqual(['b', 'a', 'c'])
    expect(moveItem(list, 2, -1)).toEqual(['a', 'c', 'b'])
    expect(moveItem(list, 0, -1)).toEqual(list)
    expect(moveItem(list, 2, 1)).toEqual(list)
    expect(moveItem(list, 9, 1)).toEqual(list)
  })

  it('never mutates the list it was given', () => {
    const before = [...list]
    moveItem(list, 0, 1); removeItem(list, 0); replaceItem(list, 0, 'z')
    expect(list).toEqual(before)
  })

  it('removes and replaces by index', () => {
    expect(removeItem(list, 1)).toEqual(['a', 'c'])
    expect(replaceItem(list, 1, 'z')).toEqual(['a', 'z', 'c'])
  })

  it('blanks are empty, not example copy', () => {
    expect(blankAbout()).toEqual({ label: '', body: '' })
    expect(blankLink().label).toBe('')
    expect(LINK_ICONS).toContain(blankLink().icon)
  })
})
