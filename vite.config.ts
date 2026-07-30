import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  base: '/severedarchive/',
  plugins: [react(), tailwindcss()],
  test: {
    // Playwright owns tests/e2e; keep vitest scoped to unit tests only.
    exclude: ['tests/e2e/**', 'node_modules/**', 'dist/**'],
    // No unit tests exist yet (added starting Task 3's logic core) — don't fail the harness.
    passWithNoTests: true,
  },
})
