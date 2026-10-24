import { useCallback, useEffect, useRef } from 'react'
import { ARCHIVE, fileById, formatDuration, formatResolution, posterSrc } from '../data/archive'
import { useArchiveSelection } from '../lib/selection'
import MediaKindIcon from './MediaKindIcon'
import { useSwipe } from '../hooks/useSwipe'
import { useMediaController } from './MediaLayer'

/**
 * The mobile archive: one primary player and a single swipeable row of tiles
 * below it (contract Slice D). No windows exist at this width — the activation
 * policy already refuses to open one, and this surface never asks.
 *
 * Same slot discipline as the explorer, and for the same reason: the primary
 * view renders an EMPTY, stable slot registered with `mediaController` and a
 * poster underneath it. It must never render a `<video>` itself.
 *
 * Selection is the only verb here. Tapping a tile selects it, and so does
 * swiping the player — both land in the same place the desktop preview pane
 * does, which is why there is no mobile-only selection state.
 */
export default function ArchiveMobile() {
  const { selectedId, select, activate } = useArchiveSelection()
  const controller = useMediaController()
  const rowRef = useRef<HTMLDivElement | null>(null)
  const tileRefs = useRef(new Map<string, HTMLButtonElement>())

  const registerPrimarySlot = useCallback(
    (el: HTMLDivElement | null) => controller?.registerSlot('primary', el),
    [controller],
  )

  // Undefined only when the archive is empty — removing the last entry is a
  // real admin action, so this surface must survive it.
  const selectedFile = fileById(selectedId) ?? ARCHIVE.at(0)
  const index = ARCHIVE.findIndex((f) => f.id === selectedFile?.id)

  const step = (dir: 1 | -1) => {
    if (ARCHIVE.length === 0) return
    select(ARCHIVE[(index + dir + ARCHIVE.length) % ARCHIVE.length].id)
  }

  // Swiping left advances, matching the direction the row itself moves.
  const swipe = useSwipe(() => step(1), () => step(-1))

  // Keep the selected tile in view when selection changes from the player
  // rather than from a tap. `nearest` so a tap on a half-visible tile does not
  // yank the row, and inline-only so the page itself is never a scroll target.
  useEffect(() => {
    if (!selectedFile) return
    const el = tileRefs.current.get(selectedFile.id)
    if (!el || !rowRef.current) return
    const tile = el.getBoundingClientRect()
    const row = rowRef.current.getBoundingClientRect()
    if (tile.left >= row.left && tile.right <= row.right) return
    rowRef.current.scrollBy({ left: tile.left - row.left - (row.width - tile.width) / 2, behavior: 'smooth' })
  }, [selectedFile?.id])

  // Below every hook, so the early return cannot change hook order. The primary
  // slot is not registered: with nothing to play, the media layer has nowhere
  // to put anything.
  if (!selectedFile) {
    return (
      <div className="archive-mobile">
        <div className="primary-meta">
          <div className="primary-meta-head">&gt; NO FILES INDEXED.</div>
        </div>
      </div>
    )
  }

  return (
    <div className="archive-mobile">
      {/* Same true-frame construction as the explorer preview: the frame is
          sized by the file's real aspect ratio and fits whichever axis is
          tighter, so a portrait clip leaves the panel's own background visible
          beside it rather than being cropped or barred (§4.7). */}
      <div className="primary-wrap">
        <div
          className="primary-view"
          data-primary-view
          style={{ aspectRatio: `${selectedFile.width} / ${selectedFile.height}` }}
          onPointerDown={swipe.onPointerDown}
          onPointerUp={swipe.onPointerUp}
        >
          <img className="primary-poster" src={posterSrc(selectedFile.id)} alt="" />
          <div className="primary-slot" ref={registerPrimarySlot} />
        </div>
      </div>

      <div className="primary-meta">
        <div className="primary-meta-head">
          {selectedFile.name}<span className="tw-dim">.{selectedFile.ext}</span>
        </div>
        <div className="primary-meta-sub tw-dim">
          {selectedFile.tagline.toUpperCase()} · {formatDuration(selectedFile.durationSec)} · {selectedFile.year} · {formatResolution(selectedFile)}
        </div>
      </div>

      <div className="mobile-row" ref={rowRef} role="listbox" aria-label="Archive files">
        {ARCHIVE.map((f) => (
          <button
            key={f.id}
            ref={(el) => { if (el) tileRefs.current.set(f.id, el); else tileRefs.current.delete(f.id) }}
            data-file-tile
            role="option"
            aria-selected={f.id === selectedFile.id}
            className={f.id === selectedFile.id ? 'mobile-tile is-selected' : 'mobile-tile'}
            onClick={() => activate(f.id, 'tile')}
          >
            <img src={posterSrc(f.id)} alt="" loading="lazy" />
            {/* Overlaid rather than beside the thumbnail: a mobile tile is
                56px of poster with no room for a caption, and the glyph is
                the only thing distinguishing a still from a clip here. */}
            <span className="mobile-tile-kind"><MediaKindIcon kind={f.kind} /></span>
          </button>
        ))}
      </div>
    </div>
  )
}
