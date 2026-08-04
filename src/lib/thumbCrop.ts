/**
 * The thumbnail still: which frame it comes from, and how it is framed.
 *
 * The still ONLY. The clip itself is never reframed by this — an unfocused
 * window plays `_thumb.mp4` inside a box laid out from `_full.mp4`'s dimensions,
 * so those two must keep the same aspect to within 0.1% (the true-frame ruling,
 * enforced in `process-upload.sh`). Cropping the thumb video would letterbox
 * every unfocused window. What this crops is the poster.
 *
 * Which is also why the crop is a ZOOM AND A FOCAL POINT rather than a free
 * rectangle: the poster drops into a box shaped by the clip, so it has to keep
 * the clip's aspect. A zoom with a point to keep in shot is the same expressive
 * power as a free rect that is constrained to an aspect anyway, and it cannot
 * express the shape that would not fit.
 *
 * `cx`/`cy` are the focal point in 0..1 across the frame, and they mean exactly
 * what a CSS `transform-origin` percentage means. That is deliberate: the editor
 * previews the crop by scaling the real video about that origin, and the ingest
 * script computes the same rectangle with ffmpeg. One definition, two renderers,
 * no drift — and no clamping anywhere, because a point on the edge scales toward
 * that edge and the frame still covers the box.
 */
export type ThumbSpec = {
  /** Seconds into the clip the still is grabbed from. */
  time: number
  /** 1 is the whole frame. Above that is a crop. */
  zoom: number
  /** Focal point across the frame, 0..1. 0.5/0.5 is centred. */
  cx: number
  cy: number
  /** True when the still is an uploaded image rather than a frame of the clip. */
  custom: boolean
}

/** No crop, one second in — what the pipeline did before any of this existed. */
export const DEFAULT_THUMB: ThumbSpec = { time: 1, zoom: 1, cx: 0.5, cy: 0.5, custom: false }

/** How far in the still may be cropped. Past this a 480p poster is mush. */
export const MAX_ZOOM = 4

const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v))

/**
 * A spec from anywhere — a form, a JSON file, a request body — made safe.
 *
 * Every field is repaired rather than rejected: this reaches an ffmpeg command
 * line, and a NaN there is a failed render at the end of a five-minute
 * workflow. Validation that refuses bad input lives in `server/entry.ts`; this
 * is what guarantees the arithmetic below cannot produce nonsense.
 */
export function normaliseThumb(input: Partial<ThumbSpec> | null | undefined, durationSec = Infinity): ThumbSpec {
  const raw = input ?? {}
  const num = (v: unknown, fallback: number) => (typeof v === 'number' && Number.isFinite(v) ? v : fallback)
  return {
    // A grab past the end of the clip yields no frame at all, so the last
    // moment is the ceiling rather than an error.
    time: clamp(num(raw.time, DEFAULT_THUMB.time), 0, Math.max(0, durationSec)),
    zoom: clamp(num(raw.zoom, DEFAULT_THUMB.zoom), 1, MAX_ZOOM),
    cx: clamp(num(raw.cx, DEFAULT_THUMB.cx), 0, 1),
    cy: clamp(num(raw.cy, DEFAULT_THUMB.cy), 0, 1),
    custom: raw.custom === true,
  }
}

export type CropRect = { x: number; y: number; w: number; h: number }

/**
 * The visible rectangle, as fractions of the frame.
 *
 * `x = cx * (1 - w)` is the transform-origin identity: the focal point maps to
 * itself, so it needs no clamping and lands on the frame's edge exactly when the
 * point is on the edge.
 */
export function cropRect(spec: ThumbSpec): CropRect {
  const w = 1 / spec.zoom
  const h = 1 / spec.zoom
  return { x: spec.cx * (1 - w), y: spec.cy * (1 - h), w, h }
}

/** True when the spec asks for nothing the default would not do. */
export const isDefaultCrop = (spec: ThumbSpec): boolean => spec.zoom === 1

/**
 * The same rectangle in pixels, snapped to even numbers.
 *
 * H.264 chroma subsampling needs even dimensions, and an odd crop is an ffmpeg
 * error rather than a slightly-off image. Clamped so rounding cannot push the
 * rectangle past the frame's edge.
 */
export function cropPixels(spec: ThumbSpec, width: number, height: number): CropRect {
  const even = (v: number) => Math.max(2, Math.round(v / 2) * 2)
  const w = Math.min(even(width / spec.zoom), even(width))
  const h = Math.min(even(height / spec.zoom), even(height))
  // The offset is taken from the SNAPPED size, not from the fractional rect:
  // `cx * (width - w)` is the same transform-origin identity `cropRect` uses, but
  // measured against the crop that will actually be cut. Scaling the fractional
  // origin instead put the focal point up to a pixel off — a parity test against
  // `render-poster.sh` caught the disagreement, and the script's reading is the
  // right one. It also means the rectangle cannot leave the frame by
  // construction rather than by clamping.
  return {
    w, h,
    x: clamp(Math.round(spec.cx * (width - w)), 0, Math.max(0, width - w)),
    y: clamp(Math.round(spec.cy * (height - h)), 0, Math.max(0, height - h)),
  }
}

/** What the editor's preview applies to the real video to show the crop. */
export const previewStyle = (spec: ThumbSpec): { transform: string; transformOrigin: string } => ({
  transform: `scale(${spec.zoom})`,
  transformOrigin: `${(spec.cx * 100).toFixed(2)}% ${(spec.cy * 100).toFixed(2)}%`,
})

/** Compact form for a request body, and for the committed entry. */
export const serialiseThumb = (spec: ThumbSpec): string => JSON.stringify({
  time: Math.round(spec.time * 100) / 100,
  zoom: Math.round(spec.zoom * 1000) / 1000,
  cx: Math.round(spec.cx * 1000) / 1000,
  cy: Math.round(spec.cy * 1000) / 1000,
  custom: spec.custom,
})
