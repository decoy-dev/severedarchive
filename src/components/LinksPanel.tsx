import type { ReactNode } from 'react'

/**
 * Three large cards rather than three rows. The panel has the full height of
 * the terminal body and was spending it on a stack of 48px list rows; the icon
 * is the focus point now, with the words beneath it.
 *
 * The grid is `auto-fit` with a floor rather than `repeat(3, 1fr)`: at a fourth
 * link it wraps into a 2×2 on its own, which is the shape asked for without a
 * second rule to keep in step.
 */
type Link = {
  label: string
  value: string
  href: string
  /** Drawn on a 32-unit grid in `currentColor`, so it takes the accent with the card. */
  icon: ReactNode
}

const LINKS: Link[] = [
  {
    label: 'INSTAGRAM',
    value: '@severedarchive',
    href: 'https://instagram.com/severedarchive',
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
  {
    label: 'MAIL',
    value: 'CONTACT@SEVEREDARCHIVE',
    href: 'mailto:hello@example.com',
    icon: (
      <>
        <rect x="3" y="7" width="26" height="18" rx="2" />
        {/* The flap. On hover it swings up about its own top edge — the
            envelope opening — and the letter behind it rises into view. */}
        <path className="ico-letter" d="M8.5 13 L23.5 13 L23.5 22 L8.5 22 Z" />
        <path className="ico-flap" d="M3.8 8.6 L16 18 L28.2 8.6" />
      </>
    ),
  },
  {
    label: 'COMMISSIONS',
    value: 'STATUS: OPEN',
    href: '#',
    icon: (
      <>
        {/* An inbox: the tray, its shoulders, and the slot the work lands in.
            On hover an arrow rises out of it. */}
        <path className="ico-arrow" d="M16 11.5 L16 1.8 M12.2 5.4 L16 1.6 L19.8 5.4" />
        <path d="M4 18.5 L8.2 6.8 A1.6 1.6 0 0 1 9.7 5.8 L22.3 5.8 A1.6 1.6 0 0 1 23.8 6.8 L28 18.5" />
        <path d="M4 18.5 L4 24.6 A1.6 1.6 0 0 0 5.6 26.2 L26.4 26.2 A1.6 1.6 0 0 0 28 24.6 L28 18.5 L21.3 18.5 A1 1 0 0 0 20.3 19.3 A4.5 4.5 0 0 1 11.7 19.3 A1 1 0 0 0 10.7 18.5 Z" />
      </>
    ),
  },
]

export default function LinksPanel() {
  return (
    <div className="panel links-panel">
      {LINKS.map((l) => {
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
              viewBox="0 0 32 32"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
              focusable="false"
            >
              {l.icon}
            </svg>
            <span className="link-card-label">{l.label}</span>
            <span className="link-card-value tw-dim">{l.value}</span>
          </a>
        )
      })}
    </div>
  )
}
