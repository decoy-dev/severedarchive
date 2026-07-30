import type { ReactNode, RefObject } from 'react'

export type TabId = 'archive' | 'about' | 'links'
const TABS: { id: TabId; label: string }[] = [
  { id: 'archive', label: 'ARCHIVE' },
  { id: 'about', label: 'ABOUT' },
  { id: 'links', label: 'LINKS' },
]

export default function TerminalWindow({
  tab, onTab, onBell, bodyRef, footer, children,
}: {
  tab: TabId
  onTab: (t: TabId) => void
  onBell: () => void
  bodyRef: RefObject<HTMLDivElement | null>
  footer?: ReactNode
  children: ReactNode
}) {
  return (
    <section className="terminal-window" data-tab={tab}>
      <header className="tw-titlebar">
        <span className="tw-title">SEVEREDARCHIVE <span className="tw-dim">// FILE SYSTEM</span></span>
        <span className="tw-status">
          <span className="tw-dim">SESSION OPEN</span>
          <button className="tw-bell" onClick={onBell} aria-label="Show notification">ALERT [1]</button>
        </span>
      </header>
      <nav className="tw-tabs" aria-label="Sections">
        {TABS.map((t) => (
          <button key={t.id} aria-selected={tab === t.id}
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
