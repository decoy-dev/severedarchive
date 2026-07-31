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
  base: '/severedarchive/',
  plugins: [react(), tailwindcss()],
  define: { __BUILD_ID__: JSON.stringify(buildId) },
  test: {
    // Playwright owns tests/e2e; keep vitest scoped to unit tests only.
    exclude: ['tests/e2e/**', 'node_modules/**', 'dist/**'],
    // No unit tests exist yet (added starting Task 3's logic core) — don't fail the harness.
    passWithNoTests: true,
  },
})
