import { test, expect } from '@playwright/test'
import { ready } from './helpers'

test('stack is the default archive view; front video plays full-res', async ({ page }) => {
  await ready(page)
  await expect(page.locator('.archive-stack')).toHaveAttribute('data-front', 'file03') // draft default front
  const v = page.locator('[data-stack-front] video')
  await expect(v).toHaveAttribute('src', /file03_full\.mp4/)
  await expect
    .poll(async () => v.evaluate((el: HTMLVideoElement) => !el.paused && el.currentTime > 0), { timeout: 5000 })
    .toBe(true)
})

test('right-edge hover fans the slivers; clicking one brings it to front and the backdrop follows', async ({ page, viewport }) => {
  test.skip(viewport!.width <= 640, 'hover fan is desktop/tablet')
  await ready(page)
  await page.locator('.stack-fan-zone').hover()
  await expect(page.locator('.archive-stack')).toHaveAttribute('data-fanned', 'true')
  await page.locator('button[data-sliver][data-file-id="file05"]').click()
  await expect(page.locator('.archive-stack')).toHaveAttribute('data-front', 'file05')
  await expect(page.locator('[data-stack-front] video')).toHaveAttribute('src', /file05_full\.mp4/)
  await expect(page.locator('.bg-video video').last()).toHaveAttribute('src', /file05_thumb\.mp4/, { timeout: 3000 })
})

test('toggle switches to grid and persists across reload', async ({ page }) => {
  await ready(page)
  await page.getByRole('button', { name: 'Grid view' }).click()
  await expect(page.locator('[data-card]').first()).toBeVisible()
  await page.reload()
  await expect(page.locator('.stage')).toHaveAttribute('data-booted', 'true', { timeout: 6000 })
  const ack = page.getByRole('button', { name: 'Acknowledge' })
  if (await ack.count()) await ack.click()
  await expect(page.locator('[data-card]').first()).toBeVisible()
  await expect(page.locator('.archive-stack')).toHaveCount(0)
})

test('no scroll in stack view, fanned or not', async ({ page }) => {
  await ready(page)
  // fan-zone only exists on hover-capable viewports; short timeout so touch projects skip fast
  await page.locator('.stack-fan-zone').hover({ timeout: 1500 }).catch(() => {})
  const scroll = await page.evaluate(() => ({
    doc: document.documentElement.scrollHeight - document.documentElement.clientHeight,
    body: document.body.scrollHeight - document.body.clientHeight,
  }))
  expect(scroll.doc).toBeLessThanOrEqual(1)
  expect(scroll.body).toBeLessThanOrEqual(1)
})
