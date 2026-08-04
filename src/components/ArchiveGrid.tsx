import { useEffect, useMemo, useRef, useState } from 'react'
import { animate, stagger } from 'animejs'
import { ARCHIVE } from '../data/archive'
import { paginate } from '../lib/paginate'
import { useCardsPerPage } from '../hooks/useCardsPerPage'
import { useArchiveSelection } from '../lib/selection'
import { prefersReducedMotion } from '../lib/perfTier'
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

  // The page turn. A new page used to replace the old one between frames, which
  // at six tiles reads as a flicker rather than as a change of page.
  //
  // Deliberately an entrance only, not a crossfade: the outgoing tiles are gone
  // the moment React re-renders, and holding them would mean keeping two pages
  // of posters mounted to animate one away. The direction is carried by which
  // side the tiles arrive from, so the beat still says which way you moved.
  const cardsRef = useRef<HTMLDivElement | null>(null)
  const previous = useRef(safePage)
  useEffect(() => {
    const from = previous.current
    previous.current = safePage
    if (from === safePage || !cardsRef.current || prefersReducedMotion()) return
    const cards = cardsRef.current.querySelectorAll('[data-card]')
    if (!cards.length) return
    // Transform and opacity only, per the binding rules.
    animate(cards, {
      opacity: [0, 1],
      translateX: [safePage > from ? 26 : -26, 0],
      duration: 260,
      delay: stagger(28),
      ease: 'outQuad',
    })
  }, [safePage])

  return (
    <div className="panel archive-grid">
      <div className="grid-cards" ref={cardsRef}>
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
