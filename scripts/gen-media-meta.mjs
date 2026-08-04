#!/usr/bin/env node
// Emits src/data/mediaMeta.generated.ts from what is actually on disk.
//
// Three rules, all learned the hard way:
//   1. Discover, never enumerate. process-media.sh looped file01..fileNN and
//      silently skipped raw/file07..file12 when they landed. Anything that has
//      to be kept in step with a directory listing eventually is not.
//   2. Probe the *shipped* rendition, not the raw source. `_full.mp4` is trimmed
//      (-t 12) and rescaled (scale=-2:720), so raw durations and raw pixel
//      dimensions are both wrong for anything the page displays. The aspect
//      ratio the browser lays out is the encode's, rounded-to-even width and all.
//   3. Discover from `public/media`, NOT from `raw/`.
//
// Rule 3 is why the ingest workflow could never have worked. `raw/` is
// gitignored, so it does not exist in a CI checkout at all; during an ingest it
// holds `upload.bin`, and nothing matching `raw/fileNN.mp4` is ever there. This
// script discovered its ids from that directory, found none, and exited 1 —
// failing the run at the "regenerate media metadata" step, before the commit.
// Every upload would have failed, and it would have looked like a transcode bug.
//
// `public/media` is the right source regardless: it is what ships, it is
// committed, and it is present wherever this runs.
//
// A rendition that is missing its companions is a hard error — that is exactly
// the silent skip rule 1 is about.

import { execFileSync } from 'node:child_process'
import { readdirSync, writeFileSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const MEDIA = resolve(root, 'public/media')
const OUT = resolve(root, 'src/data/mediaMeta.generated.ts')

/**
 * The backdrop is not an archive entry. It has its own renditions in the same
 * directory and no entry in `archive.ts`, so including it would emit metadata
 * for a file nothing looks up.
 */
const NOT_AN_ENTRY = new Set(['bg'])

const files = readdirSync(MEDIA)

/**
 * Every id with a shipped rendition, and which kind it is.
 *
 * A clip is identified by `_full.mp4`, a still by `_full.jpg`. An id is one or
 * the other, never both — the pipeline writes the ladder for exactly one kind,
 * and finding both means a leftover from a kind change that must be cleaned up
 * rather than guessed about.
 */
const found = new Map()
for (const file of files) {
  const match = /^(.+)_full\.(mp4|jpg)$/.exec(file)
  if (!match) continue
  const [, id, ext] = match
  if (NOT_AN_ENTRY.has(id)) continue
  if (found.has(id)) {
    console.error(`gen-media-meta: ${id} has both a video and a photo ladder — delete one`)
    process.exit(1)
  }
  found.set(id, ext === 'mp4' ? 'video' : 'photo')
}

const ids = [...found.keys()].sort()

if (ids.length === 0) {
  console.error(`gen-media-meta: no *_full.mp4 or *_full.jpg in ${MEDIA}`)
  process.exit(1)
}

/**
 * Width, height and duration of a shipped rendition.
 *
 * A still has no duration — ffprobe reports either nothing or a nonsense
 * single-frame value — so `durationSec` is 0 for a photo by definition rather
 * than by measurement. Everything that formats a duration already tolerates 0;
 * nothing divides by it.
 */
const probe = (file, kind) => {
  const out = execFileSync('ffprobe', [
    '-v', 'error',
    '-select_streams', 'v:0',
    '-show_entries', 'stream=width,height:format=duration',
    '-of', 'json',
    file,
  ]).toString()
  const json = JSON.parse(out)
  const stream = json.streams?.[0]
  if (!stream?.width || !stream?.height) {
    throw new Error(`ffprobe returned no usable dimensions for ${file}`)
  }
  if (kind === 'photo') return { width: stream.width, height: stream.height, durationSec: 0 }
  const duration = Number(json.format?.duration)
  if (!Number.isFinite(duration)) {
    throw new Error(`ffprobe returned no usable duration for ${file}`)
  }
  return { width: stream.width, height: stream.height, durationSec: Math.round(duration * 100) / 100 }
}

const need = (id, suffix) => {
  const path = resolve(MEDIA, `${id}${suffix}`)
  if (!existsSync(path)) {
    console.error(`gen-media-meta: ${id} has no public/media/${id}${suffix}`)
    process.exit(1)
  }
  return path
}

const rows = []
const thumbRows = []
const kindRows = []
for (const id of ids) {
  const kind = found.get(id)
  const ext = kind === 'photo' ? 'jpg' : 'mp4'
  const { width, height, durationSec } = probe(need(id, `_full.${ext}`), kind)
  rows.push(`  ${id}: { width: ${width}, height: ${height}, durationSec: ${durationSec} },`)
  // The thumb's box is emitted too, purely so the "both renditions share an
  // aspect ratio" invariant is checkable in a unit test instead of by hand. A
  // drift here is bars on every unfocused window, which is exactly the class of
  // thing nobody notices until it ships.
  const t = probe(need(id, `_thumb.${ext}`), kind)
  thumbRows.push(`  ${id}: { width: ${t.width}, height: ${t.height} },`)
  // Emitted so the app can tell a still from a clip WITHOUT trusting the
  // hand-authored `kind` field: this one is what is actually on disk, and it is
  // what decides whether a surface renders an <img> or a <video>.
  kindRows.push(`  ${id}: '${kind}',`)
  // Every entry needs its poster: the grid and the tiles use it at both tiers.
  need(id, '_poster.jpg')
  console.log(`${id}  ${kind}  ${width}x${height}  ${durationSec}s  thumb ${t.width}x${t.height}`)
}

const banner = `// GENERATED by scripts/gen-media-meta.mjs — do not edit by hand.
// Probed from public/media/*_full.{mp4,jpg}, the rendition the page displays.
// Regenerate with: npm run gen:media-meta
`

writeFileSync(
  OUT,
  `${banner}
export type MediaMeta = { width: number; height: number; durationSec: number }

export const MEDIA_META: Record<string, MediaMeta> = {
${rows.join('\n')}
}

/** The 240p encode's box. Only its aspect ratio matters, and only as a guard. */
export const THUMB_META: Record<string, { width: number; height: number }> = {
${thumbRows.join('\n')}
}

/**
 * What is on disk for each id: a clip or a still.
 *
 * Probed, not declared. The entry's own \`kind\` is editorial and can be wrong —
 * \`file09\` was flagged \`photo\` for months as an icon preview while being a
 * video — and a surface that renders an <img> for something with no image gets a
 * broken frame. This is the field that decides what is rendered.
 */
export const MEDIA_KIND: Record<string, 'video' | 'photo'> = {
${kindRows.join('\n')}
}
`,
)
console.log(`wrote ${OUT} (${rows.length} entries)`)
