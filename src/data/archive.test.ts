import { describe, it, expect } from 'vitest'
import { ARCHIVE, DEFAULT_FRONT_ID, fileById, isArchiveId, formatDuration, formatResolution, aspectRatio } from './archive'
import { MEDIA_META, THUMB_META } from './mediaMeta.generated'

describe('archive metadata', () => {
  // The guard §4.8 asks for: a clip added to raw/ without re-running the
  // generator fails the suite instead of shipping as a silent 16:9.
  it('every archive id has generated metadata', () => {
    for (const f of ARCHIVE) {
      expect(MEDIA_META[f.id], `${f.id} has no generated metadata`).toBeDefined()
    }
  })

  it('every generated entry is claimed by an archive id', () => {
    const ids = new Set(ARCHIVE.map((f) => f.id))
    for (const id of Object.keys(MEDIA_META)) {
      expect(ids.has(id), `${id} is encoded but missing from ARCHIVE`).toBe(true)
    }
  })

  it('carries usable width, height and durationSec on every file', () => {
    for (const f of ARCHIVE) {
      expect(f.width).toBeGreaterThan(0)
      expect(f.height).toBeGreaterThan(0)
      expect(f.durationSec).toBeGreaterThan(0)
    }
  })

  it('includes the non-16:9 files the true-frame rule exists for', () => {
    // Portrait and square. If these ever read 16:9 the aspect pipeline is broken.
    expect(aspectRatio(fileById('file08')!)).toBeLessThan(1)
    expect(aspectRatio(fileById('file09')!)).toBe(1)
    expect(aspectRatio(fileById('file01')!)).toBeCloseTo(16 / 9, 2)
  })

  // The window's box comes from the FULL encode's ratio, and an unfocused window
  // shows the THUMB in that box. If the two encodes disagree, every unfocused
  // window is barred on one axis — the letterboxing binding ruling 2 forbids.
  // They used to disagree: file07/file08 thumbs were 136×240 (0.5667) against a
  // 406×720 full (0.5639), and file01 426×240 against 1280×720, because each
  // encode rounded to its own nearest even number at its own scale.
  it('every _thumb shares its _full aspect ratio within 0.1%', () => {
    for (const f of ARCHIVE) {
      const t = THUMB_META[f.id]
      expect(t, `${f.id} has no generated thumb metadata`).toBeDefined()
      const drift = Math.abs(t.width / t.height - f.width / f.height) / (f.width / f.height)
      expect(drift, `${f.id}: thumb ${t.width}×${t.height} vs full ${f.width}×${f.height}`).toBeLessThan(0.001)
    }
  })

  it('has a unique id and name per file', () => {
    // The name carries the identity now: the FILE_00x index is gone from the
    // data as well as the interface, so a duplicate name would be genuinely
    // ambiguous rather than merely confusing.
    expect(new Set(ARCHIVE.map((f) => f.id)).size).toBe(ARCHIVE.length)
    expect(new Set(ARCHIVE.map((f) => f.name)).size).toBe(ARCHIVE.length)
  })

  it('DEFAULT_FRONT_ID names a real file', () => {
    expect(isArchiveId(DEFAULT_FRONT_ID)).toBe(true)
  })
})

describe('isArchiveId / fileById', () => {
  it('accepts known ids and rejects everything else', () => {
    expect(isArchiveId('file01')).toBe(true)
    expect(isArchiveId('file99')).toBe(false)
    expect(isArchiveId('')).toBe(false)
    expect(fileById('file99')).toBeUndefined()
  })
})

describe('formatDuration', () => {
  it('rounds to the nearest second and pads', () => {
    expect(formatDuration(10.43)).toBe('00:10')
    expect(formatDuration(9.97)).toBe('00:10')
    expect(formatDuration(5.03)).toBe('00:05')
    expect(formatDuration(9.17)).toBe('00:09')
  })

  it('carries minutes and clamps negatives', () => {
    expect(formatDuration(75)).toBe('01:15')
    expect(formatDuration(-3)).toBe('00:00')
  })
})

describe('formatResolution', () => {
  it('reads WxH from the generated metadata', () => {
    expect(formatResolution(fileById('file09')!)).toBe('720×720')
  })
})
