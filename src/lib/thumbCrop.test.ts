import { describe, expect, it } from 'vitest'
import {
  DEFAULT_THUMB, MAX_ZOOM, cropPixels, cropRect, isDefaultCrop, normaliseThumb, previewStyle, serialiseThumb,
} from './thumbCrop'

describe('normaliseThumb', () => {
  it('fills in the defaults from nothing', () => {
    expect(normaliseThumb(null)).toEqual(DEFAULT_THUMB)
    expect(normaliseThumb({})).toEqual(DEFAULT_THUMB)
  })

  it('repairs rather than rejects, because this reaches a command line', () => {
    // A NaN in an ffmpeg argument is a failed render at the end of a five-minute
    // workflow, so nothing here is allowed to pass through unrepaired.
    const spec = normaliseThumb({ time: NaN, zoom: Infinity, cx: -3, cy: 99 } as never)
    // Out-of-range numbers are clamped; non-finite ones fall back to the
    // default. Clamping Infinity to MAX_ZOOM would be inventing an intent —
    // no-crop is the safer reading of a value that is not a number at all.
    expect(spec).toEqual({ time: 1, zoom: 1, cx: 0, cy: 1, custom: false })
    expect(normaliseThumb({ zoom: 9 }).zoom).toBe(MAX_ZOOM)
  })

  it('clamps the grab to the clip, since a grab past the end yields no frame', () => {
    expect(normaliseThumb({ time: 30 }, 11.5).time).toBe(11.5)
    expect(normaliseThumb({ time: -4 }, 11.5).time).toBe(0)
  })

  it('caps the zoom', () => {
    expect(normaliseThumb({ zoom: 50 }).zoom).toBe(MAX_ZOOM)
    expect(normaliseThumb({ zoom: 0.2 }).zoom).toBe(1)
  })

  it('treats anything but true as not custom', () => {
    expect(normaliseThumb({ custom: 'yes' } as never).custom).toBe(false)
    expect(normaliseThumb({ custom: true }).custom).toBe(true)
  })
})

describe('cropRect', () => {
  it('is the whole frame at zoom 1', () => {
    expect(cropRect(DEFAULT_THUMB)).toEqual({ x: 0, y: 0, w: 1, h: 1 })
  })

  it('keeps the frame aspect at every zoom, since the poster fills a box shaped by the clip', () => {
    for (const zoom of [1, 1.5, 2, 3, 4]) {
      const rect = cropRect({ ...DEFAULT_THUMB, zoom })
      expect(rect.w).toBeCloseTo(rect.h, 10)
    }
  })

  it('centres on the focal point', () => {
    const rect = cropRect({ ...DEFAULT_THUMB, zoom: 2 })
    expect(rect.x + rect.w / 2).toBeCloseTo(0.5, 10)
    expect(rect.y + rect.h / 2).toBeCloseTo(0.5, 10)
  })

  it('never leaves the frame, at any focal point', () => {
    for (const cx of [0, 0.13, 0.5, 0.87, 1]) {
      for (const cy of [0, 0.4, 1]) {
        for (const zoom of [1, 2.7, 4]) {
          const rect = cropRect({ ...DEFAULT_THUMB, zoom, cx, cy })
          expect(rect.x).toBeGreaterThanOrEqual(0)
          expect(rect.y).toBeGreaterThanOrEqual(0)
          expect(rect.x + rect.w).toBeLessThanOrEqual(1 + 1e-12)
          expect(rect.y + rect.h).toBeLessThanOrEqual(1 + 1e-12)
        }
      }
    }
  })

  it('sits flush against the edge the focal point is on', () => {
    expect(cropRect({ ...DEFAULT_THUMB, zoom: 2, cx: 0, cy: 0 })).toMatchObject({ x: 0, y: 0 })
    const far = cropRect({ ...DEFAULT_THUMB, zoom: 2, cx: 1, cy: 1 })
    expect(far.x + far.w).toBeCloseTo(1, 10)
    expect(far.y + far.h).toBeCloseTo(1, 10)
  })
})

describe('cropPixels', () => {
  it('is the whole frame at zoom 1', () => {
    expect(cropPixels(DEFAULT_THUMB, 1280, 720)).toEqual({ x: 0, y: 0, w: 1280, h: 720 })
  })

  it('produces even dimensions, which H.264 requires', () => {
    for (const zoom of [1.3, 1.7, 2.1, 3.3]) {
      for (const [w, h] of [[1280, 720], [1078, 1918], [1000, 1000]]) {
        const rect = cropPixels({ ...DEFAULT_THUMB, zoom, cx: 0.31, cy: 0.77 }, w, h)
        expect(rect.w % 2, `w ${rect.w}`).toBe(0)
        expect(rect.h % 2, `h ${rect.h}`).toBe(0)
      }
    }
  })

  it('never runs off the frame after rounding', () => {
    for (const zoom of [1.01, 1.33, 2.5, 4]) {
      for (const cx of [0, 0.5, 1]) {
        const rect = cropPixels({ ...DEFAULT_THUMB, zoom, cx, cy: 1 }, 1079, 1919)
        expect(rect.x + rect.w).toBeLessThanOrEqual(1079)
        expect(rect.y + rect.h).toBeLessThanOrEqual(1919)
      }
    }
  })
})

describe('previewStyle', () => {
  it('is the transform-origin identity the crop rect is defined by', () => {
    // The editor previews the crop by scaling the real video about this origin
    // and the pipeline computes the rect from the same numbers. If these two
    // ever disagree, the preview is a lie.
    const spec = { ...DEFAULT_THUMB, zoom: 2, cx: 0.25, cy: 0.75 }
    const style = previewStyle(spec)
    expect(style.transform).toBe('scale(2)')
    expect(style.transformOrigin).toBe('25.00% 75.00%')
    const rect = cropRect(spec)
    // The origin's position within the visible rect is the origin fraction.
    expect((spec.cx - rect.x) / rect.w).toBeCloseTo(spec.cx, 10)
    expect((spec.cy - rect.y) / rect.h).toBeCloseTo(spec.cy, 10)
  })
})

describe('isDefaultCrop', () => {
  it('is true only when nothing is cropped', () => {
    expect(isDefaultCrop(DEFAULT_THUMB)).toBe(true)
    expect(isDefaultCrop({ ...DEFAULT_THUMB, cx: 0.2 })).toBe(true)
    expect(isDefaultCrop({ ...DEFAULT_THUMB, zoom: 1.2 })).toBe(false)
  })
})

describe('serialiseThumb', () => {
  it('rounds so the committed entry does not carry float noise', () => {
    const spec = { time: 3.14159, zoom: 1.23456, cx: 0.333333, cy: 0.666666, custom: true }
    expect(JSON.parse(serialiseThumb(spec))).toEqual({
      time: 3.14, zoom: 1.235, cx: 0.333, cy: 0.667, custom: true,
    })
  })

  it('round-trips through normalise unchanged', () => {
    const spec = normaliseThumb({ time: 2.5, zoom: 1.75, cx: 0.4, cy: 0.6 })
    expect(normaliseThumb(JSON.parse(serialiseThumb(spec)))).toEqual(spec)
  })
})
