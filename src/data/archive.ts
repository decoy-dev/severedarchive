import { MEDIA_META, type MediaMeta } from './mediaMeta.generated'

/** Hand-authored editorial fields. Everything measurable comes from ffprobe. */
type ArchiveEntry = {
  id: string
  index: string
  name: string
  ext: 'MP4'
  tagline: string
  year: string
}

export type ArchiveFile = ArchiveEntry & MediaMeta

const ENTRIES: ArchiveEntry[] = [
  { id: 'file01', index: '001', name: 'CHROME_SEQ', ext: 'MP4', tagline: 'liquid metal study', year: '2026' },
  { id: 'file02', index: '002', name: 'HALO_DRIFT', ext: 'MP4', tagline: 'render set to sound', year: '2026' },
  { id: 'file03', index: '003', name: 'GLASS_RITE', ext: 'MP4', tagline: 'refraction pass', year: '2025' },
  { id: 'file04', index: '004', name: 'WIRE_SAINT', ext: 'MP4', tagline: 'neo-2000s loop', year: '2025' },
  { id: 'file05', index: '005', name: 'COLD_BLOOM', ext: 'MP4', tagline: 'particle bloom', year: '2025' },
  { id: 'file06', index: '006', name: 'STEEL_HYMN', ext: 'MP4', tagline: 'metalheart sketch', year: '2024' },
  { id: 'file07', index: '007', name: 'VELVET_ROT', ext: 'MP4', tagline: 'decay pass', year: '2025' },
  { id: 'file08', index: '008', name: 'NULL_CHOIR', ext: 'MP4', tagline: 'vertical study', year: '2025' },
  { id: 'file09', index: '009', name: 'SALT_INDEX', ext: 'MP4', tagline: 'crystalline loop', year: '2024' },
  { id: 'file10', index: '010', name: 'MERCY_LOOP', ext: 'MP4', tagline: 'square format test', year: '2024' },
  { id: 'file11', index: '011', name: 'ASH_MERIDIAN', ext: 'MP4', tagline: 'particle drift', year: '2024' },
  { id: 'file12', index: '012', name: 'GHOST_PROTOCOL', ext: 'MP4', tagline: 'final transmission', year: '2026' },
]

/**
 * An entry with no generated metadata is a build error, not a runtime fallback:
 * a missing width silently becomes 16:9 everywhere and nobody notices. The
 * throw fires at module load, and `archive.test.ts` fires before that.
 */
export const ARCHIVE: ArchiveFile[] = ENTRIES.map((e) => {
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

// Which file leads the stack (and seeds the backdrop) on load.
export const DEFAULT_FRONT_ID = 'file03'

export const media = (f: string) => import.meta.env.BASE_URL + 'media/' + f
export const thumbSrc = (id: string) => media(`${id}_thumb.mp4`)
export const fullSrc = (id: string) => media(`${id}_full.mp4`)
export const posterSrc = (id: string) => media(`${id}_poster.jpg`)
