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
        <path d="M3.8 8.6 L16 18 L28.2 8.6" />
      </>
    ),
  },
  {
    label: 'COMMISSIONS',
    value: 'STATUS: OPEN',
    href: '#',
    icon: (
      <>
        {/* A frame with a mark in it rather than a literal envelope or cart:
            the status is the content here, not the medium. */}
        <rect x="4" y="6" width="24" height="20" rx="2" />
        <path d="M10.5 16.4 L14.4 20.2 L21.8 12.4" />
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
