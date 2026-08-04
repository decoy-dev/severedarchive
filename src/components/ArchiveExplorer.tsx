import { useRef, type KeyboardEvent } from 'react'
import { ARCHIVE, fileById, formatDuration, formatResolution, posterSrc } from '../data/archive'
import { useArchiveSelection } from '../lib/selection'
import { useWindowView } from '../lib/windowRegistry'
import MediaKindIcon from './MediaKindIcon'
import WindowDashboard from './WindowDashboard'

/**
 * Two-column file explorer (spec §2). A thumbnail grid on the right, a standby
 * pane on the left. Hover and keyboard focus only select — they change the
 * metadata readout and the backdrop. Opening is a click, and it is the only
 * thing that ever starts playback.
 *
 * The pane deliberately registers NO media slot. Nothing previews here and
 * nothing decodes here; a file plays when it is opened into a window and not
 * before. (It used to hold the `preview` slot, which is why the media
 * lifecycle still supports one — windows and the mobile primary use the same
 * machinery. Nothing in this surface may ever render a `<video>` itself: that
 * shape is what crashed the pre-rewrite plan, a keyed video reparented out
 * from under React and then deleted on the next render.)
 */
export default function ArchiveExplorer() {
  const { selectedId, select, activate } = useArchiveSelection()
  // The registry, not DesktopContext: this surface must not depend on Desktop
  // (selection contract rule 1). Desktop publishes into it from above.
  const { windows: openWindows, focus, close, node: windowNode } = useWindowView()
  const rowRefs = useRef(new Map<string, HTMLButtonElement>())

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

  return (
    <div className="archive-explorer">
      {/* Thumbnail view, two columns — the Windows-explorer medium-icons shape
          rather than a text list. Each tile is still a row in the a11y sense:
          one listbox, roving tabindex, arrow keys move the selection. */}
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
            <span className="explorer-thumb">
              <img src={posterSrc(f.id)} alt="" loading="lazy" />
            </span>
            <span className="explorer-row-name">
              {/* The media-kind glyph stands where the 001/002 index used to.
                  Nothing in the interface numbers files any more — a file is
                  its name. */}
              <span className="explorer-row-kind"><MediaKindIcon kind={f.kind} /></span>
              {f.name}<span className="tw-dim">.{f.ext}</span>
            </span>
          </button>
        ))}
      </div>

      {/* One box, floor to ceiling. The selected-file readout used to be a
          separate strip under it; it now lives INSIDE the standby state, so the
          column is a single surface and the box gets that height back.

          The pane holds no media in either state. Nothing previews on hover and
          nothing decodes here: a file plays when it is opened into a window and
          not before, so this is a readout rather than a viewer.

          With nothing open it is the standby prompt plus the selected file.
          Once anything is open it is the dashboard for those windows — the box
          was otherwise dead space at exactly the moment there was most to
          report. */}
      <div className="explorer-preview">
        {openWindows.length > 0 ? (
          <WindowDashboard windows={openWindows} onFocus={focus} onClose={close} windowNode={windowNode} />
        ) : (
          <div className="preview-standby" data-preview-standby>
            <p className="standby-line">&gt; AWAITING SELECTION.</p>
            <p className="standby-line tw-dim">
              &gt; PLEASE CHOOSE A SUBJECT FROM THE LIST ON THE RIGHT.
              <span className="standby-caret" aria-hidden="true" />
            </p>
            <div className="preview-meta">
              <div className="preview-meta-head">
                {selectedFile.name}<span className="tw-dim">.{selectedFile.ext}</span>
              </div>
              <div className="preview-meta-sub tw-dim">
                {selectedFile.tagline.toUpperCase()} · {formatDuration(selectedFile.durationSec)} · {selectedFile.year} · {formatResolution(selectedFile)}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
