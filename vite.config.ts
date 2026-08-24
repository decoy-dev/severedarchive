import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { execSync } from 'node:child_process'

// Stamped into the page (bottom-right build tag) so a live check can tell
// exactly which commit is deployed and whether the page is cache-stale.
const sha = (() => {
  try { return execSync('git rev-parse --short HEAD').toString().trim() } catch { return 'dev' }
})()
const buildId = `BLD ${sha} · ${new Date().toISOString().slice(0, 16).replace('T', ' ')}Z`

export default defineConfig({
  base: '/',
  plugins: [react(), tailwindcss()],
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
