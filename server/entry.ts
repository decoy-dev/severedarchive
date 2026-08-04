/**
 * What an archive entry is, and what an upload has to supply for one.
 *
 * Validation lives here, apart from the Worker, because it is the part with
 * rules worth testing: a date the owner backdated must still sort correctly, a
 * name has to be unique to identify a file now that nothing is numbered, and a
 * description is free text that ends up in the DOM.
 */
export type MediaKind = 'video' | 'photo'

export type ArchiveEntryInput = {
  name: string
  kind: MediaKind
  tagline: string
  description: string
  /** ISO `YYYY-MM-DD`. Pre-filled with the uploading device's date, editable. */
  date: string
  postUrl: string
}

export type ValidationResult =
  | { ok: true; value: ArchiveEntryInput }
  | { ok: false; errors: string[] }

const NAME_RE = /^[A-Z0-9][A-Z0-9_]{1,30}$/
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

/** Matches the interface's convention rather than inventing a second one. */
export const normaliseName = (raw: string): string =>
  raw.trim().toUpperCase().replace(/[\s-]+/g, '_').replace(/[^A-Z0-9_]/g, '')

/** A real calendar date, not merely a string that looks like one. */
export function isCalendarDate(value: string): boolean {
  if (!DATE_RE.test(value)) return false
  const [y, m, d] = value.split('-').map(Number)
  if (m < 1 || m > 12 || d < 1) return false
  // Rolls over on an impossible day, so 2025-02-30 fails rather than becoming
  // the 2nd of March.
  const date = new Date(Date.UTC(y, m - 1, d))
  return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d
}

export function validateEntry(input: unknown, existingNames: readonly string[] = []): ValidationResult {
  const errors: string[] = []
  const raw = (input ?? {}) as Record<string, unknown>

  const name = normaliseName(String(raw.name ?? ''))
  if (!NAME_RE.test(name)) {
    errors.push('name must be 2–31 characters of A–Z, 0–9 or underscore')
  } else if (existingNames.some((n) => n.toUpperCase() === name)) {
    // The index is gone from the data model, so the name is the identity.
    errors.push(`name ${name} is already in the archive`)
  }

  const kind = raw.kind === 'photo' ? 'photo' : raw.kind === 'video' ? 'video' : null
  if (kind === null) errors.push('kind must be video or photo')

  const date = String(raw.date ?? '')
  if (!isCalendarDate(date)) errors.push('date must be a real YYYY-MM-DD date')

  const tagline = String(raw.tagline ?? '').trim()
  if (tagline.length > 80) errors.push('tagline must be 80 characters or fewer')

  const description = String(raw.description ?? '').trim()
  if (description.length > 2000) errors.push('description must be 2000 characters or fewer')

  const postUrl = String(raw.postUrl ?? '').trim()
  if (postUrl) {
    // Only http(s). A `javascript:` URL here would be a stored XSS with an
    // owner-shaped hole in it, since this string becomes an href.
    let parsed: URL | null = null
    try {
      parsed = new URL(postUrl)
    } catch {
      parsed = null
    }
    if (!parsed || (parsed.protocol !== 'https:' && parsed.protocol !== 'http:')) {
      errors.push('postUrl must be an http(s) URL')
    }
  }

  if (errors.length) return { ok: false, errors }
  return { ok: true, value: { name, kind: kind!, tagline, description, date, postUrl } }
}

/**
 * Newest first, which is what the explorer shows. Ties break on name so the
 * order is total — two files uploaded the same day must not swap places between
 * builds.
 */
export function byNewest<T extends { date: string; name: string }>(entries: readonly T[]): T[] {
  return [...entries].sort((a, b) => (a.date === b.date ? a.name.localeCompare(b.name) : b.date.localeCompare(a.date)))
}
