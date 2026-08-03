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
 * `.stage` must clip rather than scroll. It used to use `overflow: hidden`,
 * which made it a scroll container, and the browser would scroll the whole
 * desktop sideways to reveal a newly focused row. `clip` refuses to be a scroll
 * container at all, and this is the regression guard.
 */
test('the stage clips rather than scrolls', async ({ page }) => {
  await page.goto('./')
  const stage = page.locator('.stage')
  await expect(stage).toHaveCSS('overflow-x', 'clip')
  expect(await stage.evaluate((el) => el.scrollLeft)).toBe(0)
})

/**
 * The wordmark is sized to fit rather than to bleed (10.1vw against a measured
 * 9.657em string). Font metrics are exactly the kind of thing that drifts
 * silently — a font update or a change to the word itself would push it back
 * off the edge — so the fit is asserted rather than trusted.
 */
test('the wordmark reads in full, inside the viewport', async ({ page }) => {
  await page.goto('./')
  const mark = page.locator('.wordmark')
  await expect(mark).toHaveText('SEVEREDARCHIVE')
  const fit = await mark.evaluate((el) => {
    const r = el.getBoundingClientRect()
    return { left: r.left, right: r.right, top: r.top, vw: window.innerWidth }
  })
  expect(fit.left).toBeGreaterThanOrEqual(0)
  expect(fit.right).toBeLessThanOrEqual(fit.vw)
  expect(fit.top).toBeGreaterThanOrEqual(0)   // not clipped against the top edge either
})
