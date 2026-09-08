import { centreOf, type OpenOrigin } from '../lib/openFrom'
import { rndThumbSrc, type RndFile } from '../data/rnd'

/**
 * One R&D grid tile: a compressed thumbnail and a label bar.
 *
 * A squared clone of `FileCard` — it reuses the `.file-card` classes outright so
 * the hover/focus accent (border, tint, image brighten) is the site's one
 * established treatment and not a fourth one invented for this tab. The image is
 * the `_thumb` rendition with `loading="lazy"`, so a wall of experiments costs
 * only the rows in view; the full image is never mounted here.
 */
export default function RndCard({ file, onOpen }: {
  file: RndFile
  /** Handed the tile's centre so the focused view can grow out of it. */
  onOpen: (origin: OpenOrigin) => void
}) {
  return (
    <button
      type="button"
      data-rnd-card
      className="file-card rnd-tile"
      onClick={(e) => onOpen(centreOf(e.currentTarget))}
      aria-label={`Open ${file.name}`}
    >
      <span className="file-card-media">
        <img src={rndThumbSrc(file.id)} alt={file.name} loading="lazy" draggable={false} />
      </span>
      <span className="file-card-label">
        <span className="file-card-name">{file.name}</span>
        <span className="tw-dim">{file.year}</span>
      </span>
    </button>
  )
}
