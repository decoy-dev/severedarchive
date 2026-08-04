import { test, expect } from '@playwright/test'
import { ready } from './helpers'

test.describe('desktop explorer', () => {
  test.skip(({ viewport }) => viewport!.width < 861, 'the explorer is the desktop surface')

  test('the list is a two-column thumbnail view', async ({ page }) => {
    await ready(page)
    const rows = page.locator('[data-file-row]')
    await expect(rows).toHaveCount(12)
    // Every tile carries its own poster; the name is still there beneath it.
    await expect(page.locator('[data-file-row] .explorer-thumb img')).toHaveCount(12)
    await expect(rows.first()).toContainText('CHROME_SEQ')
    // A media-kind glyph leads the name where the 001/002 index used to. It is
    // decorative, so it must not be in the accessible name — the row already
    // says CHROME_SEQ.MP4.
    await expect(page.locator('[data-file-row] .kind-icon')).toHaveCount(12)
    await expect(rows.first()).not.toContainText('001')

    // Two columns, asserted by geometry rather than by reading the CSS back:
    // the first two tiles share a row, the third starts a new one.
    const box = async (i: number) => (await rows.nth(i).boundingBox())!
    const [a, b, c] = [await box(0), await box(1), await box(2)]
    expect(Math.abs(a.y - b.y)).toBeLessThanOrEqual(1)
    expect(b.x).toBeGreaterThan(a.x)
    expect(c.y).toBeGreaterThan(a.y)
    expect(Math.abs(c.x - a.x)).toBeLessThanOrEqual(1)
  })

  test('nothing plays until a file is opened', async ({ page }) => {
    await ready(page)
    await expect(page.locator('[data-preview-standby]')).toBeVisible()
    await expect(page.locator('.preview-standby')).toContainText('AWAITING SELECTION')

    // Hover is selection only. It must not start a decode anywhere in the pane.
    await page.locator('[data-file-row]').nth(4).hover()
    await page.waitForTimeout(700)
    await expect(page.locator('.explorer-preview video')).toHaveCount(0)
    // The metadata readout still follows the hover.
    await expect(page.locator('.preview-meta-head')).toContainText('COLD_BLOOM')

    // …and opening is what starts playback.
    await page.locator('[data-file-row]').nth(4).click()
    await expect(page.locator('[data-file-window="file05"] video')).toHaveAttribute('src', /file05_full\.mp4$/)
  })

  test('the standby pane becomes a dashboard of the open windows', async ({ page }) => {
    await ready(page)
    await expect(page.locator('[data-preview-standby]')).toBeVisible()
    await expect(page.locator('[data-window-dash]')).toHaveCount(0)

    await page.locator('[data-file-row]').nth(0).click()
    await page.locator('[data-file-row]').nth(1).click()

    // The prompt is gone and the readout took the pane.
    const dash = page.locator('[data-window-dash]')
    await expect(dash).toBeVisible()
    await expect(page.locator('[data-preview-standby]')).toHaveCount(0)
    await expect(dash).toContainText('2 / 3')

    // One card per window, most recently raised first, carrying the window's
    // details rather than just the file's name.
    const rows = page.locator('[data-dash-row]')
    await expect(rows).toHaveCount(2)
    await expect(rows.nth(0)).toHaveAttribute('data-dash-row', 'file02')
    await expect(rows.nth(0)).toHaveClass(/is-focused/)
    await expect(rows.nth(0)).toContainText('HALO_DRIFT')
    await expect(rows.nth(0)).toContainText('SLOT')
    await expect(rows.nth(0)).toContainText('VOL')
    // Still a readout: no media decodes in this pane.
    await expect(page.locator('.explorer-preview video')).toHaveCount(0)

    // A card raises its window, and the readout re-orders to match. The bottom
    // card is the one whose centre is below the cascade; the covered ones are
    // reached at their ✕ column, which the next test is about.
    await page.locator('[data-dash-row="file01"] .dash-row-main').click()
    await expect(page.locator('[data-file-window="file01"]')).toHaveAttribute('data-focused', 'true')
    await expect(rows.nth(0)).toHaveAttribute('data-dash-row', 'file01')

    // The card's ✕ closes that window, and the box reverts once none are left.
    await page.locator('[data-dash-row="file01"] .dash-close').click()
    await expect(page.locator('[data-file-window]')).toHaveCount(1)
    await expect(rows).toHaveCount(1)
    await page.locator('[data-dash-row="file02"] .dash-close').click()
    await expect(page.locator('[data-window-dash]')).toHaveCount(0)
    await expect(page.locator('[data-preview-standby]')).toBeVisible()
  })

  test('the dashboard brings itself up the first time, and only the first time', async ({ page }) => {
    await ready(page)
    await page.locator('[data-file-row]').nth(0).click()

    // The panel initializes before it reports: a log, then the cards.
    await expect(page.locator('[data-dash-phase="init"]')).toBeVisible()
    await expect(page.locator('[data-dash-row]')).toHaveCount(0)
    await expect(page.locator('[data-window-dash]')).toContainText('WINDOW MANAGER ONLINE')

    const dash = page.locator('[data-dash-phase="ready"]')
    await expect(dash).toBeVisible({ timeout: 6000 })
    await expect(page.locator('[data-dash-row]')).toHaveCount(1)

    // Opening a second window joins the live readout — it does not re-run the
    // bring-up. Nor does closing everything and starting again.
    await page.locator('[data-file-row]').nth(1).click()
    await expect(page.locator('[data-dash-row]')).toHaveCount(2)
    await expect(page.locator('[data-dash-phase="init"]')).toHaveCount(0)

    await page.locator('[data-dash-row="file01"] .dash-close').click()
    await page.locator('[data-dash-row="file02"] .dash-close').click()
    await expect(page.locator('[data-preview-standby]')).toBeVisible()
    await page.locator('[data-file-row]').nth(3).click()
    await expect(page.locator('[data-dash-phase="init"]')).toHaveCount(0)
    await expect(page.locator('[data-dash-row]')).toHaveCount(1)
  })

  test('closing the last window powers the dashboard down before standby', async ({ page }) => {
    await ready(page)
    await page.locator('[data-file-row]').nth(0).click()
    await expect(page.locator('[data-dash-phase="ready"]')).toBeVisible({ timeout: 6000 })

    await page.locator('[data-dash-row="file01"] .dash-close').click()
    // The window goes at once; the panel takes its leave.
    await expect(page.locator('[data-file-window]')).toHaveCount(0)
    await expect(page.locator('[data-dash-phase="down"]')).toBeVisible()
    await expect(page.locator('[data-window-dash]')).toContainText('RELEASING MEDIA NODES')
    await expect(page.locator('[data-preview-standby]')).toBeVisible({ timeout: 5000 })

    // Reopening during the sequence is a cancel, not a queue: the panel comes
    // straight back to the readout rather than finishing its shutdown first.
    await page.locator('[data-file-row]').nth(1).click()
    await expect(page.locator('[data-dash-phase="ready"]')).toBeVisible()
    await page.locator('[data-dash-row="file02"] .dash-close').click()
    await expect(page.locator('[data-dash-phase="down"]')).toBeVisible()
    await page.locator('[data-file-row]').nth(2).click()
    await expect(page.locator('[data-dash-phase="ready"]')).toBeVisible()
    await expect(page.locator('[data-dash-row]')).toHaveCount(1)
  })

  test('the readout is live: position tracks a drag, the clock ticks', async ({ page }) => {
    await ready(page)
    await page.locator('[data-file-row]').nth(0).click()
    await expect(page.locator('[data-dash-phase="ready"]')).toBeVisible({ timeout: 6000 })

    const cell = (key: number) => page.locator('[data-dash-row="file01"] .dash-grid.is-live .dash-stat').nth(key)
    const pos = cell(0)
    await expect(pos).toContainText('POS')

    // The clock is re-read every frame, not on a state change.
    const t1 = await cell(2).innerText()
    await page.waitForTimeout(700)
    expect(await cell(2).innerText()).not.toBe(t1)

    // anime moves the window by transform and never tells React, so POS can
    // only be right if it is sampled from the live node — which is the point.
    const before = await pos.innerText()
    const bar = (await page.locator('[data-file-window="file01"] .fw-title').boundingBox())!
    await page.mouse.move(bar.x + bar.width / 2, bar.y + bar.height / 2)
    await page.mouse.down()
    await page.mouse.move(bar.x + bar.width / 2 + 120, bar.y + bar.height / 2 + 60, { steps: 10 })
    const during = await pos.innerText()
    await page.mouse.up()
    expect(during).not.toBe(before)
  })

  test('every card can be closed with the buffer full', async ({ page }) => {
    await ready(page)
    // The dashboard fills the box, and the box is under the cascade — so most
    // of a card spends its life beneath a window. The ✕ column is the part that
    // may not: it leads the card, left of where windows start, which is what
    // keeps the readout operable in the case it exists for. Hit-tested rather
    // than measured, so a future overlay that covers the column without moving
    // it still fails here.
    for (const i of [0, 1, 2]) await page.locator('[data-file-row]').nth(i).click()
    await expect(page.locator('[data-dash-row]')).toHaveCount(3)

    for (const id of ['file01', 'file02', 'file03']) {
      const b = (await page.locator(`[data-dash-row="${id}"] .dash-close`).boundingBox())!
      const reachable = await page.evaluate(
        ([x, y]) => document.elementFromPoint(x, y)?.classList.contains('dash-close') ?? false,
        [b.x + b.width / 2, b.y + b.height / 2],
      )
      expect(reachable, `${id}'s ✕ is covered by a window`).toBe(true)
    }

    // And it is a real control, not just an exposed rectangle: close the two
    // that the cascade covers, from the top of the stack down.
    await page.locator('[data-dash-row="file03"] .dash-close').click()
    await expect(page.locator('[data-dash-row]')).toHaveCount(2)
    await page.locator('[data-dash-row="file02"] .dash-close').click()
    await expect(page.locator('[data-dash-row]')).toHaveCount(1)
    await expect(page.locator('[data-file-window]')).toHaveCount(1)
  })

  test('the close control is a real pointer target', async ({ page }) => {
    await ready(page)
    await page.locator('[data-file-row]').nth(0).click()
    const close = page.locator('.fw-close').first()
    const box = (await close.boundingBox())!
    // It was a ~10px glyph sitting on a drag handle, so a slightly-off click
    // grabbed the window instead of closing it.
    expect(box.width).toBeGreaterThanOrEqual(32)
    expect(box.height).toBeGreaterThanOrEqual(32)

    // And it still closes when clicked at its edge rather than dead centre.
    await page.mouse.click(box.x + 4, box.y + box.height - 4)
    await expect(page.locator('[data-file-window]')).toHaveCount(0)
  })

  test('a press that drifts still closes, focused or not, first time', async ({ page }) => {
    await ready(page)
    // Nobody clicks perfectly still. The ✕ used to sit inside the drag handle,
    // so a press that moved 3px became a drag: anime took pointer capture and
    // the click went to the capture target instead of the button. The window
    // just sat there. Both windows are exercised because the unfocused one was
    // worse — its press also raised the window, re-rendering under the pointer.
    await page.locator('[data-file-row]').nth(0).click()
    await page.locator('[data-file-row]').nth(1).click()
    await expect(page.locator('[data-file-window]')).toHaveCount(2)

    const drift = async (id: string) => {
      const b = (await page.locator(`[data-file-window="${id}"] .fw-close`).boundingBox())!
      const x = b.x + b.width / 2
      const y = b.y + b.height / 2
      await page.mouse.move(x, y)
      await page.mouse.down()
      await page.mouse.move(x + 4, y + 3, { steps: 4 })
      await page.mouse.up()
    }

    await drift('file01') // the unfocused one
    await expect(page.locator('[data-file-window]')).toHaveCount(1)
    await drift('file02') // and the focused one
    await expect(page.locator('[data-file-window]')).toHaveCount(0)
  })
})
