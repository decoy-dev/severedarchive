import { test, expect } from '@playwright/test'
import { gotoGrid } from './helpers'

test('lite tier renders poster images and drops the glass-strip blur', async ({ page }) => {
  // reduced-motion must be emulated before the first page.goto so perfTier reads
  // lite on initial mount (perfTier is read once, via useState(readPerfTier)).
  await page.emulateMedia({ reducedMotion: 'reduce' })
  // grid cards (the assertions below) live behind the STACK/GRID toggle now.
  await gotoGrid(page)
  await expect(page.locator('.stage')).toHaveAttribute('data-tier', 'lite')

  // unfocused grid cards render <img> posters, not <video>, on lite
  const cardCount = await page.locator('[data-card]').count()
  const imgCount = await page.locator('.grid-cards img').count()
  expect(imgCount).toBe(cardCount)
  await expect(page.locator('.grid-cards video')).toHaveCount(0)

  // background layer is also a poster image, not a video
  await expect(page.locator('.bg-video img')).toBeVisible()
  await expect(page.locator('.bg-video video')).toHaveCount(0)

  // glass-strip drops the backdrop-filter blur in favor of a solid vignette
  const backdropFilter = await page
    .locator('.glass-strip')
    .first()
    .evaluate((el) => getComputedStyle(el).backdropFilter)
  expect(backdropFilter).toBe('none')

  // no video is playing while unfocused on lite
  const playing = await page.evaluate(
    () => [...document.querySelectorAll('video')].filter((v) => !v.paused).length,
  )
  expect(playing).toBe(0)
})
