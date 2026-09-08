import { useEffect, useRef } from 'react'
import { animate, stagger } from 'animejs'
import { prefersReducedMotion } from '../lib/perfTier'
import type { OpenOrigin } from '../lib/openFrom'
import { RND } from '../data/rnd'
import RndCard from './RndCard'

/** How many placeholder cells fill an empty wall — one desktop viewport's worth. */
const EMPTY_TILES = 6

/**
 * The R&D wall: a uniform square grid that scrolls inside the terminal body.
 *
 * Squares (not masonry) keep DOM order = visual order = paging order, which the
 * focused view's arrows depend on, and never letterbox whatever the client
 * uploads. The wall scrolls internally (`.rnd-scroll` owns the overflow) rather
 * than paginating like the archive grid — quantity and texture are the point of
 * a research drawer, and a pager is the wrong metaphor for it.
 */
export default function RndGrid({ onOpen }: {
  onOpen: (index: number, origin: OpenOrigin) => void
}) {
  const gridRef = useRef<HTMLDivElement | null>(null)

  // The wall is drawn, not swapped in: a fade + rise, staggered, the same shape
  // the archive page-turn uses — but VERTICAL, because horizontal travel is
  // reserved for arrow paging in the focused view. Runs once on mount; tiles
  // scrolled into view later were never part of the entrance.
  const entered = useRef(false)
  useEffect(() => {
    if (entered.current || !gridRef.current || prefersReducedMotion()) return
    entered.current = true
    const cards = gridRef.current.querySelectorAll('[data-rnd-card]')
    if (!cards.length) return
    animate(cards, {
      opacity: [0, 1],
      translateY: [12, 0],
      duration: 260,
      delay: stagger(28),
      ease: 'outQuad',
    })
  }, [])

  const empty = RND.length === 0

  return (
    <div className="rnd-grid" ref={gridRef}>
      {RND.map((f, i) => (
        <RndCard key={f.id} file={f} onOpen={(origin) => onOpen(i, origin)} />
      ))}
      {empty && Array.from({ length: EMPTY_TILES }).map((_, i) => (
        <div key={`empty-${i}`} className="rnd-tile rnd-tile--empty" aria-hidden="true">
          <span>NO SIGNAL</span>
        </div>
      ))}
    </div>
  )
}
