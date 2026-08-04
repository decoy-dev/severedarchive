/**
 * What an archive entry is, and what an upload has to supply for one.
 *
 * Validation lives here, apart from the Worker, because it is the part with
 * rules worth testing: a date the owner backdated must still sort correctly, a
 * name has to be unique to identify a file now that nothing is numbered, and a
 * description is free text that ends up in the DOM.
 */
export type MediaKind = 'video' | 'photo'

/**
 * The poster still's spec. Mirrors `src/lib/thumbCrop.ts`, restated here because
 * the Worker must not import from the app — but the RULES are the same, and the
 * ranges are the ones that module's arithmetic is defined over.
 */
export type ThumbInput = {
  /** Seconds into the clip. */
  time: number
  /** 1 is the whole frame; MAX_THUMB_ZOOM is as far in as it goes. */
  zoom: number
  /** Focal point across the frame, 0..1 — a CSS transform-origin fraction. */
  cx: number
  cy: number
  /** True when the still is an uploaded image rather than a frame. */
  custom: boolean
}

export const MAX_THUMB_ZOOM = 4
/** The clip length the pipeline trims to, so a grab past it yields no frame. */
export const MAX_THUMB_TIME = 12

export type ArchiveEntryInput = {
  name: string
  kind: MediaKind
  tagline: string
  description: string
  /** ISO `YYYY-MM-DD`. Pre-filled with the uploading device's date, editable. */
  date: string
  postUrl: string
  thumb: ThumbInput
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

/**
 * The thumbnail spec, parsed and bounded.
 *
 * Rejects rather than repairs, unlike the app-side `normaliseThumb`: this is the
 * boundary, and silently correcting an out-of-range zoom into something the
 * owner did not ask for is worse than telling them. A MISSING spec is not an
 * error — it means the pipeline default — so only a present-and-wrong one fails.
 */
export function validateThumb(raw: unknown, errors: string[]): ThumbInput {
  const fallback: ThumbInput = { time: 1, zoom: 1, cx: 0.5, cy: 0.5, custom: false }
  if (raw === undefined || raw === null || raw === '') return fallback

  let parsed: unknown = raw
  if (typeof raw === 'string') {
    try {
      parsed = JSON.parse(raw)
    } catch {
      errors.push('thumb must be valid JSON')
      return fallback
    }
  }
  if (typeof parsed !== 'object' || parsed === null) {
    errors.push('thumb must be an object')
    return fallback
  }

  const obj = parsed as Record<string, unknown>
  const range = (key: keyof ThumbInput, lo: number, hi: number, dflt: number): number => {
    const value = obj[key]
    if (value === undefined || value === null) return dflt
    const n = typeof value === 'number' ? value : Number(value)
    if (!Number.isFinite(n) || n < lo || n > hi) {
      errors.push(`thumb.${key} must be a number between ${lo} and ${hi}`)
      return dflt
    }
    return n
  }

  return {
    time: range('time', 0, MAX_THUMB_TIME, 1),
    zoom: range('zoom', 1, MAX_THUMB_ZOOM, 1),
    cx: range('cx', 0, 1, 0.5),
    cy: range('cy', 0, 1, 0.5),
    custom: obj.custom === true || obj.custom === 'true',
  }
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

  const thumb = validateThumb(raw.thumb, errors)

  if (errors.length) return { ok: false, errors }
  return { ok: true, value: { name, kind: kind!, tagline, description, date, postUrl, thumb } }
}

/**
 * The fields of an entry that already exists.
 *
 * The same rules as a new one, minus one: a name may collide with its OWN
 * current name. Editing a tagline and pressing save must not be rejected for
 * the name being taken by the thing being edited. So the caller's list is
 * filtered by the id's own name before the uniqueness check runs.
 */
export function validateEntryEdit(
  input: unknown,
  currentName: string,
  existingNames: readonly string[] = [],
): ValidationResult {
  const own = normaliseName(currentName)
  return validateEntry(input, existingNames.filter((n) => normaliseName(n) !== own))
}

/**
 * Whether a deletion may proceed.
 *
 * Removing an entry deletes committed renditions and cannot be undone from the
 * interface, so the caller has to type the name back.
 *
 * Trimmed and case-folded, and NOTHING else. It is tempting to reuse
 * `normaliseName` here, and a test caught why that is wrong: it maps spaces to
 * underscores and drops punctuation, so `GLASS RITE!` confirmed the removal of
 * `GLASS_RITE`. Case is not the thing being confirmed — the characters are, and
 * a confirmation that accepts an approximation is not a confirmation.
 */
export function deletionConfirmed(typed: unknown, name: string): boolean {
  if (typeof typed !== 'string') return false
  const given = typed.trim().toUpperCase()
  return given.length > 0 && given === name.trim().toUpperCase()
}

/**
 * Newest first, which is what the explorer shows. Ties break on name so the
 * order is total — two files uploaded the same day must not swap places between
 * builds.
 */
export function byNewest<T extends { date: string; name: string }>(entries: readonly T[]): T[] {
  return [...entries].sort((a, b) => (a.date === b.date ? a.name.localeCompare(b.name) : b.date.localeCompare(a.date)))
}
