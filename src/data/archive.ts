export type ArchiveFile = {
  id: string
  index: string
  name: string
  ext: 'MP4'
  tagline: string
  duration: string
  year: string
}

export const ARCHIVE: ArchiveFile[] = [
  { id: 'file01', index: '001', name: 'CHROME_SEQ', ext: 'MP4', tagline: 'liquid metal study', duration: '00:12', year: '2026' },
  { id: 'file02', index: '002', name: 'HALO_DRIFT', ext: 'MP4', tagline: 'render set to sound', duration: '00:10', year: '2026' },
  { id: 'file03', index: '003', name: 'GLASS_RITE', ext: 'MP4', tagline: 'refraction pass', duration: '00:08', year: '2025' },
  { id: 'file04', index: '004', name: 'WIRE_SAINT', ext: 'MP4', tagline: 'neo-2000s loop', duration: '00:11', year: '2025' },
  { id: 'file05', index: '005', name: 'COLD_BLOOM', ext: 'MP4', tagline: 'particle bloom', duration: '00:09', year: '2025' },
  { id: 'file06', index: '006', name: 'STEEL_HYMN', ext: 'MP4', tagline: 'metalheart sketch', duration: '00:14', year: '2024' },
  { id: 'file07', index: '007', name: 'VELVET_ROT', ext: 'MP4', tagline: 'decay pass', duration: '00:13', year: '2025' },
  { id: 'file08', index: '008', name: 'NULL_CHOIR', ext: 'MP4', tagline: 'vertical study', duration: '00:07', year: '2025' },
  { id: 'file09', index: '009', name: 'SALT_INDEX', ext: 'MP4', tagline: 'crystalline loop', duration: '00:15', year: '2024' },
  { id: 'file10', index: '010', name: 'MERCY_LOOP', ext: 'MP4', tagline: 'square format test', duration: '00:09', year: '2024' },
  { id: 'file11', index: '011', name: 'ASH_MERIDIAN', ext: 'MP4', tagline: 'particle drift', duration: '00:11', year: '2024' },
  { id: 'file12', index: '012', name: 'GHOST_PROTOCOL', ext: 'MP4', tagline: 'final transmission', duration: '00:10', year: '2026' },
]

// Which file leads the stack (and seeds the backdrop) on load.
export const DEFAULT_FRONT_ID = 'file03'

export const media = (f: string) => import.meta.env.BASE_URL + 'media/' + f
export const thumbSrc = (id: string) => media(`${id}_thumb.mp4`)
export const fullSrc = (id: string) => media(`${id}_full.mp4`)
export const posterSrc = (id: string) => media(`${id}_poster.jpg`)
