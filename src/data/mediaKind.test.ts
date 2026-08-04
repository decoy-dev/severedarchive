import { describe, expect, it } from 'vitest'
import { ARCHIVE, fullSrc, isStill, posterSrc, thumbSrc } from './archive'
import { MEDIA_KIND } from './mediaMeta.generated'

/**
 * The two `kind` fields, and which one is allowed to decide anything.
 *
 * An entry's `kind` is editorial: it drives the glyph in the explorer, and it can
 * be wrong. `file09` carried `kind: 'photo'` for weeks as a stand-in so the
 * picture glyph had a subject, while being an mp4 the whole time. `MEDIA_KIND` is
 * probed from what is on disk by `gen-media-meta.mjs`, and it is what every
 * rendering decision reads — because rendering an `<img>` for something with no
 * image is a broken frame, and a `<video>` pointed at a JPEG is the same bug
 * mirrored.
 */
describe('media kind', () => {
  it('resolves the ladder from what is on disk, not from the entry field', () => {
    for (const file of ARCHIVE) {
      const onDisk = MEDIA_KIND[file.id]
      expect(onDisk, `${file.id} has no probed kind`).toBeDefined()
      const ext = onDisk === 'photo' ? '.jpg' : '.mp4'
      expect(fullSrc(file.id), `${file.id} full`).toContain(`_full${ext}`)
      expect(thumbSrc(file.id), `${file.id} thumb`).toContain(`_thumb${ext}`)
      // The poster is a still whatever the entry is.
      expect(posterSrc(file.id)).toContain('_poster.jpg')
    }
  })

  it('agrees with every entry’s editorial kind', () => {
    // Not a redundant check on the one above: this is what would have caught
    // file09. A disagreement means the glyph promises one thing and the renditions
    // are another, and the two must be reconciled deliberately.
    const wrong = ARCHIVE.filter((f) => f.kind !== MEDIA_KIND[f.id])
      .map((f) => `${f.id} (${f.name}) says ${f.kind}, disk says ${MEDIA_KIND[f.id]}`)
    expect(wrong, wrong.join('; ')).toEqual([])
  })

  it('isStill answers from the probed map', () => {
    for (const file of ARCHIVE) {
      expect(isStill(file.id)).toBe(MEDIA_KIND[file.id] === 'photo')
    }
    // An id with no renditions is not a still; it is not anything.
    expect(isStill('nonexistent')).toBe(false)
  })

  it('gives a still a duration of zero rather than a measured one', () => {
    for (const file of ARCHIVE) {
      if (MEDIA_KIND[file.id] !== 'photo') continue
      expect(file.durationSec, `${file.id}`).toBe(0)
    }
  })
})
