import { useCallback, useRef, useState } from 'react'
import { animate } from 'animejs'
import BackgroundVideo from './components/BackgroundVideo'
import TerminalWindow, { type TabId } from './components/TerminalWindow'
import ArchivePanel from './components/ArchivePanel'
import AboutPanel from './components/AboutPanel'
import LinksPanel from './components/LinksPanel'
import BootSequence from './components/BootSequence'
import Desktop from './components/Desktop'
import { readPerfTier, prefersReducedMotion } from './lib/perfTier'
import { ArchiveSelectionProvider, useArchiveSelection } from './lib/selection'

const TAB_ORDER: TabId[] = ['archive', 'about', 'links']

export default function App() {
  // Selection, activation and view mode live above everything that reads them,
  // so a tab switch or a list/grid switch cannot reset them.
  return (
    <ArchiveSelectionProvider>
      <AppShell />
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

  // The application has exactly one window-level keydown listener and Desktop
  // registers it (§4.6). App only says what a tab shift means.
  const shiftTab = useCallback((dir: 1 | -1) => {
    setTabState((cur) => TAB_ORDER[(TAB_ORDER.indexOf(cur) + dir + TAB_ORDER.length) % TAB_ORDER.length])
    flashBody()
  }, [flashBody])

  return (
    <div className="stage" data-tier={tier} data-booted={booted ? 'true' : 'false'}>
      <BackgroundVideo tier={tier} fileId={selectedId} />
      <span className="wordmark" aria-hidden="true">SEVEREDARCHIVE</span>
      <div className="glass-strip top" /><div className="glass-strip bottom" />
      <div className="glass-strip left" /><div className="glass-strip right" />
      {!booted ? (
        <BootSequence onDone={() => setBooted(true)} />
      ) : (
        <Desktop onTabShift={shiftTab}>
          <TerminalWindow tab={tab} onTab={setTab} bodyRef={bodyRef}>
            {tab === 'archive' && <ArchivePanel />}
            {tab === 'about' && <AboutPanel />}
            {tab === 'links' && <LinksPanel />}
          </TerminalWindow>
        </Desktop>
      )}
      <span className="build-tag" aria-hidden="true">{__BUILD_ID__}</span>
    </div>
  )
}
