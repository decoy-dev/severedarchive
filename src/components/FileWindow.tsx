import { aspectRatio, type ArchiveFile } from '../data/archive'
import { windowWidthCss } from '../lib/windowManager'
import VolumeControl from './VolumeControl'

export default function FileWindow({
  file, x, y, z, focused, volume, onVolume, onFocus, onClose, registerEl, bodyRef,
}: {
  file: ArchiveFile
  x: number; y: number; z: number
  focused: boolean
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
