import { describe, it, expect } from 'vitest'
import { SITE_CONTENT } from '../data/content'
import {
  parseContent, serialiseContent, moveItem, removeItem, replaceItem,
  blankAbout, blankLink, LINK_ICONS, normaliseHref, hrefWarning, normaliseContentHrefs,
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

describe('normaliseHref', () => {
  // The exact value the owner committed on 2026-08-12, which shipped a MAIL link
  // that resolved to /chris@severedarchive.com and 404'd.
  it('gives a bare email address its mailto:', () => {
    expect(normaliseHref('chris@severedarchive.com')).toBe('mailto:chris@severedarchive.com')
  })

  it('gives a bare host its https:, path and all', () => {
    expect(normaliseHref('severedarchive.com')).toBe('https://severedarchive.com')
    expect(normaliseHref('instagram.com/severedarchive')).toBe('https://instagram.com/severedarchive')
  })

  // Everything below is a live value in content.json or a deliberate one, and
  // rewriting any of it would break a working link to fix a broken one.
  it('leaves anything already addressed alone', () => {
    for (const href of [
      'mailto:chris@severedarchive.com',
      'https://instagram.com/severedarchive',
      'http://example.com',
      'tel:+15551234567',
      '#',
      '/press',
      '//cdn.example.com/x.png',
    ]) expect(normaliseHref(href)).toBe(href)
  })

  it('is idempotent, because it runs on blur and again on commit', () => {
    const once = normaliseHref('chris@severedarchive.com')
    expect(normaliseHref(once)).toBe(once)
  })

  it('trims, and leaves empty empty', () => {
    expect(normaliseHref('  https://x.com  ')).toBe('https://x.com')
    expect(normaliseHref('   ')).toBe('')
  })

  it('does not invent a scheme for something it cannot read', () => {
    // No dot and no @: 'contact' could be a path or a typo, and guessing wrong
    // silently is what this whole function exists to stop. hrefWarning speaks.
    expect(normaliseHref('contact')).toBe('contact')
    expect(hrefWarning('contact')).toMatch(/NO SCHEME/)
  })
})

describe('hrefWarning', () => {
  it('is silent for anything that resolves off the site', () => {
    for (const href of ['mailto:a@b.co', 'https://x.com', '#', '/press']) {
      expect(hrefWarning(href)).toBeNull()
    }
  })

  it('is silent for a bare address, because that one gets fixed', () => {
    expect(hrefWarning('chris@severedarchive.com')).toBeNull()
  })

  it('speaks up for empty', () => {
    expect(hrefWarning('')).toMatch(/EMPTY/)
  })
})

describe('normaliseContentHrefs', () => {
  it('fixes a bare address on the way to the commit, so a save cannot ship the 404', () => {
    const draft = parseContent(seed)!
    draft.links[1] = { ...draft.links[1], href: 'chris@severedarchive.com' }
    const written = JSON.parse(normaliseContentHrefs(serialiseContent(draft)))
    expect(written.links[1].href).toBe('mailto:chris@severedarchive.com')
  })

  it('returns the very same string when there is nothing to fix', () => {
    // Identity, not just equality: `save` compares the two to decide whether to
    // write back to state, and a fresh-but-equal string would rerender for nothing.
    expect(normaliseContentHrefs(seed)).toBe(seed)
  })

  it('does not touch a file the form cannot model', () => {
    // Raw mode's whole purpose. Rewriting a shape we do not understand is how
    // someone's data gets lost.
    const odd = '{"about":"not an array","links":[]}'
    expect(normaliseContentHrefs(odd)).toBe(odd)
    expect(normaliseContentHrefs('{ not json')).toBe('{ not json')
  })

  it('serialiseContent itself leaves hrefs alone', () => {
    // It runs per keystroke (ContentEditor re-parses the draft from its output),
    // so normalising in there would rewrite the field mid-word.
    const draft = parseContent(seed)!
    draft.links[1] = { ...draft.links[1], href: 'chris@severedarchive.com' }
    expect(JSON.parse(serialiseContent(draft)).links[1].href).toBe('chris@severedarchive.com')
  })
})
