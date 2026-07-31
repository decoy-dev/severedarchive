import { useEffect, useRef, type ReactNode, type RefObject } from 'react'
import { animate } from 'animejs'
import { prefersReducedMotion } from '../lib/perfTier'

export type TabId = 'archive' | 'about' | 'links'
const TABS: { id: TabId; label: string }[] = [
  { id: 'archive', label: 'ARCHIVE' },
  { id: 'about', label: 'ABOUT' },
  { id: 'links', label: 'LINKS' },
]

export default function TerminalWindow({
  tab, onTab, bodyRef, footer, children,
}: {
  tab: TabId
  onTab: (t: TabId) => void
  bodyRef: RefObject<HTMLDivElement | null>
  footer?: ReactNode
  children: ReactNode
}) {
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
      <header className="tw-titlebar">
        <span className="tw-title">FILE SYSTEM</span>
        <span className="tw-status"><span className="tw-dim">SESSION OPEN</span></span>
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
        <span>{footer}</span>
        <span className="tw-dim">SVRD.ARCV V1.0 · 2026</span>
      </footer>
    </section>
  )
}
