import { test, expect } from '@playwright/test'

/**
 * The title bar used to read `SEVEREDARCHIVE // FILE SYSTEM`. The wordmark took
 * the brand half of that — it is now huge Archivo Black display type behind the
 * window layer — and the title bar kept only `FILE SYSTEM`. Both halves are
 * asserted here so the split itself is what is pinned, not just one survivor.
 */
test('locked single screen, wordmark and window render', async ({ page }) => {
  await page.goto('./')
  await expect(page.locator('.wordmark')).toHaveText('SEVEREDARCHIVE')
  await expect(page.locator('.tw-title')).toHaveText('FILE SYSTEM')

  const scroll = await page.evaluate(() => ({
    doc: document.documentElement.scrollHeight - document.documentElement.clientHeight,
    body: document.body.scrollHeight - document.body.clientHeight,
  }))
  expect(scroll.doc).toBeLessThanOrEqual(1)
  expect(scroll.body).toBeLessThanOrEqual(1)
})

/**
 * The wordmark deliberately bleeds off both edges, which is exactly the shape
 * that made `.stage` scrollable when it used `overflow: hidden` — a browser
 * would scroll the whole desktop sideways to reveal a focused row. `clip` is
 * the fix and this is the regression guard for it.
 */
test('the stage clips rather than scrolls', async ({ page }) => {
  await page.goto('./')
  const stage = page.locator('.stage')
  await expect(stage).toHaveCSS('overflow-x', 'clip')
  const overflow = await stage.evaluate((el) => ({
    x: el.scrollWidth - el.clientWidth,
    left: el.scrollLeft,
  }))
  expect(overflow.left).toBe(0)
  expect(overflow.x).toBeGreaterThan(0) // the wordmark really does overhang
})
