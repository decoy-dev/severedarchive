import { useMemo, useState } from 'react'
import { ARCHIVE } from '../data/archive'
import { paginate } from '../lib/paginate'
import { useCardsPerPage } from '../hooks/useCardsPerPage'
import { useArchiveSelection } from '../lib/selection'
import FileCard from './FileCard'

/**
 * Grid is the same list at a larger scale — a wall of poster tiles, nothing
 * more (spec §2). No focus-to-stage zoom, no SND toggle, no VideoDirector: a
 * tile click hands off to the one activation policy, which switches the view
 * back to LIST and opens the file's window. The grid never decides that
 * itself and must not import DesktopContext.
 */
export default function ArchiveGrid() {
  const perPage = useCardsPerPage()
  const pages = useMemo(() => paginate(ARCHIVE, perPage), [perPage])
  const [page, setPage] = useState(0)
  const { activate } = useArchiveSelection()
  const safePage = Math.min(page, pages.length - 1)

  return (
    <div className="panel archive-grid">
      <div className="grid-cards">
        {pages[safePage].map((f) => (
          <FileCard key={f.id} file={f} onClick={() => activate(f.id, 'tile')} />
        ))}
      </div>
      {pages.length > 1 && (
        <div className="grid-pager">
          <button aria-label="Previous page" onClick={() => setPage((p) => Math.max(0, p - 1))}>◄</button>
          <span>{String(safePage + 1).padStart(2, '0')}/{String(pages.length).padStart(2, '0')}</span>
          <button aria-label="Next page" onClick={() => setPage((p) => Math.min(pages.length - 1, p + 1))}>►</button>
        </div>
      )}
    </div>
  )
}
