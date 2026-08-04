import { describe, expect, it } from 'vitest'
import { execFileSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { cropPixels, type ThumbSpec } from '../src/lib/thumbCrop'

/**
 * The editor's preview and the poster the pipeline renders must be the same crop.
 *
 * Three links in that chain, and unit tests already hold two of them:
 * `previewStyle` agrees with `cropRect` (thumbCrop.test.ts), and `cropPixels` is
 * `cropRect` in whole even pixels. The third link is `render-poster.sh`, which
 * re-implements the arithmetic in awk because a shell script cannot import
 * TypeScript. That duplication is the risk, so this test runs the real script and
 * holds its output to `cropPixels`.
 *
 * Without this, "what you drag is what you get" is an assertion rather than a
 * fact, and it would break silently: a wrong crop still renders a plausible
 * still, just not the one that was chosen.
 *
 * Skipped where ffmpeg is not installed — the script probes the clip with
 * ffprobe. It runs locally and on any runner that has it.
 */
const HAS_FFMPEG = (() => {
  try {
    execFileSync('ffprobe', ['-version'], { stdio: 'ignore' })
    return existsSync('public/media/file03_full.mp4')
  } catch {
    return false
  }
})()

const spec = (over: Partial<ThumbSpec>): ThumbSpec =>
  ({ time: 1, zoom: 1, cx: 0.5, cy: 0.5, custom: false, ...over })

/** Runs the script and reads back the crop it decided on. */
const scriptCrop = (s: ThumbSpec, id = 'file03') => {
  const out = execFileSync('./scripts/render-poster.sh', [
    id, `public/media/${id}_full.mp4`, JSON.stringify(s),
  ], { encoding: 'utf8' })
  const m = /crop (\d+)x(\d+)\+(\d+)\+(\d+)/.exec(out)
  if (!m) throw new Error(`no crop in output: ${out}`)
  return { w: Number(m[1]), h: Number(m[2]), x: Number(m[3]), y: Number(m[4]) }
}

describe.skipIf(!HAS_FFMPEG)('render-poster.sh agrees with cropPixels', () => {
  const dims = () => {
    const out = execFileSync('ffprobe', [
      '-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height',
      '-of', 'csv=p=0', 'public/media/file03_full.mp4',
    ], { encoding: 'utf8' }).trim().split(',').map(Number)
    return { width: out[0], height: out[1] }
  }

  const cases: Partial<ThumbSpec>[] = [
    {},
    { zoom: 1.05 },
    { zoom: 1.5, cx: 0, cy: 0 },
    { zoom: 2, cx: 1, cy: 1 },
    { zoom: 2.4, cx: 0.91, cy: 0.99 },
    { zoom: 3.3, cx: 0.31, cy: 0.77 },
    { zoom: 4, cx: 0.5, cy: 0.5 },
    { zoom: 4, cx: 0, cy: 1 },
  ]

  it.each(cases)('matches for %o', (over) => {
    const { width, height } = dims()
    const s = spec(over)
    expect(scriptCrop(s)).toEqual(cropPixels(s, width, height))
  })

  it('keeps the clip’s aspect at every zoom, so the still fits its tile', () => {
    const { width, height } = dims()
    const source = width / height
    for (const over of cases) {
      const rect = scriptCrop(spec(over))
      const drift = Math.abs(rect.w / rect.h - source) / source
      // Even-pixel snapping moves the ratio slightly; the tile is laid out from
      // the clip, so this is the budget for how far the still may differ.
      expect(drift, `zoom ${over.zoom ?? 1} drifted ${(drift * 100).toFixed(3)}%`).toBeLessThan
        (0.006)
    }
  })
})
