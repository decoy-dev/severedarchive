import { test, expect } from '@playwright/test'
import { ready } from './helpers'
import { expectAboutCopy } from './aboutCopy'

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

  test('the mark is centred between the copy and the panel edge', async ({ page, viewport }) => {
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
    // The band is measured from the copy's VISIBLE edge — the right edge of its
    // widest block — not from its grid track.
    //
    // This test asserted the track edge and passed while the mark sat ~195px
    // right of where it belonged, because the code being tested made the same
    // mistake. `.panel-block` is `max-width: 560px`, so at 2000px wide the track
    // ends at 1055px and the blocks end at 664px. Two measurements agreeing is
    // not evidence when both read the same wrong number.
    const band = await page.evaluate(() => {
      const copy = document.querySelector('.about-copy')!
      const panel = document.querySelector('.about-panel')!
      const track = copy.getBoundingClientRect()
      const p = panel.getBoundingClientRect()
      const pad = parseFloat(getComputedStyle(panel).paddingRight) || 0
      const blocks = Math.min(
        Math.max(...[...copy.children].map((k) => k.getBoundingClientRect().right)),
        track.right,
      )
      const host = document.querySelector('.ascii-object')!.getBoundingClientRect()
      // Beside the copy, or below it? Below the split the panel is one column and
      // the copy spans the full width, so its right edge IS the panel's — the
      // band is then the object's own box. Same decision as `inkBand`.
      const beside = blocks <= host.x + 1 && track.bottom > host.y + 1
      return {
        beside, blocks, trackRight: track.right, panelRight: p.right - pad,
        hostLeft: host.x, hostRight: host.right,
      }
    })

    // Whether the two candidate bands are even distinguishable here. They are
    // only when the copy's blocks are narrower than their track, which needs the
    // track to be wider than `.panel-block`'s 560px cap — true on a desktop
    // viewport, not on a tablet, where the blocks fill the track and both
    // measurements are the same number.
    const distinguishable = band.beside && band.trackRight - band.blocks > 60
    if (viewport!.width >= 1440) {
      // At this width the discrepancy is what the test exists to catch, so its
      // absence is a broken fixture rather than a passing case.
      expect(distinguishable, 'the copy should be narrower than its track at this width').toBe(true)
    }

    // The CENTROID of the lit characters, weighted by how many there are — which
    // is the quantity that matters and the one four earlier attempts got wrong.
    // The bounding box is pushed around by sparse outliers where the rim light
    // catches an edge, far more than they push the eye.
    //
    // Averaged over samples, because the object sways ±0.52rad and any single
    // frame sits up to ~40px off centre by design.
    const inkCentre = async () => page.evaluate(() => {
      const table = document.querySelector('.ascii-object table')!
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
      return w ? wx / w : 0
    })

    const centres: number[] = []
    for (let i = 0; i < 12; i++) {
      centres.push(await inkCentre())
      await page.waitForTimeout(220)
    }
    const mean = centres.reduce((a, c) => a + c, 0) / centres.length

    const centre = band.beside
      ? (band.blocks + band.panelRight) / 2
      : (band.hostLeft + band.hostRight) / 2
    const visible = mean - centre
    // Generous against the sway, tight enough to catch a real bias: the versions
    // this replaced sat 160px out.
    expect(Math.abs(visible), `mean offset from the visible band ${visible.toFixed(1)}px`).toBeLessThan(24)

    if (distinguishable) {
      // And explicitly NOT centred on the track — the failure this test missed
      // for five rounds. If someone reinstates the old band, this says so.
      const track = mean - (band.trackRight + band.panelRight) / 2
      expect(Math.abs(track), `centred on the track edge again (${track.toFixed(1)}px)`).toBeGreaterThan(24)
    }
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
  await expectAboutCopy(page)

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
