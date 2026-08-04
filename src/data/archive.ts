import { MEDIA_META, type MediaMeta } from './mediaMeta.generated'
import UPLOADED_ENTRIES from './entries.json'

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
  { id: 'file09', name: 'SALT_INDEX', ext: 'MP4', kind: 'photo', tagline: 'crystalline loop', year: '2024' , postUrl: INSTAGRAM_PROFILE },
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

/** Newest first. Ties break on name so the order is total across builds. */
const byDateDesc = (a: ArchiveEntry, b: ArchiveEntry): number =>
  a.date === b.date ? a.name.localeCompare(b.name) : (b.date ?? '').localeCompare(a.date ?? '')

/**
 * Uploads on top, newest first; the hand-arranged twelve beneath, in their
 * order. See `ArchiveEntry.date` for why the twelve are not swept into the
 * sort.
 */
const ALL_ENTRIES: ArchiveEntry[] = [...UPLOADED].sort(byDateDesc).concat(ENTRIES)

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

// Which file leads the stack (and seeds the backdrop) on load.
export const DEFAULT_FRONT_ID = 'file03'

export const media = (f: string) => import.meta.env.BASE_URL + 'media/' + f
export const thumbSrc = (id: string) => media(`${id}_thumb.mp4`)
export const fullSrc = (id: string) => media(`${id}_full.mp4`)
export const posterSrc = (id: string) => media(`${id}_poster.jpg`)
