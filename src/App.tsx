import { useCallback, useEffect, useRef, useState } from 'react'
import BackgroundVideo from './components/BackgroundVideo'
import TerminalWindow, { type TabId } from './components/TerminalWindow'
import ArchivePanel from './components/ArchivePanel'
import AboutPanel, { preloadAboutObject } from './components/AboutPanel'
import LinksPanel from './components/LinksPanel'
import CommissionPanel from './components/CommissionPanel'
import BootSequence from './components/BootSequence'
import Wordmark from './components/Wordmark'
import Desktop from './components/Desktop'
import { readPerfTier } from './lib/perfTier'
import { openFrom, type OpenOrigin } from './lib/openFrom'
import { MAX_WINDOWS } from './lib/windowManager'
import { ArchiveSelectionProvider, useArchiveSelection } from './lib/selection'
import { WindowRegistryProvider, useWindowView } from './lib/windowRegistry'
import { AdminSessionProvider } from './lib/adminSession'

const TAB_ORDER: TabId[] = ['archive', 'about', 'links']

export default function App() {
  // Selection, activation and view mode live above everything that reads them,
  // so a tab switch or a list/grid switch cannot reset them.
  return (
    <ArchiveSelectionProvider>
      {/* Above Desktop so what is open can be handed up to it rather than
          reached down for — the explorer must not import DesktopContext. */}
      <WindowRegistryProvider>
        {/* Above Desktop as well: the login lives in the terminal's footer and
            the EDIT control lives in each file window's bar, and neither may
            reach into the other. */}
        <AdminSessionProvider>
          <AppShell />
        </AdminSessionProvider>
      </WindowRegistryProvider>
    </ArchiveSelectionProvider>
  )
}

function AppShell() {
  const [tier] = useState(readPerfTier)
  /**
   * The backdrop holds its frame when nobody can see it move: a full desktop of
   * windows, or one window filling the browser window.
   *
   * Decided here rather than inside `BackgroundVideo` because this is where the
   * backdrop and the window registry are both in scope — and read from the
   * registry, not from Desktop, because App must not reach into Desktop for state
   * any more than the explorer may (selection contract rule 1).
   *
   * At the cap the backdrop is behind three windows and the terminal; short of it,
   * it is the surface the glass is sampling and it keeps moving.
   */
  const { windows: openWindows, enlargedId } = useWindowView()
  const backdropHeld = enlargedId !== null || openWindows.length >= MAX_WINDOWS
  const [booted, setBooted] = useState(false)
  const [tab, setTabState] = useState<TabId>('archive')
  const { selectedId } = useArchiveSelection()
  const bodyRef = useRef<HTMLDivElement | null>(null)
  /**
   * The commission form: open, and the point it grows out of.
   *
   * One piece of state rather than a boolean plus a position, so "open" and
   * "where from" cannot disagree. It is a panel over the stage and not a tab —
   * it is reached from the COMMISSIONS card, and a fourth tab for a form nobody
   * browses to put it in the top-level navigation where it does not belong.
   */
  const [commission, setCommission] = useState<{ origin: OpenOrigin | null } | null>(null)

  /**
   * The body opens out of the tab that was pressed, the same gesture the
   * commission panel makes out of its card — one `openFrom` behind both.
   *
   * It used to be a flat opacity blink from 0.15. The scale is 0.96 and not the
   * panel's 0.88 deliberately: the panel opens once, and a tab is pressed twenty
   * times in a session. At the panel's depth the whole terminal appears to jump
   * on every press; at 0.96 it reads as the content unfolding from the tab and
   * stays comfortable at that rate. Same easing and duration, so the two are
   * recognisably the same move.
   */
  const flashBody = useCallback((origin: OpenOrigin | null) => {
    if (bodyRef.current) openFrom(bodyRef.current, origin, { scale: 0.96 })
  }, [])

  const setTab = useCallback(
    (t: TabId, origin: OpenOrigin) => { setTabState(t); flashBody(origin) },
    [flashBody],
  )

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
    // No pointer, so nothing to grow from: it opens from the body's own centre.
    flashBody(null)
  }, [flashBody])

  return (
    <div className="stage" data-tier={tier} data-booted={booted ? 'true' : 'false'}>
      <BackgroundVideo tier={tier} fileId={selectedId} hold={backdropHeld} />
      <Wordmark />
      {/* One layer, clipped to a frame — not four strips. See `.glass-frame`. */}
      <div className="glass-frame" />
      {!booted ? (
        <BootSequence onDone={() => setBooted(true)} />
      ) : (
        <Desktop onTabShift={shiftTab} tier={tier}>
          <TerminalWindow tab={tab} onTab={setTab} bodyRef={bodyRef} tier={tier}>
            {tab === 'archive' && <ArchivePanel />}
            {tab === 'about' && <AboutPanel tier={tier} />}
            {tab === 'links' && (
              <LinksPanel onCommission={(origin) => setCommission({ origin })} />
            )}
          </TerminalWindow>
        </Desktop>
      )}
      {/* Outside the terminal, because it is not one of its panels: it portals
          to `document.body` and covers the whole stage. Only after boot — there
          is nothing to open it from until the terminal exists. */}
      {booted && commission && (
        <CommissionPanel origin={commission.origin} onClose={() => setCommission(null)} />
      )}
      <span className="build-tag" aria-hidden="true">{__BUILD_ID__}</span>
    </div>
  )
}
