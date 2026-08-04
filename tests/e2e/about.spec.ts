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

  test('the mark is centred between the copy and the panel edge', async ({ page }) => {
    await ready(page)
    await page.getByRole('tab', { name: 'ABOUT' }).click()
    await expect(page.locator('.ascii-object')).toHaveAttribute('data-state', /^(live|lite|static)$/, { timeout: 15000 })
    await page.waitForTimeout(600)

    // The CENTROID of the lit characters, weighted by how many there are — which
    // is the quantity that matters and the one four earlier attempts got wrong.
    // The bounding box is pushed around by sparse outliers where the rim light
    // catches an edge, far more than they push the eye.
    //
    // Averaged over samples, because the object sways ±0.52rad and any single
    // frame sits up to ~40px off centre by design.
    const offsets: number[] = []
    for (let i = 0; i < 12; i++) {
      offsets.push(await page.evaluate(() => {
        const table = document.querySelector('.ascii-object table')!
        const copy = document.querySelector('.about-copy')!.getBoundingClientRect()
        const panel = document.querySelector('.about-panel')!.getBoundingClientRect()
        const walk = document.createTreeWalker(table, NodeFilter.SHOW_TEXT)
        const range = document.createRange()
        let wx = 0, w = 0
        for (let n = walk.nextNode(); n; n = walk.nextNode()) {
          const text = (n as Text).data
          const a = text.search(/\S/)
          if (a === -1) continue
          const b = text.length - 1 - [...text].reverse().join('').search(/\S/)
          const ink = text.slice(a, b + 1).replace(/\s/g, '').length
          if (!ink) continue
          range.setStart(n, a); range.setEnd(n, b + 1)
          const r = range.getBoundingClientRect()
          wx += (r.left + r.right) / 2 * ink
          w += ink
        }
        return w ? wx / w - (copy.right + panel.right) / 2 : 0
      }))
      await page.waitForTimeout(220)
    }
    const mean = offsets.reduce((a, c) => a + c, 0) / offsets.length
    // Generous against the sway, tight enough to catch a real bias: the versions
    // this replaced sat 160px out.
    expect(Math.abs(mean), `mean offset ${mean.toFixed(1)}px`).toBeLessThan(24)
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
