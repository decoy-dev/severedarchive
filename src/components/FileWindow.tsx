import { aspectRatio, type ArchiveFile } from '../data/archive'
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
  bodyRef: (el: HTMLDivElement | null) => void
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
        width: `min(52vw, 720px, ${Math.round(ar * 62)}vh)`,
        // TODO(Slice C): true-frame moves this onto .fw-body and the root gets
        // body height + 42px instead, so the window stops pillarboxing.
        aspectRatio: `${ar}`,
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
      <div className="fw-body" ref={bodyRef} />
    </div>
  )
}
