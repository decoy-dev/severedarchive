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

/** Anything already addressed: a scheme, an in-page anchor, or a rooted path. */
const isAddressed = (href: string) =>
  /^[a-z][a-z0-9+.-]*:/i.test(href) || href.startsWith('#') || href.startsWith('/')

/**
 * Give a LINK row's href the scheme the owner meant.
 *
 * This exists because the MAIL row shipped broken on 2026-08-12. The href was
 * set to `chris@severedarchive.com` with no `mailto:`, and a bare address in an
 * href is a RELATIVE URL — the browser resolves it against the site, so MAIL
 * navigated to `/chris@severedarchive.com` and 404'd. The owner caught it in
 * production and fixed it by hand.
 *
 * The form invited that, and would keep inviting it: the field is a plain text
 * input (it cannot be `type="url"` — that rejects both `mailto:` and the `#` the
 * commissions row uses), the label says LINK, and an email address is a
 * perfectly reasonable thing to type into a field called LINK next to one called
 * SHOWN AS that you just typed the same address into.
 *
 * So: an address becomes `mailto:`, a bare host becomes `https://`, and anything
 * already addressed is returned untouched — `#`, a rooted path, and any existing
 * scheme all pass through, because each is a live value in this file today.
 * Guessing stops where it would have to invent: a lone word like `contact` has no
 * right answer, so it is left alone and `hrefWarning` speaks up instead.
 */
export function normaliseHref(raw: string): string {
  const href = raw.trim()
  if (!href || isAddressed(href)) return href
  // A bare email address.
  if (/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(href)) return `mailto:${href}`
  // A bare host, with or without a path: `severedarchive.com`, `x.com/user`.
  if (/^[^\s/?#@]+\.[^\s/?#@]{2,}(?:[/?#]|$)/.test(href)) return `https://${href}`
  return href
}

/**
 * What is still wrong with an href after normalising, in the owner's register, or
 * null when it is fine.
 *
 * The counterpart to the rewrite above: where `normaliseHref` can be sure, it
 * acts silently; where it cannot, the form says so rather than committing a link
 * that resolves somewhere nobody intended. Both beat what happened, which was
 * neither.
 */
/**
 * Normalise every href in a whole `content.json` string. The backstop, for the
 * moment of commit.
 *
 * NOT inside `serialiseContent`, which is where this was first written and was
 * wrong: `ContentEditor` holds the serialised string as its only state and
 * re-parses the draft from it on every keystroke, so anything normalising in
 * there runs per character. Typing an address would grow a `mailto:` halfway
 * through the domain and move the caret out from under the owner — the exact
 * behaviour the blur-not-change decision on the field exists to avoid.
 *
 * Here it runs once, on the string about to be committed, which is what "last
 * place before it becomes the file" actually means. It catches the case blur
 * cannot: a value typed and saved by keyboard without the field losing focus.
 *
 * A file the form cannot model comes back untouched — raw mode is the escape
 * hatch for exactly that, and rewriting a shape we do not understand is how you
 * lose someone's data.
 */
export function normaliseContentHrefs(raw: string): string {
  const draft = parseContent(raw)
  if (!draft) return raw
  const links = draft.links.map((l) => ({ ...l, href: normaliseHref(l.href) }))
  if (links.every((l, i) => l.href === draft.links[i].href)) return raw
  return serialiseContent({ ...draft, links })
}

export function hrefWarning(raw: string): string | null {
  const href = normaliseHref(raw)
  if (!href) return 'EMPTY — THIS ROW LINKS NOWHERE'
  if (isAddressed(href)) return null
  return 'NO SCHEME — THIS WILL POINT INSIDE THE SITE. DID YOU MEAN mailto: OR https:?'
}
