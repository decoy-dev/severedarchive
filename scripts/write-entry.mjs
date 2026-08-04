#!/usr/bin/env node
/**
 * Append an uploaded entry to the archive's data file.
 *
 * Run by `.github/workflows/ingest.yml` with `ENTRY` (the JSON the Worker
 * validated) and `ID` (the derived file id) in the environment. It writes JSON
 * and nothing else — no media, no code — so a bad entry is a bad line in a data
 * file rather than a broken build.
 *
 * The file is the source of truth for the archive going forward. `archive.ts`
 * still holds the twelve hand-authored entries; the migration that has the app
 * read this file instead is the next slice, and until then this appends
 * alongside rather than replacing.
 */
import { readFile, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'

const PATH = 'src/data/entries.json'

const entry = JSON.parse(process.env.ENTRY ?? '{}')
const id = process.env.ID ?? ''

if (!id || !entry.name) {
  console.error('write-entry: ENTRY.name and ID are both required')
  process.exit(1)
}

/**
 * Whether a thumbnail spec is the pipeline default: one second in, uncropped, a
 * frame of the clip. Those entries carry no `thumb` at all.
 */
const isDefaultThumb = (t) =>
  !t || ((t.time ?? 1) === 1 && (t.zoom ?? 1) === 1 && (t.cx ?? 0.5) === 0.5
    && (t.cy ?? 0.5) === 0.5 && t.custom !== true)

const existing = existsSync(PATH) ? JSON.parse(await readFile(PATH, 'utf8')) : []

if (existing.some((e) => e.id === id || e.name === entry.name)) {
  // The Worker checks this too, but it checks against what the browser sent it.
  // This checks against what is actually committed, which is the thing that
  // matters if two uploads race.
  console.error(`write-entry: ${id} is already in ${PATH}`)
  process.exit(1)
}

existing.push({
  id,
  name: entry.name,
  ext: entry.kind === 'photo' ? 'JPG' : 'MP4',
  kind: entry.kind,
  tagline: entry.tagline ?? '',
  description: entry.description ?? '',
  date: entry.date,
  year: String(entry.date).slice(0, 4),
  postUrl: entry.postUrl || 'https://instagram.com/severedarchive',
  // Persisted so the editor reopens on the settings that produced this poster,
  // and so the same still can be re-rendered reproducibly. `undefined` rather
  // than omitted, so it is dropped by JSON.stringify either way.
  thumb: isDefaultThumb(entry.thumb) ? undefined : entry.thumb,
})

// Newest first, ties broken on name — the same total order the explorer uses,
// so the committed file reads in the order the site shows.
existing.sort((a, b) => (a.date === b.date ? a.name.localeCompare(b.name) : b.date.localeCompare(a.date)))

await writeFile(PATH, `${JSON.stringify(existing, null, 2)}\n`)
console.log(`write-entry: ${id} added, ${existing.length} entries total`)
