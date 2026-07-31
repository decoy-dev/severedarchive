import { useCallback, useRef, type KeyboardEvent } from 'react'
import { ARCHIVE, fileById, formatDuration, formatResolution, posterSrc } from '../data/archive'
import { useArchiveSelection } from '../lib/selection'
import { useMediaController } from './MediaLayer'

/**
 * Two-column file explorer (spec §2). Rows on the left, a slot-based preview
 * pane on the right. Both are activation targets — a row click or a preview
 * click open the file's window; hover/keyboard-focus only select, tracking the
 * activation contract in `src/lib/selection.tsx`.
 *
 * Critical constraint (ownership contract §2, "the whole reason this exists"):
 * the preview pane renders an EMPTY, stable slot and registers it with
 * `mediaController`. It must never render a `<video>` itself — that shape is
 * exactly what crashed the previous plan (a keyed video reparented out from
 * under React, then deleted on the next render). The registration ref is a
 * stable `useCallback`, not an inline arrow, so it does not re-fire on every
 * render.
 */
export default function ArchiveExplorer() {
  const { selectedId, select, activate } = useArchiveSelection()
  const controller = useMediaController()
  const rowRefs = useRef(new Map<string, HTMLButtonElement>())

  const registerPreviewSlot = useCallback(
    (el: HTMLDivElement | null) => controller?.registerSlot('preview', el),
    [controller],
  )

  const selectedFile = fileById(selectedId) ?? ARCHIVE[0]

  const moveSelection = (dir: 1 | -1) => {
    const i = ARCHIVE.findIndex((f) => f.id === selectedId)
    const next = ARCHIVE[((i < 0 ? 0 : i) + dir + ARCHIVE.length) % ARCHIVE.length]
    select(next.id)
    rowRefs.current.get(next.id)?.focus()
  }

  // Up/down move the selection, Enter opens; left/right stay tab switching
  // (Desktop's single global keydown listener) and are not touched here.
  const onListKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); moveSelection(1) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); moveSelection(-1) }
    else if (e.key === 'Enter') { e.preventDefault(); activate(selectedId, 'keyboard') }
  }

  const openPreview = () => activate(selectedFile.id, 'preview')

  return (
    <div className="archive-explorer">
      <div className="explorer-list" role="listbox" aria-label="Archive files" onKeyDown={onListKeyDown}>
        {ARCHIVE.map((f) => (
          <button
            key={f.id}
            ref={(el) => { if (el) rowRefs.current.set(f.id, el); else rowRefs.current.delete(f.id) }}
            data-file-row
            role="option"
            aria-selected={f.id === selectedId}
            tabIndex={f.id === selectedId ? 0 : -1}
            className={f.id === selectedId ? 'explorer-row is-selected' : 'explorer-row'}
            onMouseEnter={() => select(f.id)}
            onFocus={() => select(f.id)}
            onClick={() => activate(f.id, 'row')}
          >
            <span className="explorer-row-index">{f.index}</span>
            <span className="explorer-row-name">{f.name}<span className="tw-dim">.{f.ext}</span></span>
          </button>
        ))}
      </div>

      <div className="explorer-preview">
        <div className="preview-frame-wrap">
          <div
            className="preview-frame"
            style={{ aspectRatio: `${selectedFile.width} / ${selectedFile.height}` }}
            role="button"
            tabIndex={0}
            aria-label={`Open FILE_${selectedFile.index}`}
            onClick={openPreview}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openPreview() }
            }}
          >
            {/* Poster underneath, slot on top: the slot is empty whenever this
                file's node is elsewhere (per window > preview slot priority),
                and the poster shows through — no min-height hack, no state
                needed here to know whether the video is "away". */}
            <img className="preview-poster" src={posterSrc(selectedFile.id)} alt="" />
            <div className="preview-slot" data-preview-slot ref={registerPreviewSlot} />
          </div>
        </div>
        <div className="preview-meta">
          <div className="preview-meta-head">
            FILE_{selectedFile.index} <span className="tw-dim">·</span> {selectedFile.name}.{selectedFile.ext}
          </div>
          <div className="preview-meta-sub tw-dim">
            {selectedFile.tagline.toUpperCase()} · {formatDuration(selectedFile.durationSec)} · {selectedFile.year} · {formatResolution(selectedFile)}
          </div>
        </div>
      </div>
    </div>
  )
}
