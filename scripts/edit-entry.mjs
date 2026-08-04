#!/usr/bin/env node
/**
 * Apply an admin edit or removal to the archive's data files.
 *
 * Run by `.github/workflows/edit.yml` with `OP` (`edit` or `remove`), `ID` and
 * `ENTRY` (the JSON the Worker validated) in the environment.
 *
 * Two stores, because there are two kinds of entry:
 *
 * - An UPLOADED entry lives in `entries.json` and is edited in place.
 * - One of the twelve originals lives in `archive.ts`, which is source code. A
 *   workflow that rewrites source is a workflow that can break the build with a
 *   stray quote, so those edits are recorded in `overrides.json` and merged over
 *   the entry at load. See the note in `src/data/archive.ts`.
 *
 * The id is never changed. It names the renditions on disk, so it is the one
 * field an edit cannot touch — a rename changes the displayed name only.
 */
import { readFile, writeFile, rm } from 'node:fs/promises'
import { existsSync } from 'node:fs'

const ENTRIES = 'src/data/entries.json'
const OVERRIDES = 'src/data/overrides.json'
const MEDIA = 'public/media'

const op = process.env.OP ?? ''
const id = process.env.ID ?? ''
const entry = JSON.parse(process.env.ENTRY ?? '{}')

if (op !== 'edit' && op !== 'remove') {
  console.error(`edit-entry: OP must be edit or remove, got ${JSON.stringify(op)}`)
  process.exit(1)
}
// Re-checked here even though the Worker checks it: this value reaches a file
// path below, and the two guards are independent on purpose.
if (!/^[a-z0-9][a-z0-9_]{0,40}$/.test(id)) {
  console.error(`edit-entry: ID ${JSON.stringify(id)} is not a valid entry id`)
  process.exit(1)
}

/**
 * Whether a thumbnail spec is the pipeline default: one second in, uncropped, a
 * frame of the clip. Those entries carry no `thumb` at all.
 */
const isDefaultThumb = (t) =>
  !t || ((t.time ?? 1) === 1 && (t.zoom ?? 1) === 1 && (t.cx ?? 0.5) === 0.5
    && (t.cy ?? 0.5) === 0.5 && t.custom !== true)

const readJson = async (path, fallback) =>
  existsSync(path) ? JSON.parse(await readFile(path, 'utf8')) : fallback

const uploaded = await readJson(ENTRIES, [])
const overrides = await readJson(OVERRIDES, { patch: {}, removed: [] })
overrides.patch ??= {}
overrides.removed ??= []

const index = uploaded.findIndex((e) => e.id === id)
const isUploaded = index !== -1

if (op === 'remove') {
  if (isUploaded) {
    uploaded.splice(index, 1)
  } else {
    // A built-in: recorded, since the entry itself is in source. Idempotent, so
    // a retried dispatch does not list it twice.
    if (!overrides.removed.includes(id)) overrides.removed.push(id)
  }
  // A patch for something that no longer exists is dead weight, and would come
  // back to haunt an entry that later reuses the id.
  delete overrides.patch[id]

  // The renditions go with it. This is the only destructive step in the
  // pipeline, and it is why the interface makes the name be typed back.
  // Both ladders: an entry is a clip OR a still, and this must not need to know
  // which. Leaving the other kind's files behind would strand renditions for an
  // entry that no longer exists, and `gen-media-meta.mjs` would keep emitting
  // metadata for it.
  for (const suffix of ['_full.mp4', '_thumb.mp4', '_full.jpg', '_thumb.jpg', '_poster.jpg']) {
    await rm(`${MEDIA}/${id}${suffix}`, { force: true })
  }
  console.log(`edit-entry: removed ${id} (${isUploaded ? 'uploaded' : 'built-in'})`)
} else {
  // Only the editable fields, never the id, and never `ext`/`kind` derived
  // state beyond what the form actually collects.
  const fields = {
    name: entry.name,
    kind: entry.kind,
    ext: entry.kind === 'photo' ? 'JPG' : 'MP4',
    tagline: entry.tagline ?? '',
    description: entry.description ?? '',
    date: entry.date,
    year: String(entry.date).slice(0, 4),
    postUrl: entry.postUrl || 'https://instagram.com/severedarchive',
    // Persisted so the editor reopens on the settings that produced the current
    // poster, and so the same still can be re-rendered reproducibly.
    //
    // Set explicitly to `undefined` rather than omitted from the object: these
    // fields are MERGED over what is already stored, so omitting the key leaves
    // a previous crop in place and resetting a thumbnail to the default would
    // silently not take. JSON.stringify drops an undefined value, so the stored
    // entry ends up with no `thumb` at all, which is what the default means.
    thumb: isDefaultThumb(entry.thumb) ? undefined : entry.thumb,
  }
  if (isUploaded) {
    uploaded[index] = { ...uploaded[index], ...fields, id }
    // Same total order the explorer uses, so the file reads in display order.
    uploaded.sort((a, b) => (a.date === b.date ? a.name.localeCompare(b.name) : b.date.localeCompare(a.date)))
  } else {
    overrides.patch[id] = { ...overrides.patch[id], ...fields }
  }
  console.log(`edit-entry: updated ${id} (${isUploaded ? 'entries.json' : 'overrides.json'})`)
}

await writeFile(ENTRIES, `${JSON.stringify(uploaded, null, 2)}\n`)
await writeFile(OVERRIDES, `${JSON.stringify(overrides, null, 2)}\n`)
