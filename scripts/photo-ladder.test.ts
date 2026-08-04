import { describe, expect, it, afterAll } from 'vitest'
import { execFileSync } from 'node:child_process'
import { existsSync, rmSync, mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

/**
 * The still ladder, run for real.
 *
 * The invariant under test is the true-frame ruling applied to photos: `_thumb`
 * must share `_full`'s aspect ratio to within 0.1%, because an unfocused window
 * plays the thumb inside a box laid out from the full's dimensions. For an image
 * that looks trivially satisfiable and is not — `scale=416:-2` on a 1440x960
 * still yields 416x278, which is 1.4964 against 1.5000: a 0.24% drift and visible
 * bars. The script searches for the box instead, and this holds it to that.
 *
 * It also pins the bug that search shipped with: the search stepped by 2 from an
 * odd starting height, so it only ever tried odd heights and never found the box
 * that is exactly on ratio. It settled at 0.0989% — inside tolerance, which is
 * the worst kind of pass.
 */
const HAS_FFMPEG = (() => {
  try {
    execFileSync('ffprobe', ['-version'], { stdio: 'ignore' })
    return true
  } catch {
    return false
  }
})()

const dir = HAS_FFMPEG ? mkdtempSync(join(tmpdir(), 'photo-ladder-')) : ''
const made: string[] = []

afterAll(() => {
  for (const id of made) {
    for (const suffix of ['_full.jpg', '_thumb.jpg', '_poster.jpg']) {
      rmSync(`public/media/${id}${suffix}`, { force: true })
    }
  }
  if (dir) rmSync(dir, { recursive: true, force: true })
})

const dims = (file: string) => {
  const out = execFileSync('ffprobe', [
    '-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height',
    '-of', 'csv=p=0', file,
  ], { encoding: 'utf8' }).trim().split(',').map(Number)
  return { w: out[0], h: out[1] }
}

const run = (size: string, id: string) => {
  const src = join(dir, `${id}.jpg`)
  execFileSync('ffmpeg', ['-y', '-v', 'error', '-f', 'lavfi', '-i', `testsrc2=size=${size}`, '-frames:v', '1', src])
  made.push(id)
  execFileSync('./scripts/process-photo.sh', [src, id], { encoding: 'utf8' })
  return {
    full: dims(`public/media/${id}_full.jpg`),
    thumb: dims(`public/media/${id}_thumb.jpg`),
    poster: dims(`public/media/${id}_poster.jpg`),
  }
}

describe.skipIf(!HAS_FFMPEG)('process-photo.sh', () => {
  const shapes: [string, string][] = [
    ['3000x2000', 'landscape'],
    ['1200x1800', 'portrait'],
    ['900x900', 'square'],
    ['1999x1001', 'nearly 2:1'],
    ['1234x4321', 'extreme portrait'],
    ['1080x1350', 'instagram portrait'],
  ]

  it.each(shapes)('keeps the thumb within 0.1%% of the full for %s (%s)', (size) => {
    const id = `t_${size.replace('x', '_')}`
    const { full, thumb } = run(size, id)
    const drift = Math.abs(thumb.w / thumb.h - full.w / full.h) / (full.w / full.h)
    expect(drift, `full ${full.w}x${full.h}, thumb ${thumb.w}x${thumb.h} → ${(drift * 100).toFixed(4)}%`)
      .toBeLessThan(0.001)
  })

  it('finds the exactly-on-ratio box for 1440x960, not merely a passing one', () => {
    // The regression this pins. 414x276 is exactly 1.5; the odd-height search
    // returned 506x337 at 0.0989%, which passed the tolerance while being wrong.
    const { full, thumb } = run('2880x1920', 't_exact')
    expect(full).toEqual({ w: 1440, h: 960 })
    expect(thumb.w / thumb.h).toBe(full.w / full.h)
  })

  it('caps the long edge at 1440 whichever axis it is', () => {
    const land = run('3000x2000', 't_cap_l')
    expect(Math.max(land.full.w, land.full.h)).toBe(1440)
    const port = run('2000x3000', 't_cap_p')
    expect(Math.max(port.full.w, port.full.h)).toBe(1440)
  })

  it('writes all three renditions, so gen-media-meta cannot fail on a missing one', () => {
    run('1600x900', 't_three')
    for (const suffix of ['_full.jpg', '_thumb.jpg', '_poster.jpg']) {
      expect(existsSync(`public/media/t_three${suffix}`), suffix).toBe(true)
    }
  })

  it('gives the poster the full’s shape', () => {
    // It drops into a tile laid out from the full's dimensions, exactly as a
    // clip's poster does.
    const { full, poster } = run('1500x1000', 't_poster')
    const drift = Math.abs(poster.w / poster.h - full.w / full.h) / (full.w / full.h)
    expect(drift).toBeLessThan(0.006)
  })
})
