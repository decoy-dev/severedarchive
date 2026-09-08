import { defineConfig } from 'vitest/config'
import type { Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { execSync } from 'node:child_process'
import { writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  buildGalleryJsonLd,
  buildNoscriptHtml,
  buildSitemapXml,
  loadRndSeo,
  renderJsonLd,
  root,
} from './scripts/rnd-seo.mjs'

// Stamped into the page (bottom-right build tag) so a live check can tell
// exactly which commit is deployed and whether the page is cache-stale.
const sha = (() => {
  try { return execSync('git rev-parse --short HEAD').toString().trim() } catch { return 'dev' }
})()
const buildId = `BLD ${sha} · ${new Date().toISOString().slice(0, 16).replace('T', ' ')}Z`

// R&D is client-rendered, so without this crawlers see none of it: the initial
// HTML has an empty #root. This plugin bakes the gallery into the build output
// from src/data/rnd.json + mediaMeta.generated.ts — the same files the app
// renders from — so a client upload (which commits a row and redeploys) is in
// the structured data, the crawlable fallback and the sitemap automatically.
const rndSeo = (): Plugin => ({
  name: 'rnd-seo',
  // Build only: dev serves humans with JS on, and the injected block would
  // just be noise in every dev-server transform. There is no SSR pass here.
  apply: 'build',
  buildStart() {
    // Regenerated before Vite copies public/ into dist, so the deployed
    // sitemap always reflects the rnd.json being built. Deterministic and
    // offline; scripts/gen-sitemap.mjs is the same builder as a CLI.
    writeFileSync(resolve(root, 'public/sitemap.xml'), buildSitemapXml(loadRndSeo()))
  },
  transformIndexHtml() {
    const data = loadRndSeo()
    return [
      // Alongside the hand-written WebSite JSON-LD in index.html, not
      // replacing it — a page may carry any number of ld+json blocks.
      {
        tag: 'script',
        attrs: { type: 'application/ld+json' },
        children: renderJsonLd(buildGalleryJsonLd(data)),
        injectTo: 'head',
      },
      // Crawler-facing R&D text + thumbnails. <noscript> in <head> may only
      // contain link/style/meta, so the block goes at the top of <body>.
      { tag: 'noscript', children: buildNoscriptHtml(data), injectTo: 'body-prepend' },
    ]
  },
})

export default defineConfig({
  base: '/',
  plugins: [react(), tailwindcss(), rndSeo()],
  define: { __BUILD_ID__: JSON.stringify(buildId) },
  server: {
    // `wrangler dev` keeps its local KV in `.wrangler/state` as SQLite, and its
    // write-ahead log changes on every KV write. Vite's watcher does not read
    // .gitignore, so without this the admin Worker running alongside `vite dev`
    // full-reloads the page every time it counts a rate-limit hit — which made
    // filling in the commission form locally impossible, the page resetting
    // mid-keystroke.
    watch: { ignored: ['**/.wrangler/**'] },
  },
  test: {
    // Playwright owns tests/e2e; keep vitest scoped to unit tests only.
    exclude: ['tests/e2e/**', 'node_modules/**', 'dist/**'],
    // No unit tests exist yet (added starting Task 3's logic core) — don't fail the harness.
    passWithNoTests: true,
    // Node-version compatibility only; see the file for what it patches.
    setupFiles: ['./src/test/setup.ts'],
  },
})
