import { test, expect } from '@playwright/test'
import { ready } from './helpers'
import { expectAboutCopy } from './aboutCopy'

/**
 * The ABOUT copy is the owner's and has no fixed length, so the panel scrolls
 * once the copy outgrows it. What this guards is the bug the owner hit on a
 * phone: the panel clipped with `overflow: hidden`, every block still rendered,
 * and the end of the ABOUT paragraph simply could not be reached.
 */
test('the last ABOUT block can be scrolled into view, and the page itself never scrolls', async ({ page }) => {
  await ready(page)
  await page.getByRole('tab', { name: 'ABOUT' }).click()
  await expectAboutCopy(page)

  const panel = page.locator('.about-panel')
  const last = page.locator('.about-copy .panel-block').last()
  // A user scroll, not an assignment to `scrollTop`: script can scroll an
  // `overflow: hidden` box too, so assigning it would pass on exactly the bug.
  const box = (await panel.boundingBox())!
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
  await page.mouse.wheel(0, 4000)
  await expect.poll(async () => {
    const [p, l] = await Promise.all([panel.boundingBox(), last.boundingBox()])
    return l!.y + l!.height - (p!.y + p!.height)
  }).toBeLessThanOrEqual(1)

  const scroll = await page.evaluate(() => ({
    y: document.documentElement.scrollHeight - document.documentElement.clientHeight,
    x: document.documentElement.scrollWidth - document.documentElement.clientWidth,
  }))
  expect(scroll.y).toBeLessThanOrEqual(1)
  expect(scroll.x).toBeLessThanOrEqual(1)
})
