import { useCallback, useEffect, useRef, useState } from 'react'
import { animate } from 'animejs'
import BackgroundVideo from './components/BackgroundVideo'
import TerminalWindow, { type TabId } from './components/TerminalWindow'
import ArchivePanel from './components/ArchivePanel'
import AboutPanel, { preloadAboutObject } from './components/AboutPanel'
import LinksPanel from './components/LinksPanel'
import BootSequence from './components/BootSequence'
import Wordmark from './components/Wordmark'
import Desktop from './components/Desktop'
import { readPerfTier, prefersReducedMotion } from './lib/perfTier'
import { ArchiveSelectionProvider, useArchiveSelection } from './lib/selection'
import { WindowRegistryProvider } from './lib/windowRegistry'

const TAB_ORDER: TabId[] = ['archive', 'about', 'links']

export default function App() {
  // Selection, activation and view mode live above everything that reads them,
  // so a tab switch or a list/grid switch cannot reset them.
  return (
    <ArchiveSelectionProvider>
      {/* Above Desktop so what is open can be handed up to it rather than
          reached down for — the explorer must not import DesktopContext. */}
      <WindowRegistryProvider>
        <AppShell />
      </WindowRegistryProvider>
    </ArchiveSelectionProvider>
  )
}

function AppShell() {
  const [tier] = useState(readPerfTier)
  const [booted, setBooted] = useState(false)
  const [tab, setTabState] = useState<TabId>('archive')
  const { selectedId } = useArchiveSelection()
  const bodyRef = useRef<HTMLDivElement | null>(null)

  const flashBody = useCallback(() => {
    if (bodyRef.current && !prefersReducedMotion()) {
      animate(bodyRef.current, { opacity: [0.15, 1], duration: 180, ease: 'outQuad' })
    }
  }, [])

  const setTab = useCallback((t: TabId) => { setTabState(t); flashBody() }, [flashBody])

  // The ABOUT object is a 590kB chunk plus an SVG it cannot build without, and
  // fetching both on the click meant the column sat empty for a beat the first
  // time. Warmed here instead: after boot, on idle, so it costs the first paint
  // nothing and the tab is instant when it is finally opened.
  useEffect(() => {
    if (!booted) return
    const idle = window.requestIdleCallback ?? ((cb: () => void) => window.setTimeout(cb, 300))
    const cancel = window.cancelIdleCallback ?? window.clearTimeout
    const handle = idle(() => preloadAboutObject(tier))
    return () => cancel(handle as number)
  }, [booted, tier])

  // The application has exactly one window-level keydown listener and Desktop
  // registers it (§4.6). App only says what a tab shift means.
  const shiftTab = useCallback((dir: 1 | -1) => {
    setTabState((cur) => TAB_ORDER[(TAB_ORDER.indexOf(cur) + dir + TAB_ORDER.length) % TAB_ORDER.length])
    flashBody()
  }, [flashBody])

  return (
    <div className="stage" data-tier={tier} data-booted={booted ? 'true' : 'false'}>
      <BackgroundVideo tier={tier} fileId={selectedId} />
      <Wordmark />
      <div className="glass-strip top" /><div className="glass-strip bottom" />
      <div className="glass-strip left" /><div className="glass-strip right" />
      {!booted ? (
        <BootSequence onDone={() => setBooted(true)} />
      ) : (
        <Desktop onTabShift={shiftTab} tier={tier}>
          <TerminalWindow tab={tab} onTab={setTab} bodyRef={bodyRef} tier={tier}>
            {tab === 'archive' && <ArchivePanel />}
            {tab === 'about' && <AboutPanel tier={tier} />}
            {tab === 'links' && <LinksPanel />}
          </TerminalWindow>
        </Desktop>
      )}
      <span className="build-tag" aria-hidden="true">{__BUILD_ID__}</span>
    </div>
  )
}
