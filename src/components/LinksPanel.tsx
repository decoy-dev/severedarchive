import type { ReactNode } from 'react'
import { SITE_CONTENT, type LinkIcon } from '../data/content'

/**
 * Three large cards rather than three rows. The panel has the full height of
 * the terminal body and was spending it on a stack of 48px list rows; the icon
 * is the focus point now, with the words beneath it.
 *
 * The grid is `auto-fit` with a floor rather than `repeat(3, 1fr)`: at a fourth
 * link it wraps into a 2×2 on its own, which is the shape asked for without a
 * second rule to keep in step.
 */
type IconSpec = {
  /**
   * `currentColor`, so it takes the accent with the card.
   *
   * MAIL and COMMISSIONS are Lucide's `mail` and `inbox` (ISC, © Lucide Icons
   * and Contributors), on their native 24-unit grid — my hand-drawn versions of
   * both read badly. INSTAGRAM stays hand-drawn on a 32-unit grid because
   * Lucide carries no brand marks.
   */
  icon: ReactNode
  viewBox: string
  strokeWidth: number
}

const ICONS: Record<LinkIcon, IconSpec> = {
  instagram: {
    viewBox: '0 0 32 32',
    strokeWidth: 1.5,
    icon: (
      <>
        <rect x="4" y="4" width="24" height="24" rx="7" />
        <circle cx="16" cy="16" r="6.5" />
        <circle cx="23.2" cy="8.8" r="1.4" fill="currentColor" stroke="none" />
        {/* The flash firing: a burst at the bulb that blooms and is gone. */}
        <circle className="ico-flash" cx="23.2" cy="8.8" r="1.4" fill="currentColor" stroke="none" />
      </>
    ),
  },
  mail: {
    viewBox: '0 0 24 24',
    strokeWidth: 2,
    icon: (
      <>
        {/* Two of Lucide's own icons rather than one animated into the other:
            `mail` crossfades to `mail-open` on hover. Flipping the closed
            envelope's flap by transform looked like a box inside a box — the
            flap is a curve, and mirroring it just laid it over the body. */}
        <g className="ico-closed">
          <rect x="2" y="4" width="20" height="16" rx="2" />
          <path d="m22 7-8.991 5.727a2 2 0 0 1-2.009 0L2 7" />
        </g>
        {/* Lifted 2 units, because Lucide's open envelope is that much taller
            than its closed one (bottom edge at y22 against y20) and the icon
            must not appear to grow downward as it opens. */}
        <g className="ico-open" transform="translate(0,-2)">
          <path d="M21.2 8.4c.5.38.8.97.8 1.6v10a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V10a2 2 0 0 1 .8-1.6l8-6a2 2 0 0 1 2.4 0l8 6Z" />
          <path d="m22 10-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 10" />
        </g>
      </>
    ),
  },
  inbox: {
    viewBox: '0 0 24 24',
    strokeWidth: 2,
    icon: (
      <>
        {/* An arrow rises out of the tray on hover, ABOVE the viewBox — the
            icon fills its grid to y=4 and an arrow drawn inside it collided
            with the tray's own shoulders. `.link-icon` lets it overflow. */}
        <path className="ico-arrow" d="M12 1 L12 -7 M8.8 -3.8 L12 -7 L15.2 -3.8" />
        {/* Lucide's inbox: the slot, then the tray around it. */}
        <polyline points="22 12 16 12 14 15 10 15 8 12 2 12" />
        <path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z" />
      </>
    ),
  },
}

export default function LinksPanel() {
  return (
    <div className="panel links-panel">
      {SITE_CONTENT.links.map((l) => {
        const spec = ICONS[l.icon]
        // A mailto and an in-page anchor must not open a tab; only a real
        // outbound link does.
        const external = l.href.startsWith('http')
        return (
          <a
            key={l.label}
            className="link-card"
            href={l.href}
            target={external ? '_blank' : undefined}
            rel={external ? 'noreferrer noopener' : undefined}
          >
            <svg
              className="link-icon"
              viewBox={spec.viewBox}
              fill="none"
              stroke="currentColor"
              strokeWidth={spec.strokeWidth}
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
              focusable="false"
            >
              {spec.icon}
            </svg>
            <span className="link-card-label">{l.label}</span>
            <span className="link-card-value tw-dim">{l.value}</span>
          </a>
        )
      })}
    </div>
  )
}
