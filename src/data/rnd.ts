import { MEDIA_META, type MediaMeta } from './mediaMeta.generated'
import RND_ENTRIES from './rnd.json'
import { fullSrc, posterSrc, thumbSrc } from './archive'

/**
 * The R&D collection — "experiments, side quests, proof of life and concepts".
 *
 * A parallel to the archive, deliberately simpler: stills only, no window
 * manager, no hand-authored source array, no overrides file. Every R&D entry is
 * uploaded through the admin pipeline and lands in `rnd.json`, so this module is
 * just `rnd.json` joined with the media metadata the ingest run probes. The id
 * of every R&D entry is `rnd_`-prefixed (`scripts/write-entry.mjs` under
 * `COLLECTION=rnd`), which keeps its renditions from ever colliding with an
 * archive id in the shared `public/media` directory.
 *
 * The URL helpers are reused straight from `archive.ts`: they key off the same
 * generated `MEDIA_KIND`/`MEDIA_VERSION` maps by id, so a `rnd_` id resolves to
 * `<id>_thumb.jpg?v=<hash>` exactly as an archive still does. One versioning
 * rule, one cache-bust, no second copy to drift.
 */

/** Hand-authored editorial fields; everything measurable comes from ffprobe. */
export type RndEntry = {
  id: string
  /** Display id, UPPER_SNAKE — what the tile and caption show. */
  name: string
  /** Always 'JPG' for R&D — the collection is stills only. */
  ext: string
  /** Always 'photo'. Kept for parity with the archive row shape the pipeline writes. */
  kind: 'photo'
  /** The one-word register: "experiment", "side quest", "proof of life", "concept". */
  tagline: string
  /** The caption body shown in the focused view. */
  description: string
  date: string
  year: string
  /** Where "VIEW POST" links; http(s) only, enforced by the Worker's validation. */
  postUrl: string
}

export type RndFile = RndEntry & MediaMeta

const ENTRIES = RND_ENTRIES as RndEntry[]

/** Newest first, ties broken on name so the order is total across builds. */
const byNewest = (a: RndEntry, b: RndEntry): number =>
  a.date === b.date ? a.name.localeCompare(b.name) : b.date.localeCompare(a.date)

/**
 * An R&D entry with no generated metadata is a build error, not a runtime
 * fallback — the same rule the archive holds itself to. A missing width would
 * silently lay the focused frame out at the wrong aspect and nobody would see it
 * until a portrait render arrived letterboxed. The throw fires at module load.
 */
export const RND: RndFile[] = [...ENTRIES].sort(byNewest).map((e) => {
  const meta = MEDIA_META[e.id]
  if (!meta) throw new Error(`rnd: ${e.id} has no generated media metadata (run npm run gen:media-meta)`)
  return { ...e, ...meta }
})

// A static id→entry lookup built once at load: string keys, no runtime
// insertion, so a Record rather than a Map (project rule ts-set-map).
const BY_ID: Record<string, RndFile> = Object.fromEntries(RND.map((f) => [f.id, f]))

export const rndById = (id: string): RndFile | undefined => BY_ID[id]
export const isRndId = (id: string): boolean => Object.hasOwn(BY_ID, id)

/** The compressed grid thumbnail (~416px long edge). */
export const rndThumbSrc = (id: string): string => thumbSrc(id)
/** The full rendition (≤1440px long edge), loaded on demand at focus time only. */
export const rndFullSrc = (id: string): string => fullSrc(id)
/** The cropped poster still, used where a fixed-box image is wanted. */
export const rndPosterSrc = (id: string): string => posterSrc(id)

export const rndAspect = (f: RndFile): number => f.width / f.height

const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC']

/**
 * `28 AUG 2026`. R&D entries always carry a full calendar date (the uploader
 * requires one), so unlike the archive's `formatEntryDate` there is no
 * year-only branch to fall back to.
 */
export const formatRndDate = (f: RndFile): string => {
  const [y, m, d] = f.date.split('-')
  const month = MONTHS[Number(m) - 1] ?? m
  return `${d} ${month} ${y}`
}
