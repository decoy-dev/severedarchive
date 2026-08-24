import { describe, it, expect } from 'vitest'
import { contentCommitMessage } from './contentMessage'

const FALLBACK = 'Update site content from admin'

const file = (body: { about?: unknown[]; links?: unknown[] }) => JSON.stringify(body, null, 2)

const about = (label: string, text: string) => ({ label, body: text })
const link = (label: string, value: string, href: string) => ({ label, value, href, icon: 'inbox' })

/** The subject line on its own — what `git log --oneline` shows. */
const subject = (message: string) => message.split('\n')[0]

describe('contentCommitMessage', () => {
  it('names the rows that changed, so --oneline distinguishes two commits', () => {
    // The edit that actually shipped on 2026-08-24, which under the old constant
    // subject was indistinguishable from the twenty-seven commits around it.
    const before = file({
      about: [about('BACKSTORY', 'Blender-built worlds.'), about('TOOLING', 'BLENDER · GEOMETRY NODES')],
      links: [link('COMMISSIONS', 'STATUS: OPEN', '#')],
    })
    const after = file({
      about: [about('LORE', 'Blender-built worlds.'), about('SERVICES', 'ALBUM ARTWORK · MERCH DESIGN')],
      links: [link('COMMISSIONS', 'STATUS: OPEN', 'https://tally.so/r/68EJdJ')],
    })
    const message = contentCommitMessage(before, after)
    expect(subject(message)).toBe('Admin: edit LORE, SERVICES, COMMISSIONS')
    // And the body carries the detail the subject had to leave out.
    expect(message).toContain('ABOUT LORE label: "BACKSTORY" → "LORE"')
    expect(message).toContain('ABOUT SERVICES label: "TOOLING" → "SERVICES"')
    expect(message).toContain('LINKS COMMISSIONS href: "#" → "https://tally.so/r/68EJdJ"')
  })

  it('reports only the field that moved, not the whole row', () => {
    const before = file({ links: [link('MAIL', 'a@b.co', 'mailto:a@b.co')] })
    const after = file({ links: [link('MAIL', 'a@b.co', 'mailto:c@d.co')] })
    const message = contentCommitMessage(before, after)
    expect(message).toContain('LINKS MAIL href: "mailto:a@b.co" → "mailto:c@d.co"')
    expect(message).not.toContain('value')
    expect(message).not.toContain('label')
  })

  it('names a renamed row by what it is now, not what it was', () => {
    const before = file({ about: [about('TOOLING', 'same')] })
    const after = file({ about: [about('SERVICES', 'same')] })
    expect(subject(contentCommitMessage(before, after))).toBe('Admin: edit SERVICES')
  })

  it('says added and removed rather than inventing a field change', () => {
    const one = file({ links: [link('MAIL', 'a@b.co', 'mailto:a@b.co')] })
    const two = file({
      links: [link('MAIL', 'a@b.co', 'mailto:a@b.co'), link('PRESS', 'KIT', '/press')],
    })
    expect(contentCommitMessage(one, two)).toContain('LINKS PRESS: added')
    expect(contentCommitMessage(two, one)).toContain('LINKS PRESS: removed')
  })

  it('falls back on the old constant when there is nothing to compare against', () => {
    expect(contentCommitMessage(null, file({ about: [about('A', 'b')] }))).toBe(FALLBACK)
  })

  it('falls back rather than throwing on anything that is not this file', () => {
    const good = file({ about: [about('A', 'b')] })
    // A message is never worth failing a commit over.
    expect(contentCommitMessage('not json {', good)).toBe(FALLBACK)
    expect(contentCommitMessage(good, 'not json {')).toBe(FALLBACK)
    expect(contentCommitMessage('[]', good)).toBe(FALLBACK)
    expect(contentCommitMessage(good, '{"unrelated":1}')).toBe(FALLBACK)
  })

  it('falls back when the two sides are the same, which GitHub will not commit', () => {
    const same = file({ about: [about('A', 'b')], links: [link('L', 'v', '/x')] })
    expect(contentCommitMessage(same, same)).toBe(FALLBACK)
  })

  it('keeps the subject to one line inside git\'s limit, and counts the rest', () => {
    const rows = (suffix: string) => Array.from(
      { length: 12 },
      (_, i) => about(`SECTION_NUMBER_${i}`, `body ${i}${suffix}`),
    )
    const message = contentCommitMessage(file({ about: rows('') }), file({ about: rows('!') }))
    const line = subject(message)
    expect(line.length).toBeLessThanOrEqual(72)
    expect(line).toMatch(/\+\d+ more$/)
    // Every change is still accounted for in the body.
    expect(message.split('\n').filter((l) => l.startsWith('ABOUT '))).toHaveLength(12)
  })

  it('keeps one name even when that name alone overruns the limit', () => {
    const long = 'X'.repeat(120)
    const line = subject(contentCommitMessage(
      file({ about: [about(long, 'a')] }),
      file({ about: [about(long, 'b')] }),
    ))
    expect(line).toContain(long)
    expect(line.split('\n')).toHaveLength(1)
  })

  it('cuts a long body value instead of pasting a paragraph into the message', () => {
    const paragraph = 'Blender-built worlds set to music, chrome and glass and metal, at length.'
    const message = contentCommitMessage(
      file({ about: [about('LORE', 'short')] }),
      file({ about: [about('LORE', paragraph)] }),
    )
    expect(message).toContain('…')
    expect(message).not.toContain(paragraph)
    // The cut is in the body only; the subject still just names the row.
    expect(subject(message)).toBe('Admin: edit LORE')
  })

  it('describes an unlabelled row by its position', () => {
    const message = contentCommitMessage(
      file({ about: [about('', 'a')] }),
      file({ about: [about('', 'b')] }),
    )
    expect(message).toContain('ABOUT[0]')
  })

  it('reports big being toggled on a block', () => {
    const message = contentCommitMessage(
      file({ about: [{ label: 'OPERATOR', body: 'x' }] }),
      file({ about: [{ label: 'OPERATOR', body: 'x', big: true }] }),
    )
    expect(message).toContain('ABOUT OPERATOR big: unset → true')
  })
})
