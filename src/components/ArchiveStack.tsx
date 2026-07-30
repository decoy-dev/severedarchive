import { useEffect, useMemo, useRef, useState } from 'react'
import { animate } from 'animejs'
import { ARCHIVE, fullSrc, posterSrc } from '../data/archive'
import { VideoDirector } from '../lib/videoDirector'
import { stackLayout } from '../lib/stackLayout'
import { prefersReducedMotion, supportsLiquidRefraction, type PerfTier } from '../lib/perfTier'
import { useSwipe } from '../hooks/useSwipe'

const SLIVER = 24
const SLIVER_FANNED = 72

export default function ArchiveStack({ tier, onFrontChange }: { tier: PerfTier; onFrontChange: (id: string) => void }) {
  const [frontIndex, setFrontIndex] = useState(0)
  const [fanned, setFanned] = useState(false)
  const [muted, setMuted] = useState(true)
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const director = useMemo(() => new VideoDirector(1), [])
  const front = ARCHIVE[frontIndex]
  const layout = stackLayout(ARCHIVE.length, frontIndex, fanned ? SLIVER_FANNED : SLIVER)
  const liquid = useMemo(() => tier === 'full' && supportsLiquidRefraction(), [tier])

  const flashTimer = useRef<number | undefined>(undefined)
  const goTo = (i: number, flash = false) => {
    setFrontIndex(((i % ARCHIVE.length) + ARCHIVE.length) % ARCHIVE.length)
    setMuted(true)
    if (flash && !prefersReducedMotion()) {
      setFanned(true)
      window.clearTimeout(flashTimer.current)
      flashTimer.current = window.setTimeout(() => setFanned(false), 600)
    }
  }
  const next = () => goTo(frontIndex + 1, true)
  const prev = () => goTo(frontIndex - 1, true)
  const swipe = useSwipe(next, prev)

  useEffect(() => () => window.clearTimeout(flashTimer.current), [])

  useEffect(() => { onFrontChange(front.id) }, [front.id, onFrontChange])

  useEffect(() => {
    const v = videoRef.current
    if (!v) return
    const el = { play: () => { v.play().catch(() => {}) }, pause: () => v.pause(), get paused() { return v.paused } }
    director.register(front.id, el)
    director.setFocus(front.id)
    const resync = () => director.register(front.id, el)
    v.addEventListener('loadeddata', resync)
    return () => { v.removeEventListener('loadeddata', resync); director.unregister(front.id) }
  }, [director, front.id])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'n') next(); if (e.key === 'p') prev() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  const stageRef = useRef<HTMLDivElement | null>(null)
  useEffect(() => {
    if (!stageRef.current || prefersReducedMotion()) return
    animate(stageRef.current, { opacity: [0, 1], scale: [0.985, 1], duration: 380, ease: 'outExpo' })
  }, [front.id])

  return (
    <div className="archive-stack" data-front={front.id} data-fanned={fanned ? 'true' : 'false'}>
      <div className={`stack-stage glass${liquid ? ' liquid' : ''}`} ref={stageRef} data-stack-front {...swipe}>
        <video ref={videoRef} src={fullSrc(front.id)} poster={posterSrc(front.id)} muted={muted} loop playsInline />
      </div>
      <div className="stack-slivers" onMouseEnter={() => setFanned(true)} onMouseLeave={() => setFanned(false)}>
        <div className="stack-fan-zone" aria-hidden="true" />
        {ARCHIVE.map((f, i) =>
          layout[i].depth === 0 ? null : (
            <button key={f.id} data-sliver data-file-id={f.id}
              className="stack-sliver"
              style={{
                transform: `translateX(${layout[i].sliverX}px) scale(${layout[i].scale})`,
                zIndex: layout[i].z,
                width: fanned ? SLIVER_FANNED : SLIVER,
              }}
              onClick={() => goTo(i)} aria-label={`Bring FILE_${f.index} to front`}>
              <img src={posterSrc(f.id)} alt="" />
              <span className="sliver-label">FILE_{f.index}</span>
            </button>
          ),
        )}
      </div>
      <div className="stack-hud glass">
        <span>FILE_{front.index} // {front.name}.{front.ext}
          <span className="tw-dim"> · {front.tagline.toUpperCase()} · {front.year}</span>
        </span>
        <button aria-label="Toggle sound" onClick={() => setMuted((m) => !m)}>{muted ? 'SND OFF' : 'SND ON'}</button>
      </div>
    </div>
  )
}
