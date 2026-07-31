import { useEffect, useState } from 'react'
import type { ArchiveFile } from '../data/archive'
import VolumeControl from './VolumeControl'

export default function FileWindow({
  file, x, y, z, focused, onFocus, onClose, registerEl, bodyRef,
}: {
  file: ArchiveFile
  x: number; y: number; z: number
  focused: boolean
  onFocus: () => void
  onClose: () => void
  registerEl: (el: HTMLDivElement | null) => void
  bodyRef: (el: HTMLDivElement | null) => void
}) {
  const [volume, setVolume] = useState(0)
  const [ar, setAr] = useState(16 / 9)

  // the video is re-parented in by layoutSwap, so listen on the body rather than a ref
  useEffect(() => {
    const body = document.querySelector<HTMLElement>(`[data-file-window='${file.id}'] .fw-body`)
    const v = body?.querySelector('video')
    if (!v) return
    const read = () => { if (v.videoWidth && v.videoHeight) setAr(v.videoWidth / v.videoHeight) }
    read()
    v.addEventListener('loadedmetadata', read)
    return () => v.removeEventListener('loadedmetadata', read)
  }, [file.id])

  return (
    <div
      className="file-window glass"
      data-file-window={file.id}
      data-focused={focused ? 'true' : 'false'}
      ref={registerEl}
      style={{
        left: x, top: y, zIndex: 10 + z,
        width: `min(52vw, 720px, ${Math.round(ar * 62)}vh)`,
        aspectRatio: `${ar}`,
      }}
      onPointerDown={onFocus}
    >
      <header className="fw-titlebar" data-drag-handle>
        <span className="fw-title">FILE_{file.index} <span className="tw-dim">·</span> {file.name}.{file.ext}</span>
        <span className="fw-controls">
          <VolumeControl
            value={volume}
            onChange={(v) => {
              setVolume(v)
              const vid = document.querySelector<HTMLVideoElement>(`[data-file-window='${file.id}'] video`)
              if (vid) { vid.volume = v; vid.muted = v === 0 }
            }}
          />
          <button className="fw-close" onClick={onClose} aria-label={`Close FILE_${file.index}`}>✕</button>
        </span>
      </header>
      <div className="fw-body" ref={bodyRef} />
    </div>
  )
}
