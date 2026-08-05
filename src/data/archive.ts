import { MEDIA_KIND, MEDIA_META, MEDIA_VERSION, type MediaMeta } from './mediaMeta.generated'
import UPLOADED_ENTRIES from './entries.json'
import ENTRY_OVERRIDES from './overrides.json'
import type { ThumbSpec } from '../lib/thumbCrop'

/**
 * What the explorer draws where the index number used to be. Everything in the
 * archive is a clip today, so `kind` is a constant in practice — it exists so
 * the tile does not have to infer the icon from the extension, and so a still
 * can be added without touching the explorer.
 */
export type MediaKind = 'video' | 'photo'

/** Hand-authored editorial fields. Everything measurable comes from ffprobe. */
type ArchiveEntry = {
  id: string
  name: string
  ext: 'MP4' | 'JPG'
  kind: MediaKind
  tagline: string
  year: string
  /**
   * Long-form note, shown by the (i) control. Optional: the twelve original
   * entries predate the field and fall back to their tagline, so this is only
   * ever set by an upload or a later edit.
   */
  description?: string
  /**
   * ISO `YYYY-MM-DD`, and only on entries that came through the admin backend.
   *
   * The original twelve deliberately have none. They carry a `year` and a
   * curated order, and inventing a day for each of them to sort by would
   * reorder the archive the owner arranged by hand — a side effect nobody asked
   * for. So dated entries sort newest-first ABOVE them and the twelve keep
   * their order below, which is exactly what "uploads default to the top"
   * means. Give one a real date through the admin UI and it joins the sort.
   */
  date?: string
  /**
   * How the poster still is made: which frame, and how it is cropped. Absent on
   * everything that has not been thumbnail-edited, which means the pipeline's
   * default — one second in, uncropped. The crop applies to the STILL only; see
   * `src/lib/thumbCrop.ts` for why the clip itself is never reframed.
   */
  thumb?: ThumbSpec
  /**
   * The post this clip came from. Every entry currently points at the profile —
   * the per-post permalinks are not known here and must be filled in by the
   * owner; `postUrl` is what the viewer's VIEW ON INSTAGRAM button links to.
   */
  postUrl: string
}

export type ArchiveFile = ArchiveEntry & MediaMeta

/**
 * Where a clip links when no per-post permalink has been set. Declared above
 * ENTRIES because they reference it at module load — below it, this is a
 * temporal-dead-zone throw on the first import rather than a lint warning.
 */
export const INSTAGRAM_PROFILE = 'https://instagram.com/severedarchive'

const ENTRIES: ArchiveEntry[] = [
  { id: 'file01', name: 'CHROME_SEQ', ext: 'MP4', kind: 'video', tagline: 'liquid metal study', year: '2026' , postUrl: INSTAGRAM_PROFILE },
  { id: 'file02', name: 'HALO_DRIFT', ext: 'MP4', kind: 'video', tagline: 'render set to sound', year: '2026' , postUrl: INSTAGRAM_PROFILE },
  { id: 'file03', name: 'GLASS_RITE', ext: 'MP4', kind: 'video', tagline: 'refraction pass', year: '2025' , postUrl: INSTAGRAM_PROFILE },
  { id: 'file04', name: 'WIRE_SAINT', ext: 'MP4', kind: 'video', tagline: 'neo-2000s loop', year: '2025' , postUrl: INSTAGRAM_PROFILE },
  { id: 'file05', name: 'COLD_BLOOM', ext: 'MP4', kind: 'video', tagline: 'particle bloom', year: '2025' , postUrl: INSTAGRAM_PROFILE },
  { id: 'file06', name: 'STEEL_HYMN', ext: 'MP4', kind: 'video', tagline: 'metalheart sketch', year: '2024' , postUrl: INSTAGRAM_PROFILE },
  { id: 'file07', name: 'VELVET_ROT', ext: 'MP4', kind: 'video', tagline: 'decay pass', year: '2025' , postUrl: INSTAGRAM_PROFILE },
  { id: 'file08', name: 'NULL_CHOIR', ext: 'MP4', kind: 'video', tagline: 'vertical study', year: '2025' , postUrl: INSTAGRAM_PROFILE },
  { id: 'file09', name: 'SALT_INDEX', ext: 'MP4', kind: 'video', tagline: 'crystalline loop', year: '2024' , postUrl: INSTAGRAM_PROFILE },
  { id: 'file10', name: 'MERCY_LOOP', ext: 'MP4', kind: 'video', tagline: 'square format test', year: '2024' , postUrl: INSTAGRAM_PROFILE },
  { id: 'file11', name: 'ASH_MERIDIAN', ext: 'MP4', kind: 'video', tagline: 'particle drift', year: '2024' , postUrl: INSTAGRAM_PROFILE },
  { id: 'file12', name: 'GHOST_PROTOCOL', ext: 'MP4', kind: 'video', tagline: 'final transmission', year: '2026' , postUrl: INSTAGRAM_PROFILE },
]

/**
 * An entry with no generated metadata is a build error, not a runtime fallback:
 * a missing width silently becomes 16:9 everywhere and nobody notices. The
 * throw fires at module load, and `archive.test.ts` fires before that.
 */
/**
 * Written by the ingest run (`scripts/write-entry.mjs`), committed, and read
 * here. Empty until the first upload — the file exists so this import is not
 * conditional and the build does not depend on whether anything was published
 * yet.
 */
const UPLOADED = UPLOADED_ENTRIES as ArchiveEntry[]

/**
 * Admin edits and removals, written by the edit run and committed.
 *
 * Why a separate file rather than editing the entries above: the twelve are
 * source code, and a workflow that rewrites `archive.ts` is a workflow that can
 * break the build with a bad quote. This is data, so the worst a bad edit can do
 * is be wrong.
 *
 * `patch` is merged field-by-field over an entry with the same id, so an edit
 * that only changes a tagline says only that — and, importantly, does not move
 * an entry: the twelve keep their curated order unless a real date is set,
 * which is the same rule as before. `removed` drops the entry entirely, and the
 * edit run deletes its renditions in the same commit.
 */
const OVERRIDES = ENTRY_OVERRIDES as {
  patch: Record<string, Partial<ArchiveEntry>>
  removed: string[]
}

const REMOVED = new Set(OVERRIDES.removed)

/**
 * The patch applied. `id` is never taken from the patch: it names the files on
 * disk, and letting an edit change it would point an entry at media that does
 * not exist.
 */
const patched = (entry: ArchiveEntry): ArchiveEntry => {
  const patch = OVERRIDES.patch[entry.id]
  if (!patch) return entry
  return { ...entry, ...patch, id: entry.id }
}

/** Newest first. Ties break on name so the order is total across builds. */
const byDateDesc = (a: ArchiveEntry, b: ArchiveEntry): number =>
  a.date === b.date ? a.name.localeCompare(b.name) : (b.date ?? '').localeCompare(a.date ?? '')

/**
 * Uploads on top, newest first; the hand-arranged twelve beneath, in their
 * order. See `ArchiveEntry.date` for why the twelve are not swept into the
 * sort.
 */
// Removals and patches are applied FIRST, before anything is sorted or looks up
// generated metadata.
//
// Before sorting, because a patch may SET a date, and the promise in
// `ArchiveEntry.date` is that giving one of the twelve a real date makes it join
// the sort. Patching after the order was decided quietly broke that: the entry
// got its date and stayed where it was.
//
// Before the metadata lookup, because a removed entry's renditions are gone from
// disk, so its generated metadata is gone too, and the throw below would fire on
// an entry nobody is meant to see any more.
const RESOLVED: ArchiveEntry[] = [...UPLOADED, ...ENTRIES]
  .filter((e) => !REMOVED.has(e.id))
  .map(patched)

// Dated entries newest-first on top; undated ones below in their curated order.
// Two passes rather than one comparator, because "no date" is not a date that
// sorts last — it means "leave this where the author put it".
const ALL_ENTRIES: ArchiveEntry[] = [
  ...RESOLVED.filter((e) => e.date).sort(byDateDesc),
  ...RESOLVED.filter((e) => !e.date),
]

export const ARCHIVE: ArchiveFile[] = ALL_ENTRIES.map((e) => {
  const meta = MEDIA_META[e.id]
  if (!meta) throw new Error(`archive: ${e.id} has no generated media metadata — run npm run gen:media-meta`)
  return { ...e, ...meta }
})

const BY_ID = new Map(ARCHIVE.map((f) => [f.id, f]))

export const fileById = (id: string): ArchiveFile | undefined => BY_ID.get(id)
export const isArchiveId = (id: string): boolean => BY_ID.has(id)

/** MM:SS, rounded once, here, instead of twelve independent guesses. */
export const formatDuration = (sec: number): string => {
  const total = Math.max(0, Math.round(sec))
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`
}

/** Spec §2 asks the preview pane for a resolution line. Same source as the aspect ratio. */
export const formatResolution = (f: ArchiveFile): string => `${f.width}×${f.height}`

export const aspectRatio = (f: ArchiveFile): number => f.width / f.height

/**
 * What the (i) panel shows for a date. An entry with a real date reads as
 * `04 AUG 2026`; one of the original twelve has only a year, and says so rather
 * than inventing a day it does not have.
 */
export const formatEntryDate = (f: ArchiveFile): string => {
  if (!f.date) return f.year
  const [y, m, d] = f.date.split('-')
  const months = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC']
  const month = months[Number(m) - 1]
  // A malformed date must not render as `04 undefined 2026`.
  return month ? `${d} ${month} ${y}` : f.year
}

/**
 * Which file leads the stack (and seeds the backdrop) on load.
 *
 * A curated choice, but not an unconditional one: an admin removal can delete
 * the entry it names, and a selection pointing at a file that is not in the
 * archive leaves the backdrop with nothing to play. Falls back to whatever now
 * leads the list.
 */
const PREFERRED_FRONT_ID = 'file03'
export const DEFAULT_FRONT_ID =
  ARCHIVE.some((f) => f.id === PREFERRED_FRONT_ID) ? PREFERRED_FRONT_ID : (ARCHIVE[0]?.id ?? PREFERRED_FRONT_ID)

export const media = (f: string) => import.meta.env.BASE_URL + 'media/' + f

/**
 * Whether this entry is a still rather than a clip.
 *
 * Read from the GENERATED map, which is probed from what is on disk — not from
 * the entry's own `kind`, which is editorial and has been wrong: `file09` was
 * flagged `photo` for months as an icon preview while being a video. Everything
 * that decides between an `<img>` and a `<video>` asks this, because getting it
 * from the editorial field means a broken frame whenever the two disagree.
 */
export const isStill = (id: string): boolean => MEDIA_KIND[id] === 'photo'

/** The ladder's extension: a clip's renditions are `.mp4`, a still's are `.jpg`. */
const ladder = (id: string): 'mp4' | 'jpg' => (isStill(id) ? 'jpg' : 'mp4')

/**
 * `?v=` is the rendition's content hash from the generated metadata. The
 * filenames are stable across edits and the host caches them for ten minutes,
 * so without the version a re-rendered poster (or a replaced clip) keeps
 * serving from the browser's cache after it has changed — the owner's first
 * real thumbnail edit looked like it had done nothing for exactly that reason.
 * An id without a version (never true after gen:media-meta, but stated) gets
 * the bare URL rather than a broken one.
 */
const versioned = (id: string, file: string, kind: 'full' | 'thumb' | 'poster') => {
  const v = MEDIA_VERSION[id]?.[kind]
  return media(v ? `${file}?v=${v}` : file)
}

export const thumbSrc = (id: string) => versioned(id, `${id}_thumb.${ladder(id)}`, 'thumb')
export const fullSrc = (id: string) => versioned(id, `${id}_full.${ladder(id)}`, 'full')
/** Always a JPEG: it is a still by definition, whatever the entry is. */
export const posterSrc = (id: string) => versioned(id, `${id}_poster.jpg`, 'poster')
