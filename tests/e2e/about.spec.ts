import { test, expect } from '@playwright/test'
import { ready } from './helpers'

/**
 * The About object is three.js behind an ASCII pass, mounted only while its tab
 * is selected. The risks worth testing are all lifecycle, not looks: that it
 * arrives, that it leaves, and that repeated visits do not stack up renderers.
 */
test.describe('about ascii object', () => {
  // Below 641px the copy already fills the panel, so the object is not mounted
  // and the three.js chunk is never fetched.
  test.skip(({ viewport }) => viewport!.width <= 640, 'the object needs a second column')

  test('mounts on the ABOUT tab and renders characters, not a canvas', async ({ page }) => {
    await ready(page)
    await page.getByRole('tab', { name: 'ABOUT' }).click()

    const host = page.locator('.ascii-object')
    await expect(host).toHaveCount(1)
    // `live` / `lite` / `static` all mean the model built; `error` is the
    // fallback path. Anything else means it never got there.
    await expect(host).toHaveAttribute('data-state', /^(live|lite|static)$/, { timeout: 15000 })

    // AsciiEffect renders text, and the transparency is the point — a visible
    // rectangular canvas would sit on top of the glass environment.
    await expect(host.locator('canvas')).toHaveCount(0)
    expect((await host.innerText()).trim().length).toBeGreaterThan(0)
  })

  test('unmounts cleanly and does not accumulate across tab switches', async ({ page }) => {
    await ready(page)
    for (let i = 0; i < 3; i++) {
      await page.getByRole('tab', { name: 'ABOUT' }).click()
      await expect(page.locator('.ascii-object')).toHaveAttribute('data-state', /^(live|lite|static)$/, { timeout: 15000 })
      await page.getByRole('tab', { name: 'LINKS' }).click()
      await expect(page.locator('.ascii-object')).toHaveCount(0)
    }
    await page.getByRole('tab', { name: 'ABOUT' }).click()
    await expect(page.locator('.ascii-object')).toHaveCount(1)
  })

  test('the object never enters the tab order', async ({ page }) => {
    await ready(page)
    await page.getByRole('tab', { name: 'ABOUT' }).click()
    await expect(page.locator('.ascii-object')).toHaveAttribute('aria-hidden', 'true')
    expect(await page.locator('.ascii-object [tabindex]:not([tabindex="-1"])').count()).toBe(0)
  })

  test('the page still does not scroll with the object mounted', async ({ page }) => {
    await ready(page)
    await page.getByRole('tab', { name: 'ABOUT' }).click()
    await expect(page.locator('.ascii-object')).toHaveAttribute('data-state', /^(live|lite|static)$/, { timeout: 15000 })
    const scroll = await page.evaluate(() => ({
      y: document.documentElement.scrollHeight - document.documentElement.clientHeight,
      x: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    }))
    expect(scroll.y).toBeLessThanOrEqual(1)
    expect(scroll.x).toBeLessThanOrEqual(1)
  })
})

test('at the mobile breakpoint the object sits under the copy, and nothing scrolls', async ({ page, viewport }) => {
  test.skip(viewport!.width > 640, 'mobile-only assertion')
  await ready(page)
  await page.getByRole('tab', { name: 'ABOUT' }).click()
  await expect(page.getByText('MOTION + VISUAL ART')).toBeVisible()

  // The object used to be gated off below 641px for want of room; the owner
  // asked for it here too. Measured on a 390x844 phone, the copy leaves 194px
  // of panel spare and the object is capped well inside that.
  const host = page.locator('.ascii-object')
  await expect(host).toHaveCount(1)
  await expect(host).toHaveAttribute('data-state', /^(live|lite|static|error)$/, { timeout: 15000 })

  // Below the copy, not beside it, and inside the panel.
  const [copy, obj, panel] = await Promise.all([
    page.locator('.about-copy').boundingBox(),
    host.boundingBox(),
    page.locator('.about-panel').boundingBox(),
  ])
  expect(obj!.y).toBeGreaterThanOrEqual(copy!.y + copy!.height - 1)
  expect(obj!.y + obj!.height).toBeLessThanOrEqual(panel!.y + panel!.height + 1)

  // The cap exists so this stays true: the page must not scroll to fit it.
  const scroll = await page.evaluate(
    () => document.documentElement.scrollHeight - document.documentElement.clientHeight)
  expect(scroll).toBeLessThanOrEqual(1)
})
