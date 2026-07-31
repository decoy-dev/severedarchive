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
      <header className="fw-titlebar" data-drag-handle>
        <span className="fw-title">FILE_{file.index} <span className="tw-dim">·</span> {file.name}.{file.ext}</span>
        <span className="fw-controls">
          <VolumeControl value={volume} onChange={onVolume} />
          <button className="fw-close" onClick={onClose} aria-label={`Close FILE_${file.index}`}>✕</button>
        </span>
      </header>
      {/* An empty, stable slot — never a `<video>` of its own. mediaController
          moves this file's host in here and takes it away again; React only ever
          sees an empty div, which is the whole safety argument. */}
      <div className="fw-body" data-window-slot={file.id} ref={bodyRef} style={{ aspectRatio: `${ar}` }} />
    </div>
  )
}
