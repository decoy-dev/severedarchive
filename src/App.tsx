import { useLayoutEffect, useRef, useState } from 'react'
import { animate } from 'animejs'
import BackgroundVideo from './components/BackgroundVideo'
import TerminalWindow, { type TabId } from './components/TerminalWindow'
import ArchiveGrid from './components/ArchiveGrid'
import AboutPanel from './components/AboutPanel'
import LinksPanel from './components/LinksPanel'
import BootSequence from './components/BootSequence'
import HomeNotification from './components/HomeNotification'
import { readPerfTier } from './lib/perfTier'

export default function App() {
  const [tier] = useState(readPerfTier)
  const [booted, setBooted] = useState(false)
  const [tab, setTabState] = useState<TabId>('archive')
  const [noticeOpen, setNoticeOpen] = useState(true)
  const bodyRef = useRef<HTMLDivElement | null>(null)

  const setTab = (t: TabId) => {
    setTabState(t)
    if (bodyRef.current) animate(bodyRef.current, { opacity: [0.15, 1], duration: 180, ease: 'outQuad' })
  }

  // spec: arrow keys switch tabs
  useLayoutEffect(() => {
    const order: TabId[] = ['archive', 'about', 'links']
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return
      setTabState((cur) => {
        const i = order.indexOf(cur)
        return order[(i + (e.key === 'ArrowRight' ? 1 : order.length - 1)) % order.length]
      })
      if (bodyRef.current) animate(bodyRef.current, { opacity: [0.15, 1], duration: 180, ease: 'outQuad' })
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  return (
    <div className="stage" data-tier={tier} data-booted={booted ? 'true' : 'false'}>
      <BackgroundVideo tier={tier} />
      <div className="glass-strip top" /><div className="glass-strip bottom" />
      <div className="glass-strip left" /><div className="glass-strip right" />
      {!booted ? (
        <BootSequence onDone={() => setBooted(true)} />
      ) : (
        <>
          <TerminalWindow tab={tab} onTab={setTab} onBell={() => setNoticeOpen(true)} bodyRef={bodyRef}>
            {tab === 'archive' && <ArchiveGrid tier={tier} />}
            {tab === 'about' && <AboutPanel />}
            {tab === 'links' && <LinksPanel />}
          </TerminalWindow>
          {noticeOpen && <HomeNotification onDismiss={() => setNoticeOpen(false)} />}
        </>
      )}
    </div>
  )
}
