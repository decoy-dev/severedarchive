import { useMemo, useState } from 'react'
import { ARCHIVE } from '../data/archive'
import { VideoDirector } from '../lib/videoDirector'
import { paginate } from '../lib/paginate'
import type { PerfTier } from '../lib/perfTier'
import { useCardsPerPage } from '../hooks/useCardsPerPage'
import FileCard from './FileCard'

export default function ArchiveGrid({ tier }: { tier: PerfTier }) {
  const director = useMemo(() => new VideoDirector(4), [])
  const perPage = useCardsPerPage()
  const pages = useMemo(() => paginate(ARCHIVE, perPage), [perPage])
  const [page, setPage] = useState(0)
  const safePage = Math.min(page, pages.length - 1)

  return (
    <div className="panel archive-grid" data-focused="">
      <div className="grid-cards">
        {pages[safePage].map((f) => (
          <FileCard key={f.id} file={f} director={director} tier={tier}
            focused={false} muted onClick={() => {}} />
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
