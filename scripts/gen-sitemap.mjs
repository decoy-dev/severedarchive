#!/usr/bin/env node
// Writes public/sitemap.xml from src/data/rnd.json + mediaMeta.generated.ts.
//
// The rnd-seo Vite plugin runs the same builder on every `vite build`, so the
// deployed sitemap is always current; this CLI exists for regenerating the
// committed copy by hand and for verifying determinism (same inputs, same
// bytes — no timestamps, no network).

import { writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { buildSitemapXml, loadRndSeo, root } from './rnd-seo.mjs'

const data = loadRndSeo()
const out = resolve(root, 'public/sitemap.xml')
writeFileSync(out, buildSitemapXml(data))
console.log(`wrote ${out} (${data.rows.length} images)`)
