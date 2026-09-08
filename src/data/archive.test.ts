import { describe, it, expect } from 'vitest'
import { ARCHIVE, DEFAULT_FRONT_ID, fileById, isArchiveId, formatDuration, formatResolution, aspectRatio } from './archive'
import { MEDIA_META, THUMB_META } from './mediaMeta.generated'
import { RND } from './rnd'

describe('archive metadata', () => {
  // The guard §4.8 asks for: a clip added to raw/ without re-running the
  // generator fails the suite instead of shipping as a silent 16:9.
  it('every archive id has generated metadata', () => {
    for (const f of ARCHIVE) {
      expect(MEDIA_META[f.id], `${f.id} has no generated metadata`).toBeDefined()
    }
  })

  it('every generated entry is claimed by an archive or R&D id', () => {
    // MEDIA_META is generated from everything in public/media and now serves two
    // collections — the archive and the R&D gallery (rnd_-prefixed ids). A
    // generated id that belongs to neither is an orphan rendition.
    const ids = new Set([...ARCHIVE.map((f) => f.id), ...RND.map((f) => f.id)])
    for (const id of Object.keys(MEDIA_META)) {
      expect(ids.has(id), `${id} is encoded but claimed by neither ARCHIVE nor RND`).toBe(true)
    }
  })

  it('carries usable dimensions and kind-appropriate duration on every file', () => {
    for (const f of ARCHIVE) {
      expect(f.width).toBeGreaterThan(0)
      expect(f.height).toBeGreaterThan(0)
      // Stills legitimately have no timeline; clips must expose the duration
      // their focused player displays.
      expect(f.durationSec).toBeGreaterThanOrEqual(0)
      if (f.kind === 'photo') expect(f.durationSec).toBe(0)
      else expect(f.durationSec).toBeGreaterThan(0)
    }
  })

  it('preserves the non-16:9 source aspect ratios present in the archive', () => {
    // The current collection is portrait-heavy. If a still ever silently falls
    // back to 16:9, its focused frame and thumbnail box would be wrong.
    expect(ARCHIVE.some((f) => Math.abs(aspectRatio(f) - 16 / 9) > 0.01)).toBe(true)
    for (const f of ARCHIVE) {
      expect(aspectRatio(f)).toBeCloseTo(MEDIA_META[f.id].width / MEDIA_META[f.id].height, 8)
    }
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
  it('accepts a live archive id and rejects strangers', () => {
    const live = ARCHIVE[0]
    expect(isArchiveId(live.id)).toBe(true)
    expect(fileById(live.id)).toEqual(live)
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
  it('reads WxH from a live entry’s generated metadata', () => {
    const live = ARCHIVE[0]
    expect(formatResolution(live)).toBe(`${live.width}×${live.height}`)
  })
})
