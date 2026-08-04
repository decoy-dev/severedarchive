import { useEffect, useRef, type ReactNode, type RefObject } from 'react'
import { animate } from 'animejs'
import { prefersReducedMotion, type PerfTier } from '../lib/perfTier'
import AdminLogin from './AdminLogin'
import SessionPulse from './SessionPulse'

export type TabId = 'archive' | 'about' | 'links'
const TABS: { id: TabId; label: string }[] = [
  { id: 'archive', label: 'ARCHIVE' },
  { id: 'about', label: 'ABOUT' },
  { id: 'links', label: 'LINKS' },
]

export default function TerminalWindow({
  tab, onTab, bodyRef, footer, tier, children,
}: {
  tab: TabId
  onTab: (t: TabId) => void
  bodyRef: RefObject<HTMLDivElement | null>
  footer?: ReactNode
  tier: PerfTier
  children: ReactNode
}) {
  // Binding ruling 7: this is a fixed background layer, not a window. It is not
  // draggable, never raises above a file window and has no focus rank — so it
  // registers nothing with Desktop and needs no drag handle.
  const rootRef = useRef<HTMLElement | null>(null)
  const entered = useRef(false)

  // spec: the window draws in after boot, rather than appearing as an instant swap
  useEffect(() => {
    if (!rootRef.current || entered.current) return
    entered.current = true
    if (prefersReducedMotion()) { rootRef.current.style.opacity = '1'; return }
    animate(rootRef.current, { opacity: [0, 1], scale: [0.985, 1], duration: 300, ease: 'outQuad' })
  }, [])

  return (
    <section className="terminal-window glass" data-tab={tab} ref={rootRef}>
      {/* The pulse canvas is a child of the bar and covers it, so the wave
          fills this element and nothing else. The dot is its origin: the wave
          leaves from wherever the dot actually renders, measured rather than
          assumed. */}
      <header className="tw-titlebar">
        <span className="tw-title">FILE SYSTEM</span>
        <span className="tw-status">
          <SessionPulse tier={tier} />
          <span className="tw-dim">SESSION OPEN</span>
        </span>
      </header>
      <nav className="tw-tabs" role="tablist" aria-label="Sections">
        {TABS.map((t) => (
          <button key={t.id} role="tab" aria-selected={tab === t.id}
            className={tab === t.id ? 'tw-tab is-active' : 'tw-tab'}
            onClick={() => onTab(t.id)}>
            {t.label}
          </button>
        ))}
      </nav>
      <div className="tw-body" ref={bodyRef}>{children}</div>
      <footer className="tw-footer">
        {/* The way in to the backend. In the footer rather than the title bar:
            it is for one person and it should not compete with the archive. */}
        <span className="tw-footer-left"><AdminLogin />{footer}</span>
        <span className="tw-dim">SVRD.ARCV V1.0 · 2026</span>
      </footer>
    </section>
  )
}
