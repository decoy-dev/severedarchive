import { test, expect } from '@playwright/test'

/**
 * The title bar used to read `SEVEREDARCHIVE // FILE SYSTEM`. The wordmark took
 * the brand half of that — it is now huge Archivo Black display type behind the
 * window layer — and the title bar kept only `FILE SYSTEM`. Both halves are
 * asserted here so the split itself is what is pinned, not just one survivor.
 */
test('locked single screen, wordmark and window render', async ({ page }) => {
  await page.goto('./')
  // The wordmark is outlines, not text — `createDrawable` animates a stroke by
  // its length and SVG <text> has no `getTotalLength()`. So it carries its name
  // rather than containing it, and this asserts the name a screen reader gets.
  await expect(page.getByRole('img', { name: 'SEVEREDARCHIVE' })).toBeVisible()
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
 * The wordmark is sized to fit rather than to bleed. It used to be text at
 * 10.1vw against a measured 9.657em string; it is now traced outlines in a
 * viewBox whose aspect is generated from the same font, so the fit comes from
 * the box rather than from font metrics at render time. Still asserted rather
 * than trusted: regenerating the paths after a font update, or changing the
 * word, could push it back off the edge.
 */
test('the wordmark reads in full, inside the viewport', async ({ page }) => {
  await page.goto('./')
  const mark = page.locator('.wordmark')
  await expect(mark).toHaveAttribute('aria-label', 'SEVEREDARCHIVE')
  // One path per letter, twice over: the filled wordmark and the stroked copy
  // the trace animates. Per letter, because the draw staggers across them.
  await expect(page.locator('.wordmark-fill path')).toHaveCount(14)
  await expect(page.locator('.wordmark-stroke path')).toHaveCount(14)
  const fit = await mark.evaluate((el) => {
    const r = el.getBoundingClientRect()
    return { left: r.left, right: r.right, top: r.top, vw: window.innerWidth }
  })
  expect(fit.left).toBeGreaterThanOrEqual(0)
  expect(fit.right).toBeLessThanOrEqual(fit.vw)
  expect(fit.top).toBeGreaterThanOrEqual(0)   // not clipped against the top edge either
})

/**
 * The panel cuts the wordmark, and the cut is at its middle wherever there is
 * room for that — but never at the cost of pulling the mark above where the old
 * text one sat (0.97vw). On a phone the halfway rule wins; on desktop the floor
 * does, because halfway would put the letters against the viewport edge. The
 * exact-half case is asserted in `mobile.spec.ts`, where it applies.
 */
test('the panel cuts the wordmark, and never lifts it past its floor', async ({ page }) => {
  await page.goto('./')
  await expect(page.locator('.stage')).toHaveAttribute('data-booted', 'true', { timeout: 6000 })
  const [mark, panel, floor] = await Promise.all([
    page.locator('.wordmark').boundingBox(),
    page.locator('.terminal-window').boundingBox(),
    page.evaluate(() => window.innerWidth * 0.0097),
  ])
  // Cut, not cleared and not buried: the panel's edge falls inside the mark.
  const cut = (panel!.y - mark!.y) / mark!.height
  expect(cut).toBeGreaterThan(0.3)
  expect(cut).toBeLessThan(0.7)
  // And the floor holds — sub-pixel tolerance only.
  expect(mark!.y).toBeGreaterThanOrEqual(floor - 1)
})
