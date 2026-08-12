import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { expect, type Page } from '@playwright/test'

/**
 * Assert the ABOUT panel is showing its real copy.
 *
 * These specs used to assert the literal string 'MOTION + VISUAL ART'. That was
 * a constant in `content.ts`, and it is now whatever the owner last published
 * through the admin panel — so the moment the copy was edited, three tests
 * failed, and they failed looking like a broken ABOUT panel rather than a stale
 * expectation. Copy the owner controls is not a fixture.
 *
 * So this reads the published content and asserts THAT is on screen, which is
 * what the tests were checking in the first place: that switching to ABOUT
 * renders the ABOUT copy.
 *
 * Read off disk rather than imported from `src/data/content.ts` on purpose.
 * Playwright runs these as Node ESM, where a JSON import needs an
 * `with { type: 'json' }` attribute that Vite does not require — importing the
 * app module here would mean adding a bundler-specific attribute to shipped code
 * to satisfy a test's loader. The file is the site's source of truth either way.
 */
type AboutBlock = { label: string; body: string }

const CONTENT = JSON.parse(
  readFileSync(fileURLToPath(new URL('../../src/data/content.json', import.meta.url)), 'utf8'),
) as { about: AboutBlock[] }

export async function expectAboutCopy(page: Page) {
  // The first block with a body: the panel renders every block, so any one of
  // them proves the panel, and an empty body is not something to assert on.
  const block = CONTENT.about.find((b) => b.body.trim())
  if (!block) throw new Error('no ABOUT block has a body — check src/data/content.json')
  // Scoped to a labelled block inside `.about-copy`, because a block's text can
  // legitimately appear elsewhere on the page — 'SEVEREDARCHIVE' is also the
  // wordmark's label — and an unscoped `getByText` would resolve to two nodes and
  // fail on strict mode rather than on the thing being tested.
  const row = page.locator('.about-copy .panel-block', { hasText: block.label })
  await expect(row).toBeVisible()
  await expect(row).toContainText(block.body)
}
