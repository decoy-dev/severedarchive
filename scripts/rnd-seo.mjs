#!/usr/bin/env node
// Single source for everything R&D SEO: the ImageGallery JSON-LD and the
// <noscript> block that vite.config.ts injects into index.html at build time,
// plus the image sitemap that gen-sitemap.mjs writes to public/sitemap.xml.
//
// Everything derives from src/data/rnd.json + src/data/mediaMeta.generated.ts —
// the same two files the gallery renders from — so a client upload that lands a
// row in rnd.json (the ingest workflow commits the row, the renditions and the
// regenerated metadata together) is in the structured data and the sitemap on
// the next deploy, with no manual step.
//
// mediaMeta.generated.ts is read and line-parsed rather than imported: this
// module must run under plain Node (gen-sitemap.mjs and the standalone proof
// harness), which cannot import TypeScript. The file is machine-written by
// gen-media-meta.mjs with a fixed per-line shape, so parsing it is parsing our
// own generator's output, not hand-authored code — and the block extractor
// throws rather than degrades if that shape ever changes.

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

export const SITE = 'https://severedarchive.com'

/** The R&D tab's own blurb, mirrored here for crawlers. */
export const RND_BLURB = 'Experiments, side quests, proof of life and concepts.'

export const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')

/** One `export const NAME … = { … }` object literal, without its closing brace. */
const block = (src, name) => {
  const start = src.indexOf(`export const ${name}`)
  const end = src.indexOf('\n}', start)
  if (start === -1 || end === -1) throw new Error(`mediaMeta.generated.ts: no ${name} block`)
  return src.slice(start, end)
}

/**
 * Reads fresh on every call rather than caching at module load: the Vite
 * plugin calls this per build, and a CI build must see the row the ingest
 * workflow just committed, not whatever was on disk when the module loaded.
 */
export function loadRndSeo() {
  const rows = JSON.parse(readFileSync(resolve(root, 'src/data/rnd.json'), 'utf8'))

  const metaSrc = readFileSync(resolve(root, 'src/data/mediaMeta.generated.ts'), 'utf8')
  const meta = {}
  for (const m of block(metaSrc, 'MEDIA_META').matchAll(/(\w+): \{ width: (\d+), height: (\d+)/g))
    meta[m[1]] = { width: Number(m[2]), height: Number(m[3]) }
  const version = {}
  for (const m of block(metaSrc, 'MEDIA_VERSION').matchAll(/(\w+): \{ full: '([^']+)', thumb: '([^']+)'/g))
    version[m[1]] = { full: m[2], thumb: m[3] }

  return { rows, meta, version }
}

/**
 * Absolute media URL with the same ?v= cache-bust the app uses. A row whose
 * renditions have not landed yet (hand-edited json, metadata not regenerated)
 * gets the bare URL rather than killing the build — the image still resolves,
 * it just is not cache-busted.
 */
const mediaUrl = (id, rendition, version) => {
  const v = version[id]?.[rendition]
  return `${SITE}/media/${id}_${rendition}.jpg${v ? `?v=${v}` : ''}`
}

const escHtml = (s) =>
  String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

/**
 * The R&D gallery as schema.org structured data. An empty rnd.json emits the
 * gallery with an empty media array, which is still valid — the page exists
 * even when nothing is in it yet.
 */
export function buildGalleryJsonLd({ rows, meta, version }) {
  return {
    '@context': 'https://schema.org',
    '@type': 'ImageGallery',
    name: 'severedarchive — R+D',
    url: `${SITE}/#rnd`,
    description: RND_BLURB,
    isPartOf: { '@type': 'WebSite', name: 'SEVEREDARCHIVE', url: `${SITE}/` },
    associatedMedia: rows.map((row) => {
      const m = meta[row.id]
      return {
        '@type': 'ImageObject',
        name: row.name,
        caption: row.tagline,
        description: row.description || row.tagline,
        contentUrl: mediaUrl(row.id, 'full', version),
        thumbnailUrl: mediaUrl(row.id, 'thumb', version),
        // Omitted, not zeroed, when the renditions have not been probed yet.
        ...(m ? { width: m.width, height: m.height } : {}),
        uploadDate: row.date,
      }
    }),
  }
}

/**
 * Serialised for embedding in a <script> tag. `<` is escaped so no entry text
 * (or a hostile description) can smuggle a `</script>` and break out of the
 * tag; JSON.parse reads \u003c straight back, so consumers are unaffected.
 */
export const renderJsonLd = (obj) => JSON.stringify(obj, null, 2).replace(/</g, '\\u003c')

/**
 * Inner HTML for a <noscript> in <body> — crawler-facing R&D text and images
 * in the initial HTML, since the CSR app renders nothing without JS. Body, not
 * head: <noscript> in <head> may only contain link/style/meta.
 */
export function buildNoscriptHtml({ rows, version }) {
  const items = rows
    .map((row) => {
      const thumb = `/media/${row.id}_thumb.jpg${version[row.id] ? `?v=${version[row.id].thumb}` : ''}`
      return `        <li>
          <img src="${thumb}" alt="${escHtml(row.name)}" loading="lazy" />
          <strong>${escHtml(row.name)}</strong> — ${escHtml(row.description || row.tagline)}
        </li>`
    })
    .join('\n')
  return `
      <section>
        <h2>R+D — Research + Development</h2>
        <p>${escHtml(RND_BLURB)}</p>
        <ul>
${items}
        </ul>
      </section>
    `
}

const escXml = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

/**
 * Image sitemap: the SPA has exactly one real URL, so every R&D full-rendition
 * image hangs off the single <url> via the Google image extension rather than
 * inventing per-tab URLs that would 404 as documents. Only <image:loc> — the
 * title/caption/license sub-tags were dropped by Google in 2022.
 */
export function buildSitemapXml({ rows, version }) {
  const images = rows
    .map(
      (row) => `    <image:image>
      <image:loc>${escXml(mediaUrl(row.id, 'full', version))}</image:loc>
    </image:image>`,
    )
    .join('\n')
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"
        xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">
  <url>
    <loc>${SITE}/</loc>
${images ? `${images}\n` : ''}  </url>
</urlset>
`
}
