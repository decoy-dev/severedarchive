import { test, expect } from '@playwright/test'

test('tabs switch panels', async ({ page }) => {
  await page.goto('./')
  await expect(page.locator('.stage')).toHaveAttribute('data-booted', 'true', { timeout: 6000 })
  await page.getByRole('tab', { name: 'ABOUT' }).click()
  await expect(page.getByText('MOTION + VISUAL ART')).toBeVisible()
  await page.getByRole('tab', { name: 'LINKS' }).click()
  await expect(page.getByText('INSTAGRAM')).toBeVisible()
})

test('arrow keys switch tabs', async ({ page }) => {
  await page.goto('./')
  await expect(page.locator('.stage')).toHaveAttribute('data-booted', 'true', { timeout: 6000 })
  await page.keyboard.press('ArrowRight')
  await expect(page.getByText('MOTION + VISUAL ART')).toBeVisible()
  await page.keyboard.press('ArrowLeft')
  await expect(page.getByRole('tab', { name: 'ARCHIVE' })).toHaveAttribute('aria-selected', 'true')
})

test('background layer renders per tier: muted video (full) or poster image (lite)', async ({ page, viewport }) => {
  await page.goto('./')
  if (viewport!.width < 480) {
    // lite tier on small screens renders the poster <img>, not a <video>
    await expect(page.locator('.bg-video img')).toBeVisible()
  } else {
    const muted = await page.locator('.bg-video video').evaluate((v: HTMLVideoElement) => v.muted)
    expect(muted).toBe(true)
  }
})

test('the backdrop loop is a cross dissolve, never a fade to black', async ({ page }) => {
  await page.goto('./')
  await expect(page.locator('.stage')).toHaveAttribute('data-booted', 'true', { timeout: 6000 })
  await page.waitForTimeout(800)
  // Jump the backdrop into its tail and watch the handover. The point of the
  // assertion is the total light on screen: a dip toward zero would mean the
  // single layer was fading down with nothing behind it, which is the fade to
  // black this replaced.
  const samples = await page.evaluate(async () => {
    const layers = () => [...document.querySelectorAll('.bg-video video')] as HTMLVideoElement[]
    const first = layers()[0]
    if (!first || !Number.isFinite(first.duration)) return null
    const out: { count: number; light: number }[] = []
    first.currentTime = Math.max(0, first.duration - 1)
    for (let i = 0; i < 6; i++) {
      await new Promise((r) => setTimeout(r, 250))
      const vs = layers()
      out.push({
        count: vs.length,
        light: vs.reduce((s, v) => s + Number(getComputedStyle(v).opacity), 0),
      })
    }
    return out
  })

  if (samples === null) test.skip(true, 'backdrop metadata never arrived')
  // Two layers overlap at some point: the tail and the head are on screen together.
  expect(Math.max(...samples!.map((s) => s.count))).toBe(2)
  // And the screen never goes dark on the way through.
  expect(Math.min(...samples!.map((s) => s.light))).toBeGreaterThanOrEqual(0.95)
})
