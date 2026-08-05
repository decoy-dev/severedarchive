import { useEffect, useRef, useState } from 'react'
import { aspectRatio, fullSrc, isStill, type ArchiveFile } from '../data/archive'
import { RECEDE_MS, recedeAt, recedeFilter, recedeTransform } from '../lib/recede'
import { prefersReducedMotion } from '../lib/perfTier'
import { windowWidthCss } from '../lib/windowManager'
import { useAdminSession } from '../lib/adminSession'
import { Suspense, lazy } from 'react'

/** Code-split with AdminPanel and for the same reason — owner-only code. */
const EntryEditPanel = lazy(() => import('./EntryEditPanel'))
import InfoPopover from './InfoPopover'
import VolumeControl from './VolumeControl'

export default function FileWindow({
  file, x, y, z, focused, receding, enlarged, volume,
  onVolume, onFocus, onClose, onToggleEnlarge, registerEl, bodyRef,
}: {
  file: ArchiveFile
  x: number; y: number; z: number
  focused: boolean
  /** Closing: the window recedes into the background and Desktop unmounts it after. */
  receding: boolean
  /**
   * Filling the browser window.
   *
   * Owned by Desktop, not by this component, for two reasons that both come from
   * §4.6: Escape has to mean "come back down" before it means "close", and there
   * is exactly one window-level keydown listener in the application to say so.
   * Holding it there also makes "only one enlarged window" a fact about the state
   * rather than something the geometry happens to hide.
   */
  enlarged: boolean
  volume: number
  onVolume: (v: number) => void
  onFocus: () => void
  onClose: () => void
  onToggleEnlarge: () => void
  registerEl: (el: HTMLDivElement | null) => void
  /** registers `.fw-body` as this file's media slot; returns mediaController's cleanup */
  bodyRef: (el: HTMLDivElement | null) => (() => void) | void
}) {
  // Build-generated, so the box is known before the window mounts: no effect, no
  // retry, no race with the reparent, and no silent 16:9 fallback because there
  // is no fallback path at all. The old runtime read went through
  // `document.querySelector`, which answers with whichever preview happens to
  // exist rather than the file that was clicked.
  const ar = aspectRatio(file)

  // The owner's tools, and only the owner's: EDIT appears in the bar of the
  // window you are looking at once a passcode has been accepted this session.
  // The button is cosmetic security — every endpoint behind it checks the
  // session cookie independently — so hiding it is about not showing controls
  // that would only 401, not about keeping anyone out.
  const { authed } = useAdminSession()
  const [editing, setEditing] = useState(false)

  // The close: the panel is pulled back into the background until it is gone.
  // See `recede`. Driven from here in rAF rather than by a CSS animation or a
  // keyframe because the scale has to COMPOSE with the inline translate anime.js
  // left on this element while it was dragged — a CSS `transform` would replace
  // that translate and snap the window back to its cascade position on the first
  // frame of its own close.
  const rootRef = useRef<HTMLDivElement | null>(null)
  useEffect(() => {
    const root = rootRef.current
    if (!receding || !root) return
    if (prefersReducedMotion()) return

    // Read once, before the first frame writes anything: after that the inline
    // transform is ours and re-reading it would compound the scale each frame.
    // An ENLARGED window has no translate to keep — the stylesheet cancels the
    // drag offset while it fills the viewport (see `[data-enlarged]`), so
    // composing with it here would jump the panel by that offset as it went.
    const base = enlarged ? '' : root.style.transform

    let raf = 0
    const start = performance.now()
    const tick = (now: number) => {
      const progress = Math.min(1, (now - start) / RECEDE_MS)
      const { scale, opacity, blur, brightness } = recedeAt(progress)
      // `important`, because the enlarged rule cancels transforms with it and an
      // ordinary inline write would lose to that. Inline !important still wins.
      root.style.setProperty('transform', recedeTransform(base, scale), 'important')
      root.style.opacity = `${opacity}`
      root.style.filter = recedeFilter(blur, brightness)
      if (progress < 1) raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => {
      cancelAnimationFrame(raf)
      root.style.removeProperty('transform')
      if (base) root.style.transform = base
      root.style.opacity = ''
      root.style.filter = ''
    }
  }, [receding, enlarged])

  return (
    <div
      className="file-window glass"
      data-file-window={file.id}
      data-focused={focused ? 'true' : 'false'}
      ref={(el) => { rootRef.current = el; registerEl(el) }}
      style={{
        left: x, top: y, zIndex: 10 + z,
        // True-frame: the ratio is on the BODY, and the root's height falls out
        // of it. A root that carries `aspect-ratio` has to bar the media on one
        // axis, which is the pillarboxing the rulings rule out.
        width: windowWidthCss(ar),
        // The enlarged size is computed in CSS from this, so the same true-frame
        // rule holds at viewport scale: the panel grows to the largest box the
        // window will take at the file's own ratio, and the media is neither
        // stretched nor barred. The stylesheet cannot read the inline
        // `aspect-ratio` off `.fw-body`, so the number is handed over as a custom
        // property as well.
        ['--fw-ar' as string]: `${ar}`,
      }}
      onPointerDown={onFocus}
      data-receding={receding ? 'true' : undefined}
      data-enlarged={enlarged ? 'true' : undefined}
    >
      <header className="fw-titlebar">
        {/* The drag handle is the TITLE, not the whole bar. It was the bar, and
            the controls live inside it, so pressing ✕ or VOL started a drag:
            anime takes pointer capture, and a press that drifts even 2–3px then
            delivers its click to the capture target instead of the button. The
            ✕ simply did not fire for anyone who does not click perfectly still,
            and the volume slider dragged the whole window. The title stretches
            to fill the bar (see `.fw-title`), so the grabbable area is every
            part of the bar that is not a control — which is what it looks like.

            The bar carries the name and nothing else. Nothing in the interface
            numbers files any more — a file is its name. */}
        <span className="fw-title" data-drag-handle>{file.name}.{file.ext}</span>
        <span className="fw-controls">
          {authed && (
            /* A sibling of the ✕, not nested in anything: the title bar's
               controls are all direct children of this row, and a button inside
               a button is the mistake that broke the dashboard's (i). */
            <button
              className="fw-edit"
              onPointerDown={(e) => e.stopPropagation()}
              onClick={() => setEditing(true)}
              aria-label={`Edit ${file.name}.${file.ext}`}
            >
              EDIT
            </button>
          )}
          <InfoPopover file={file} />
          {/* A still has no audio track, and no controller node to route a volume
              to. The control would be a slider that does nothing. */}
          {!isStill(file.id) && <VolumeControl value={volume} onChange={onVolume} />}
          {/* ENLARGE / MINIMIZE — the control that replaced VIEW ON INSTAGRAM. In
              the title bar rather than floating over the media: it is a window
              control, it belongs with the other window controls, and the bar is
              the one part of the frame that is not the picture.

              Deliberately not the Fullscreen API. `requestFullscreen` promotes the
              element into the browser's top layer, which takes it out of
              `.desktop` — and the `<video>` inside it belongs to mediaController,
              which reparents it into `.fw-body` from outside React against a slot
              registered in this document. Growing the window to the viewport in
              CSS keeps every one of those relationships intact, so enlarging is a
              layout change and nothing else. See `[data-enlarged]`.

              No stopPropagation — the press SHOULD reach the root's
              focus handler, because the enlarged window is the one you are
              looking at and focus is what gets it the full-resolution encode. It
              is outside the drag handle, so nothing starts a drag either. */}
          <button
            className="fw-scale"
            onClick={onToggleEnlarge}
            aria-label={enlarged
              ? `Restore ${file.name}.${file.ext} to its window size`
              : `Enlarge ${file.name}.${file.ext} to fill the browser window`}
            aria-pressed={enlarged}
          >
            <ScaleIcon enlarged={enlarged} />
          </button>
          {/* Closes on pointerdown, not click: the press is the commit, so
              nothing downstream — a drift, a re-render, a media reconcile —
              can swallow it. `onClick` is still here for the keyboard, which
              never emits a pointer event. */}
          <button
            className="fw-close"
            onPointerDown={(e) => { e.stopPropagation(); onClose() }}
            onClick={onClose}
            aria-label={`Close ${file.name}.${file.ext}`}
          >
            ✕
          </button>
        </span>
      </header>
      {/* The lock-on: scanlines and a roll band, over the whole frame for the
          beat a window takes to change size. Always mounted and inert — the
          animation is keyed off `data-locking`, which `playLockOn` sets on the
          root for ~300ms — so there is no element to create at the exact moment
          the compositor is busiest with the FLIP.

          Outside `.fw-body`, like everything else of ours: the body is the media
          controller's slot and its contents are moved in and out from under
          React. */}
      <div className="fw-lock" aria-hidden="true" />
      {/* An empty, stable slot — never a `<video>` of its own. mediaController
          moves this file's host in here and takes it away again; React only ever
          sees an empty div, which is the whole safety argument.

          A STILL is the exception, and it is not a loophole in that argument: the
          rule exists because a `<video>` loses its playback state when React
          reparents it, and an image has no playback state. `desiredPlacement`
          never places a still, so the controller has no node for this file and
          this slot would otherwise stay empty. React owns the `<img>` outright.
          `data-window-slot` is still here, so registration and every slot query
          behave identically for both kinds. */}
      <div className="fw-body" data-window-slot={file.id} ref={bodyRef} style={{ aspectRatio: `${ar}` }}>
        {isStill(file.id) && (
          <img className="fw-still" src={fullSrc(file.id)} alt={file.name} draggable={false} />
        )}
      </div>
      {/* Rendered from here rather than plumbed through Desktop: the panel is
          `position: fixed` and centres on the viewport, so it does not inherit
          this window's box, and the window already knows which file it is. */}
      {editing && (
        <Suspense fallback={null}>
          <EntryEditPanel file={file} onClose={() => setEditing(false)} />
        </Suspense>
      )}
    </div>
  )
}

/**
 * The enlarge/minimize glyph: four corner brackets, thrown outward to the edges
 * of the box or pulled inward to its centre.
 *
 * Inline SVG on `currentColor` and a 1.5 stroke, matching `MediaKindIcon` — the
 * title bar is set in Share Tech Mono and an icon at a different weight reads as
 * pasted in from another interface. Corners rather than the usual arrows-in-a-box
 * because they are the same drawing in both directions, so the two states are
 * legibly one control that flipped rather than two unrelated symbols.
 */
function ScaleIcon({ enlarged }: { enlarged: boolean }) {
  return (
    <svg
      className="scale-icon"
      viewBox="0 0 16 16"
      width="13"
      height="13"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="square"
      aria-hidden="true"
      focusable="false"
    >
      {enlarged ? (
        <>
          {/* pulled in: the same four brackets, moved off the corners, opening
              away from the centre. The elbows sit at 5.5/10.5 rather than nearer
              in — closer than that and the four of them touch and the glyph reads
              as a plus sign at 13px instead of as brackets. */}
          <path d="M5.5 2.5v3h-3" />
          <path d="M10.5 2.5v3h3" />
          <path d="M5.5 13.5v-3h-3" />
          <path d="M10.5 13.5v-3h3" />
        </>
      ) : (
        <>
          {/* thrown out: the brackets hug the corners, opening away from centre */}
          <path d="M2.5 6V2.5H6" />
          <path d="M10 2.5h3.5V6" />
          <path d="M13.5 10v3.5H10" />
          <path d="M6 13.5H2.5V10" />
        </>
      )}
    </svg>
  )
}
