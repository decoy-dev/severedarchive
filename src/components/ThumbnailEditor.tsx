import { useEffect, useRef, useState } from 'react'
import { DEFAULT_THUMB, MAX_ZOOM, previewStyle, type ThumbSpec } from '../lib/thumbCrop'

/**
 * The thumbnail: which frame it is, how it is framed, or an image instead.
 *
 * The preview is the real clip, seeked to the chosen moment and scaled about the
 * focal point — not an approximation of the crop but the identical transform the
 * ingest script's ffmpeg crop is derived from (`previewStyle` and `cropRect` are
 * two readings of one definition, and a unit test holds them to it). So what is
 * dragged here is what comes out the other end.
 *
 * The frame is dragged rather than typed. A crop is a spatial decision and two
 * number fields are the wrong instrument for it — but the numbers are shown,
 * because this is an interface for someone who wants to know what it committed.
 *
 * The box is the clip's own aspect and stays that way at every zoom: the poster
 * drops into a tile shaped by the clip, so a crop that changed its shape could
 * not be displayed. See `src/lib/thumbCrop.ts`.
 */
export default function ThumbnailEditor({
  spec, onChange, videoSrc, posterSrc, aspect, durationSec, customImage, onCustomImage,
}: {
  spec: ThumbSpec
  onChange: (next: ThumbSpec) => void
  /** The clip to scrub, when there is one. Absent for a not-yet-uploaded file. */
  videoSrc?: string
  /** The current still, shown until the clip can be scrubbed. */
  posterSrc?: string
  aspect: number
  durationSec: number
  customImage: File | null
  onCustomImage: (file: File | null) => void
}) {
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const frameRef = useRef<HTMLDivElement | null>(null)
  const [ready, setReady] = useState(false)
  const [dragging, setDragging] = useState(false)
  const [customUrl, setCustomUrl] = useState<string | null>(null)

  // A picked image is previewed from a blob URL, revoked when it changes: these
  // are stills of a few megabytes and the panel outlives several picks.
  useEffect(() => {
    if (!customImage) { setCustomUrl(null); return }
    const url = URL.createObjectURL(customImage)
    setCustomUrl(url)
    return () => URL.revokeObjectURL(url)
  }, [customImage])

  // Seeking is what makes the scrubber a preview rather than a slider with a
  // number on it. `fastSeek` where it exists — this is a still from a 12s loop
  // and frame-exactness is not worth the decode.
  useEffect(() => {
    const video = videoRef.current
    if (!video || !ready) return
    const time = Math.min(spec.time, Math.max(0, (video.duration || durationSec) - 0.05))
    if (Math.abs(video.currentTime - time) < 0.04) return
    if (typeof video.fastSeek === 'function') video.fastSeek(time)
    else video.currentTime = time
  }, [spec.time, ready, durationSec])

  /**
   * Dragging moves the focal point.
   *
   * In frame coordinates, and inverted: dragging the image left reveals what is
   * to the right, which is how every crop tool behaves and the opposite of moving
   * the focal point with the pointer. The divisor is the slack — at zoom 1 there
   * is none, so dragging does nothing rather than fighting a clamp.
   */
  const onPointerDown = (e: React.PointerEvent) => {
    if (spec.zoom <= 1) return
    const frame = frameRef.current
    if (!frame) return
    const box = frame.getBoundingClientRect()
    const start = { x: e.clientX, y: e.clientY, cx: spec.cx, cy: spec.cy }
    setDragging(true)
    e.currentTarget.setPointerCapture(e.pointerId)

    const move = (ev: PointerEvent) => {
      // The visible window is 1/zoom of the frame, so a pixel of pointer travel
      // is a larger fraction of the crop the further in it is zoomed.
      const slackX = box.width * (1 - 1 / spec.zoom)
      const slackY = box.height * (1 - 1 / spec.zoom)
      const cx = slackX > 0 ? start.cx - (ev.clientX - start.x) / slackX : start.cx
      const cy = slackY > 0 ? start.cy - (ev.clientY - start.y) / slackY : start.cy
      onChange({ ...spec, cx: Math.min(1, Math.max(0, cx)), cy: Math.min(1, Math.max(0, cy)) })
    }
    const up = () => {
      setDragging(false)
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  }

  const style = previewStyle(spec)
  const source = spec.custom && customUrl ? customUrl : null

  return (
    <div className="thumb-editor admin-field-wide">
      <span className="admin-field-head">THUMBNAIL</span>

      <div className="thumb-stage">
        <div
          className="thumb-frame"
          ref={frameRef}
          style={{ aspectRatio: `${aspect}` }}
          data-grabbable={spec.zoom > 1 ? 'true' : undefined}
          data-dragging={dragging ? 'true' : undefined}
          onPointerDown={onPointerDown}
        >
          {source ? (
            // A supplied still, cover-fitted exactly as the pipeline will fit it,
            // so this preview is not kinder than the result.
            <img className="thumb-media" src={source} alt="" style={style} />
          ) : videoSrc ? (
            <video
              // The ref also PROBES: an element whose metadata is already there
              // reports it in `readyState`, event or no event. Since this panel
              // went behind `lazy()`, the mount can land after a cached source
              // has finished loading and `loadedmetadata` has already fired —
              // waiting only for the event left `ready` false forever and the
              // scrubber dead. Same judgement the media controller applies:
              // trust the element's actual state, never a witnessed event.
              ref={(el) => {
                videoRef.current = el
                if (el && el.readyState >= 1) setReady(true)
              }}
              className="thumb-media"
              src={videoSrc}
              muted
              playsInline
              preload="metadata"
              style={style}
              onLoadedMetadata={() => setReady(true)}
            />
          ) : posterSrc ? (
            <img className="thumb-media" src={posterSrc} alt="" style={style} />
          ) : (
            <span className="thumb-empty">PICK A FILE TO SEE ITS FRAMES</span>
          )}
          {spec.zoom > 1 && (
            // A crosshair on the focal point. Without it, at high zoom, there is
            // nothing to say which part of the image is being held in place.
            <span
              className="thumb-focus"
              style={{ left: `${spec.cx * 100}%`, top: `${spec.cy * 100}%` }}
              aria-hidden="true"
            />
          )}
        </div>

        <div className="thumb-controls">
          <label className="thumb-slider">
            {/* Plain seconds, to two places. MM:SS was actively misleading here:
                these are 12-second loops, so every value rounded into the same
                couple of labels and 7.5s read as `00:08`. */}
            <span>FRAME {spec.custom ? '— SUPPLIED IMAGE' : `${spec.time.toFixed(2)}s / ${durationSec.toFixed(1)}s`}</span>
            <input
              type="range"
              min={0}
              max={Math.max(0.1, durationSec)}
              step={0.05}
              value={spec.time}
              disabled={spec.custom || !videoSrc}
              onChange={(e) => onChange({ ...spec, time: Number(e.target.value) })}
            />
          </label>
          <label className="thumb-slider">
            <span>ZOOM {spec.zoom.toFixed(2)}×</span>
            <input
              type="range"
              min={1}
              max={MAX_ZOOM}
              step={0.05}
              value={spec.zoom}
              onChange={(e) => onChange({ ...spec, zoom: Number(e.target.value) })}
            />
          </label>
          <p className="thumb-readout">
            FOCUS {(spec.cx * 100).toFixed(0)}% · {(spec.cy * 100).toFixed(0)}%
            {spec.zoom > 1 ? ' — DRAG THE FRAME TO REPOSITION' : ' — ZOOM IN TO REPOSITION'}
          </p>
          <div className="thumb-actions">
            <label className="thumb-pick">
              {spec.custom ? 'CHANGE IMAGE' : 'USE AN IMAGE'}
              <input
                type="file"
                accept="image/*"
                onChange={(e) => {
                  const picked = e.target.files?.[0] ?? null
                  onCustomImage(picked)
                  // Picking an image is what "custom" means; the flag is not a
                  // separate decision to remember to make.
                  onChange({ ...spec, custom: picked !== null })
                }}
              />
            </label>
            <button
              type="button"
              className="thumb-reset"
              disabled={
                spec.zoom === DEFAULT_THUMB.zoom && spec.time === DEFAULT_THUMB.time
                && spec.cx === DEFAULT_THUMB.cx && spec.cy === DEFAULT_THUMB.cy && !spec.custom
              }
              onClick={() => { onChange({ ...DEFAULT_THUMB }); onCustomImage(null) }}
            >
              RESET
            </button>
          </div>
          {spec.custom && (
            <p className="admin-note">
              {customImage
                ? 'THE STILL WILL BE THIS IMAGE, COVER-FITTED TO THE CLIP’S SHAPE'
                : 'THE CURRENT STILL IS A SUPPLIED IMAGE — PICK ANOTHER OR RESET TO USE A FRAME'}
            </p>
          )}
        </div>
      </div>
    </div>
  )
}
