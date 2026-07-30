import { useMemo, useRef, useState, useLayoutEffect, useEffect, useCallback } from 'react'
import { ARCHIVE, type ArchiveFile } from '../data/archive'
import { VideoDirector } from '../lib/videoDirector'
import { paginate } from '../lib/paginate'
import { captureRects, playFlip } from '../lib/flip'
import type { PerfTier } from '../lib/perfTier'
import { useCardsPerPage } from '../hooks/useCardsPerPage'
import FileCard from './FileCard'

export default function ArchiveGrid({ tier }: { tier: PerfTier }) {
  const director = useMemo(() => new VideoDirector(4), [])
  const perPage = useCardsPerPage()
  const pages = useMemo(() => paginate(ARCHIVE, perPage), [perPage])
  const [page, setPage] = useState(0)
  const [focusedId, setFocusedId] = useState<string | null>(null)
  const [muted, setMuted] = useState(true)
  const rootRef = useRef<HTMLDivElement | null>(null)
  const pendingRects = useRef<Map<HTMLElement, DOMRect> | null>(null)
  const safePage = Math.min(page, pages.length - 1)

  const cardEls = useCallback(
    () => Array.from(rootRef.current?.querySelectorAll<HTMLElement>('[data-card]') ?? []),
    [],
  )

  const setFocus = (id: string | null) => {
    pendingRects.current = captureRects(cardEls())
    setFocusedId(id)
    setMuted(true)
    director.setFocus(id)
  }

  useLayoutEffect(() => {
    if (!pendingRects.current) return
    playFlip(pendingRects.current, cardEls())
    pendingRects.current = null
  }, [focusedId, cardEls])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setFocus(null) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const focusedFile: ArchiveFile | undefined = ARCHIVE.find((f) => f.id === focusedId)

  return (
    <div className={focusedId ? 'panel archive-grid has-focus' : 'panel archive-grid'}
      data-focused={focusedId ?? ''} ref={rootRef}>
      <div className="grid-cards">
        {pages[safePage].map((f) => (
          <FileCard key={f.id} file={f} director={director} tier={tier}
            focused={f.id === focusedId} muted={muted}
            onClick={() => setFocus(f.id === focusedId ? null : f.id)} />
        ))}
      </div>
      {focusedFile && (
        <div className="focus-hud glass">
          <span className="focus-meta">
            FILE_{focusedFile.index} // {focusedFile.name}.{focusedFile.ext}
            <span className="tw-dim"> · {focusedFile.tagline.toUpperCase()} · {focusedFile.year}</span>
          </span>
          <span className="focus-controls">
            <button aria-label="Toggle sound" onClick={() => setMuted((m) => !m)}>
              {muted ? 'SND OFF' : 'SND ON'}
            </button>
            <button aria-label="Close file" onClick={() => setFocus(null)}>CLOSE [ESC]</button>
          </span>
        </div>
      )}
      {pages.length > 1 && !focusedId && (
        <div className="grid-pager">
          <button aria-label="Previous page" onClick={() => setPage((p) => Math.max(0, p - 1))}>◄</button>
          <span>{String(safePage + 1).padStart(2, '0')}/{String(pages.length).padStart(2, '0')}</span>
          <button aria-label="Next page" onClick={() => setPage((p) => Math.min(pages.length - 1, p + 1))}>►</button>
        </div>
      )}
    </div>
  )
}
