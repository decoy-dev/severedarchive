import { type LinkIcon, type SiteContent } from '../data/content'

/**
 * The ABOUT/LINKS editor's model: `content.json` as fields rather than as text.
 *
 * The panel used to be a textarea containing raw JSON. That asks the owner to be
 * a JSON parser — a missing comma is a refused commit, and the only feedback is
 * `NOT VALID JSON` from the Worker after a round trip. These functions turn the
 * file into a list of blocks and rows and back again, so the form can be a form.
 *
 * Two things this has to get right, and they are the reason it is a tested module
 * rather than inline component code:
 *
 * 1. **Nothing unknown is lost.** `rest` carries every top-level key the editor
 *    does not model. A future field, or something hand-added in the GitHub UI,
 *    survives a round trip through the form instead of being deleted by it.
 * 2. **A file it cannot model is not mangled.** `parseContent` returns null rather
 *    than a half-understood draft, and the panel falls back to the raw textarea.
 *    Guessing here would silently rewrite the owner's file.
 */

export const LINK_ICONS: readonly LinkIcon[] = ['instagram', 'mail', 'inbox']

export type AboutBlock = SiteContent['about'][number]
export type LinkRow = SiteContent['links'][number]

export type ContentDraft = {
  about: AboutBlock[]
  links: LinkRow[]
  /** Every other top-level key, preserved verbatim. */
  rest: Record<string, unknown>
}

const isObj = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v)

const isAbout = (v: unknown): v is AboutBlock =>
  isObj(v) && typeof v.label === 'string' && typeof v.body === 'string'
  && (v.big === undefined || typeof v.big === 'boolean')

const isLink = (v: unknown): v is LinkRow =>
  isObj(v) && typeof v.label === 'string' && typeof v.value === 'string'
  && typeof v.href === 'string' && LINK_ICONS.includes(v.icon as LinkIcon)

/**
 * Parse `content.json` into a draft, or null if it is not the shape this editor
 * understands.
 *
 * Deliberately strict about the two arrays and indifferent to everything else: a
 * block missing `body`, or a link with an icon that has no glyph, is something
 * the form cannot render honestly, so the raw text is the safer editor for it.
 */
export function parseContent(raw: string): ContentDraft | null {
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return null
  }
  if (!isObj(parsed)) return null
  const { about, links, ...rest } = parsed
  if (!Array.isArray(about) || !about.every(isAbout)) return null
  if (!Array.isArray(links) || !links.every(isLink)) return null
  return {
    about: about.map((b) => ({ label: b.label, body: b.body, ...(b.big ? { big: true } : {}) })),
    links: links.map((l) => ({ label: l.label, value: l.value, href: l.href, icon: l.icon })),
    rest,
  }
}

/**
 * Back to the file, formatted the way the seed is: two-space indent and a
 * trailing newline, so a commit made through the form produces the same diff
 * shape as one made by hand and the history stays readable.
 *
 * `big` is written only when true. It is optional in the type, and emitting
 * `"big": false` on every block would put noise in the diff for a field that
 * means the same thing absent.
 */
export function serialiseContent(draft: ContentDraft): string {
  const body = {
    ...draft.rest,
    about: draft.about.map((b) => (b.big ? { label: b.label, body: b.body, big: true } : { label: b.label, body: b.body })),
    links: draft.links.map((l) => ({ label: l.label, value: l.value, href: l.href, icon: l.icon })),
  }
  return `${JSON.stringify(body, null, 2)}\n`
}

/** Move an item one place, or return the list unchanged at either end. */
export function moveItem<T>(list: readonly T[], index: number, dir: -1 | 1): T[] {
  const to = index + dir
  if (index < 0 || index >= list.length || to < 0 || to >= list.length) return [...list]
  const next = [...list]
  ;[next[index], next[to]] = [next[to], next[index]]
  return next
}

export function removeItem<T>(list: readonly T[], index: number): T[] {
  return list.filter((_, i) => i !== index)
}

export function replaceItem<T>(list: readonly T[], index: number, item: T): T[] {
  return list.map((cur, i) => (i === index ? item : cur))
}

/** A new block reads as empty rather than as example copy nobody asked for. */
export const blankAbout = (): AboutBlock => ({ label: '', body: '' })
export const blankLink = (): LinkRow => ({ label: '', value: '', href: '', icon: 'mail' })
