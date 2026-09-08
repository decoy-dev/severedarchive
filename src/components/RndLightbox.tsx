import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { animate, utils, type JSAnimation } from 'animejs'
import type { OpenOrigin } from '../lib/openFrom'
import { prefersReducedMotion } from '../lib/perfTier'
import { useSwipe } from '../hooks/useSwipe'
import { rndFullSrc, rndThumbSrc, type RndFile } from '../data/rnd'

const pad = (n: number): string => String(n).padStart(2, '0')

/**
 * The focus view opens as a PANEL UNFOLD: a horizontal slit spreads out of the
 * clicked tile's position, then stands up to full height — a CRT-adjacent
 * gesture rather than a grow-and-fade. Close retracts the same way in reverse.
 * ~350ms each way, transform/opacity only, on the stage wrapper — the media
 * paging slide animates a separate inner node, so the two never fight over one
 * transform.
 */
const UNFOLD_SPREAD_MS = 150
const UNFOLD_STAND_MS = 200
const RETRACT_FOLD_MS = 180
const RETRACT_CLOSE_MS = 150

/**
 * The focused view for one R&D entry — the "caption pops up" the client asked
 * for, kept INSIDE the terminal body rather than as a full-page modal so the
 * title bar, tabs and footer stay lit around it (the archive's focus precedent,
 * not the commission form's takeover).
 *
 * It owns the focus sequence locally: no window manager, no route. The full
 * rendition loads on demand at focus time only, over the thumbnail we already
 * hold, and the arrows/swipe page through the same newest-first array the grid
 * draws — one ordering, consumed everywhere.
 */
export default function RndLightbox({ items, startIndex, origin, authed, onEdit, onClose }: {
  items: RndFile[]
  startIndex: number
  origin: OpenOrigin | null
  authed: boolean
  onEdit: (file: RndFile) => void
  onClose: () => void
}) {
  const [cur, setCur] = useState(startIndex)
  const [dir, setDir] = useState<1 | -1>(1)
  // Load state is keyed to the file id, not a bare boolean: on a rapid page the
  // derived flags are false for the incoming image on the SAME render that
  // swaps the src, so a stale `true` can never flash the new image at full
  // opacity while it is still decoding.
  const [loadedId, setLoadedId] = useState<string | null>(null)
  const [failedId, setFailedId] = useState<string | null>(null)

  const rootRef = useRef<HTMLDivElement | null>(null)
  const scrimRef = useRef<HTMLDivElement | null>(null)
  const stageRef = useRef<HTMLDivElement | null>(null)
  const frameRef = useRef<HTMLDivElement | null>(null)
  const mediaRef = useRef<HTMLDivElement | null>(null)
  const captionRef = useRef<HTMLDivElement | null>(null)

  // Every animation this view starts, by role, so a rapid page or close can
  // cancel the one it supersedes and unmount can cancel whatever is live.
  const openAnim = useRef<JSAnimation | null>(null)
  const closeAnim = useRef<JSAnimation | null>(null)
  const scrimAnim = useRef<JSAnimation | null>(null)
  const captionAnim = useRef<JSAnimation | null>(null)
  const mediaAnim = useRef<JSAnimation | null>(null)

  const file = items[cur]
  const atStart = cur === 0
  const atEnd = cur === items.length - 1
  const loaded = loadedId === file.id
  const failed = failedId === file.id

  /**
   * Advance, bounded — the arrows dead-end rather than wrap, because a wrapping
   * control next to an `NN / MM` counter lies to the user about where the end
   * is. `setDir` inside the updater so a boundary press (which returns the same
   * index) never re-fires the paging animation.
   */
  const go = useCallback((d: 1 | -1) => {
    if (closing.current) return
    setCur((c) => {
      const n = c + d
      if (n < 0 || n >= items.length) return c
      setDir(d)
      return n
    })
  }, [items.length])

  const closing = useRef(false)
  /**
   * Retract on close — the unfold in reverse: the panel folds down to a slit,
   * then the slit closes. Runs on the mounted stage from whatever transform it
   * currently holds (an interrupted open retracts from mid-unfold, no snap).
   */
  const close = useCallback(() => {
    if (closing.current) return
    closing.current = true
    rootRef.current?.setAttribute('data-closing', 'true')
    const stage = stageRef.current
    if (!stage || prefersReducedMotion()) { onClose(); return }
    openAnim.current?.cancel()
    captionAnim.current?.cancel()
    closeAnim.current = animate(stage, {
      keyframes: [
        { scaleY: 0.02, duration: RETRACT_FOLD_MS, ease: 'inQuad' },
        { scaleX: 0.3, opacity: 0, duration: RETRACT_CLOSE_MS, ease: 'inQuad' },
      ],
      onComplete: onClose,
    })
    scrimAnim.current?.cancel()
    if (scrimRef.current) {
      scrimAnim.current = animate(scrimRef.current, {
        opacity: 0, duration: RETRACT_FOLD_MS + RETRACT_CLOSE_MS, ease: 'outQuad',
      })
    }
  }, [onClose])

  // Unfold the panel out of the clicked tile: the slit spreads wide first, then
  // stands to full height, anchored at the tile's viewport position so the
  // gesture reads as the tile itself opening. A keyboard open (no origin)
  // unfolds from centre. The cleanup restores the resting box, so a StrictMode
  // effect replay measures the REAL geometry and restarts the unfold cleanly —
  // no permanent guard, no stage stuck at slit scale.
  useLayoutEffect(() => {
    const stage = stageRef.current
    const scrim = scrimRef.current
    if (!stage || prefersReducedMotion()) return
    if (origin) {
      const box = stage.getBoundingClientRect()
      const x = Math.min(Math.max(origin.x - box.left, 0), box.width)
      const y = Math.min(Math.max(origin.y - box.top, 0), box.height)
      stage.style.transformOrigin = `${x}px ${y}px`
    } else {
      stage.style.transformOrigin = '50% 50%'
    }
    utils.set(stage, { scaleX: 0.3, scaleY: 0.02 })
    const unfold = animate(stage, {
      keyframes: [
        { scaleX: 1, duration: UNFOLD_SPREAD_MS, ease: 'outQuad' },
        { scaleY: 1, duration: UNFOLD_STAND_MS, ease: 'outCubic' },
      ],
      // Ends at identity on the real, still-mounted panel — nothing to swap in,
      // nothing to snap. The off-centre origin only matters mid-flight.
      onComplete: () => { stage.style.transformOrigin = '' },
    })
    openAnim.current = unfold
    let scrimIn: JSAnimation | null = null
    if (scrim) {
      scrimIn = animate(scrim, { opacity: [0, 1], duration: 250, ease: 'outQuad' })
      scrimAnim.current = scrimIn
    }
    return () => {
      unfold.cancel()
      scrimIn?.cancel()
      utils.set(stage, { scaleX: 1, scaleY: 1, opacity: 1 })
      stage.style.transformOrigin = ''
      if (scrim) utils.set(scrim, { opacity: 1 })
    }
  }, [origin])

  // Cancel whatever else is mid-flight on unmount — a parent-driven teardown
  // during the retract or a paging beat must not leave a live animation (or its
  // rAF ticks) writing to detached nodes. The unfold/scrim-in cancel in their
  // own effect's cleanup above.
  useEffect(() => () => {
    for (const a of [closeAnim, captionAnim, mediaAnim]) a.current?.cancel()
  }, [])

  // A failed full gets another chance when the user pages away and back — the
  // <img> remounts (keyed by id) and the readout returns to DECODING.
  useEffect(() => { setFailedId(null) }, [cur])

  // The paging beat: the caption pops up (the ownable vertical gesture) and the
  // image slides in from the travel side. Fires only when the index actually
  // moved — comparing against the previous index rather than a consumed
  // first-run flag, so a StrictMode effect replay (same index) stays silent and
  // the first open belongs to the unfold alone. Each beat cancels the one it
  // interrupts so rapid paging always restarts from the declared `from` values.
  const prevCur = useRef(cur)
  useEffect(() => {
    if (prevCur.current === cur) return
    prevCur.current = cur
    if (prefersReducedMotion() || closing.current) return
    captionAnim.current?.cancel()
    mediaAnim.current?.cancel()
    if (captionRef.current) {
      captionAnim.current = animate(captionRef.current, {
        opacity: [0, 1], translateY: [10, 0], duration: 220, delay: 80, ease: 'outQuad',
      })
    }
    if (mediaRef.current) {
      mediaAnim.current = animate(mediaRef.current, {
        opacity: [0, 1], translateX: [dir * 26, 0], duration: 260, ease: 'outQuad',
      })
    }
  }, [cur, dir])

  // While the focus view is up it OWNS the arrow and escape keys, in the capture
  // phase so it intercepts them before the app's window-level tab-switch
  // listener ever sees them (Desktop's keydown is on window, bubble phase).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft') { e.stopPropagation(); e.preventDefault(); go(-1) }
      else if (e.key === 'ArrowRight') { e.stopPropagation(); e.preventDefault(); go(1) }
      else if (e.key === 'Escape') { e.stopPropagation(); close() }
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [go, close])

  // Swipe-left advances, matching the archive mobile row's direction convention.
  const swipe = useSwipe(() => go(1), () => go(-1), 48)

  // Belt-and-braces for a cache-hot full: if the element is already complete
  // when the ref attaches, credit it — the load event can be missed across a
  // StrictMode remount, and a "ready" image stuck on DECODING lies.
  const fullImgRef = useCallback((el: HTMLImageElement | null) => {
    if (el && el.complete && el.naturalWidth > 0) setLoadedId(el.dataset.rndId ?? null)
  }, [])

  const state = failed ? 'error' : loaded ? 'ready' : 'loading'

  return (
    <div className="rnd-focus" ref={rootRef} role="dialog" aria-modal="true" aria-label={`${file.name} — R+D`}>
      <div className="rnd-focus-scrim" ref={scrimRef} onClick={close} />
      <div className="rnd-focus-stage" ref={stageRef}>
        <div className="rnd-focus-viewport">
          <div
            className="rnd-focus-frame"
            ref={frameRef}
            onClick={(e) => { if (e.target === e.currentTarget) close() }}
            {...swipe}
          >
            <div className="rnd-focus-media" ref={mediaRef}>
              {/* The thumbnail we already hold, stretched to the frame as a proxy
                  while the full decodes — its softness reads as defocus, which the
                  site's motion vocabulary has already trained the eye on. */}
              <img className="rnd-focus-thumb" src={rndThumbSrc(file.id)} alt="" aria-hidden="true" draggable={false} />
              {!failed && (
                <img
                  key={file.id}
                  ref={fullImgRef}
                  className="rnd-focus-full"
                  data-rnd-id={file.id}
                  data-loaded={loaded ? 'true' : 'false'}
                  src={rndFullSrc(file.id)}
                  alt={file.name}
                  draggable={false}
                  onLoad={() => setLoadedId(file.id)}
                  onError={() => setFailedId(file.id)}
                />
              )}
            </div>
          </div>
          {/* Arrows and close sit in the viewport, beside the image, not inside
              the frame — the frame clips its overflow to the image edge. */}
          <button
            type="button"
            className="rnd-arrow rnd-arrow--prev"
            onClick={() => go(-1)}
            disabled={atStart}
            aria-label="Previous"
          >◄</button>
          <button
            type="button"
            className="rnd-arrow rnd-arrow--next"
            onClick={() => go(1)}
            disabled={atEnd}
            aria-label="Next"
          >►</button>
          <button type="button" className="rnd-focus-close" onClick={close} aria-label="Close">✕</button>
        </div>

        <div className="rnd-caption" ref={captionRef}>
          <div className="rnd-caption-head">
            <span className="rnd-caption-title">{file.name}</span>
            <span className="rnd-caption-year">{file.year}</span>
          </div>
          <div className="rnd-caption-kicker">{file.tagline}</div>
          <p className="rnd-caption-body" data-state={state}>
            {failed ? '> SIGNAL LOST. SHOWING PROXY.' : loaded ? file.description : '> DECODING FULL…'}
          </p>
          <div className="rnd-caption-foot">
            <div className="rnd-caption-actions">
              {authed && (
                <button type="button" className="rnd-caption-edit" onClick={() => onEdit(file)}>EDIT</button>
              )}
            </div>
            <div className="rnd-pager">
              <button
                type="button"
                className="rnd-pager-arrow"
                onClick={() => go(-1)}
                disabled={atStart}
                aria-label="Previous"
              >◄</button>
              <span className="rnd-pager-count">{pad(cur + 1)} / {pad(items.length)}</span>
              <button
                type="button"
                className="rnd-pager-arrow"
                onClick={() => go(1)}
                disabled={atEnd}
                aria-label="Next"
              >►</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
