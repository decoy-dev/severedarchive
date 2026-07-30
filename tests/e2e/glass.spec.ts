import { test, expect } from '@playwright/test'

test('terminal window is glass on full tier, opaque on lite', async ({ page, viewport }) => {
  await page.goto('./')
  await expect(page.locator('.stage')).toHaveAttribute('data-booted', 'true', { timeout: 6000 })
  const bf = await page.locator('.terminal-window').evaluate((el) => getComputedStyle(el).backdropFilter)
  if (viewport!.width < 480) {
    expect(bf).toBe('none') // lite tier: no backdrop-filter anywhere
  } else {
    expect(bf).toContain('blur(18px)')
    expect(bf).toContain('saturate(1.6)')
    const bg = await page.locator('.terminal-window').evaluate((el) => getComputedStyle(el).backgroundColor)
    expect(bg).toContain('0.5') // translucent fill, not the old 0.78 panel
  }
})
