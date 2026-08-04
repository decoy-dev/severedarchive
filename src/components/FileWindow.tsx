import { useEffect, useRef } from 'react'
import { aspectRatio, type ArchiveFile } from '../data/archive'
import { cellGone, sweepAt, DISSOLVE_CELL, DISSOLVE_MS } from '../lib/dissolve'
import { prefersReducedMotion } from '../lib/perfTier'
import { windowWidthCss } from '../lib/windowManager'
import InfoPopover from './InfoPopover'
import VolumeControl from './VolumeControl'

export default function FileWindow({
  file, x, y, z, focused, dissolving, volume, onVolume, onFocus, onClose, registerEl, bodyRef,
}: {
  file: ArchiveFile
  x: number; y: number; z: number
  focused: boolean
  /** Closing: the window plays its dissolve and Desktop unmounts it after. */
  dissolving: boolean
  volume: number
  onVolume: (v: number) => void
  onFocus: () => void
  onClose: () => void
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

  // The dissolve. Painted over the whole window — chrome included, because a
  // frame left standing around disintegrating media reads as a bug rather than
  // as the window going. Void-coloured blocks rather than erasure: the media
  // node underneath belongs to the controller and is still being reconciled out
  // from under this, so nothing here may touch it.
  const burnRef = useRef<HTMLCanvasElement | null>(null)
  useEffect(() => {
    const canvas = burnRef.current
    if (!dissolving || !canvas) return
    const host = canvas.parentElement
    const ctx = canvas.getContext('2d')
    if (!host || !ctx) return
    if (prefersReducedMotion()) return

    const w = host.offsetWidth
    const h = host.offsetHeight
    const cols = Math.max(1, Math.ceil(w / DISSOLVE_CELL))
    const rows = Math.max(1, Math.ceil(h / DISSOLVE_CELL))
    canvas.width = w
    canvas.height = h
    // One fixed value per cell, so cells do not flicker back in between frames.
    const noise = new Float32Array(cols * rows)
    for (let i = 0; i < noise.length; i++) noise[i] = Math.random()

    let raf = 0
    const start = performance.now()
    const tick = (now: number) => {
      const progress = Math.min(1, (now - start) / DISSOLVE_MS)
      ctx.clearRect(0, 0, w, h)
      ctx.fillStyle = '#07090b'
      for (let row = 0; row < rows; row++) {
        for (let col = 0; col < cols; col++) {
          if (!cellGone(progress, noise[row * cols + col], sweepAt(col, row, cols, rows))) continue
          ctx.fillRect(col * DISSOLVE_CELL, row * DISSOLVE_CELL, DISSOLVE_CELL, DISSOLVE_CELL)
        }
      }
      if (progress < 1) raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [dissolving])

  return (
    <div
      className="file-window glass"
      data-file-window={file.id}
      data-focused={focused ? 'true' : 'false'}
      ref={registerEl}
      style={{
        left: x, top: y, zIndex: 10 + z,
        // True-frame: the ratio is on the BODY, and the root's height falls out
        // of it. A root that carries `aspect-ratio` has to bar the media on one
        // axis, which is the pillarboxing the rulings rule out.
        width: windowWidthCss(ar),
      }}
      onPointerDown={onFocus}
      data-dissolving={dissolving ? 'true' : undefined}
    >
      {dissolving && <canvas className="fw-burn" ref={burnRef} aria-hidden="true" />}
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
          <InfoPopover file={file} />
          <VolumeControl value={volume} onChange={onVolume} />
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
      {/* Floats over the media, centred on its bottom edge. Outside `.fw-body`
          on purpose: the body is the controller's slot and its contents are
          moved in and out from under React, so nothing of ours may live in
          there. Positioned against the window root instead, which is why the
          offset is the body's own height rather than simply `bottom: 16px`. */}
      <a
        className="fw-insta"
        href={file.postUrl}
        target="_blank"
        rel="noreferrer noopener"
        // The window raises on pointerdown; without this the link would also
        // ride that handler and the press would read as a drag on the chrome.
        onPointerDown={(e) => e.stopPropagation()}
      >
        VIEW ON INSTAGRAM
      </a>
      {/* An empty, stable slot — never a `<video>` of its own. mediaController
          moves this file's host in here and takes it away again; React only ever
          sees an empty div, which is the whole safety argument. */}
      <div className="fw-body" data-window-slot={file.id} ref={bodyRef} style={{ aspectRatio: `${ar}` }} />
    </div>
  )
}
