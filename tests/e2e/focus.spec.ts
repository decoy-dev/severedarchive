import { test, expect, type Page } from '@playwright/test'

/**
 * Window focus and playback tiers.
 *
 * This file used to cover the grid's focus-to-stage zoom and its SND toggle.
 * Both were deleted with the focus stage itself, so those tests were asserting
 * against markup that no longer exists. What survives is the behaviour they were
 * really about — one full-res source, audio only where focus is, everything else
 * a muted thumb under the degradation overlay — restated against windows.
 */

test.describe('window focus and playback tiers', () => {
  test.skip(({ viewport }) => viewport!.width < 861, 'windows are desktop-only')

  const boot = async (page: Page) => {
    await page.goto('./')
    await expect(page.locator('.stage')).toHaveAttribute('data-booted', 'true', { timeout: 6000 })
  }

  const openRow = async (page: Page, i: number) => {
    await page.locator('[data-file-row]').nth(i).click()
    await page.waitForTimeout(700)   // the move beat is 520ms
  }

  /** Every invariant §5 asks to hold at every step, in one call. */
  const invariants = async (page: Page) =>
    page.evaluate(() => {
      const vids = [...document.querySelectorAll('video')]
      return {
        fullCount: vids.filter((v) => (v.getAttribute('src') ?? '').includes('_full')).length,
        unpaused: vids.filter((v) => !v.paused).length,
        bodies: [...document.querySelectorAll('[data-file-window]')].map((w) => {
          const inside = w.querySelectorAll('.fw-body video')
          return {
            id: w.getAttribute('data-file-window'),
            count: inside.length,
            host: inside[0]?.closest('.media-host')?.getAttribute('data-media-host') ?? null,
          }
        }),
      }
    })

  const expectInvariants = async (page: Page, ids: string[]) => {
    const s = await invariants(page)
    expect(s.fullCount, 'exactly one _full source').toBe(1)
    expect(s.unpaused, 'decode ceiling').toBeLessThanOrEqual(5)
    expect(s.bodies.map((b) => b.id).sort()).toEqual([...ids].sort())
    for (const b of s.bodies) {
      expect(b.count, `${b.id} body holds exactly one video`).toBe(1)
      expect(b.host, `${b.id} body holds its OWN file`).toBe(b.id)
    }
  }

  // §5's one proving test.
  test('three windows, focus each in turn, close the middle one', async ({ page }) => {
    await boot(page)

    await openRow(page, 0)
    await expectInvariants(page, ['file01'])
    await openRow(page, 1)
    await expectInvariants(page, ['file01', 'file02'])
    await openRow(page, 2)
    await expectInvariants(page, ['file01', 'file02', 'file03'])

    // Focus each in turn through the row, not the title bar: raising one window
    // covers the next one's uncovered sliver, and the row is deliberately placed
    // clear of the cascade. Activating an already-open file focuses it.
    for (const [i, id] of ['file01', 'file02', 'file03'].entries()) {
      await page.locator('[data-file-row]').nth(i).click()
      await page.waitForTimeout(500)
      await expect(page.locator(`[data-file-window="${id}"]`)).toHaveAttribute('data-focused', 'true')
      await expect(page.locator(`[data-file-window="${id}"] video`)).toHaveAttribute('src', /_full\.mp4/)
      await expectInvariants(page, ['file01', 'file02', 'file03'])
    }

    // close the middle one. Its node is either adopted by the preview pane (only
    // if it is the selected file) or released — never left with a stale source.
    await page.locator('[data-file-window="file02"] .fw-close').click()
    await page.waitForTimeout(600)
    await expect(page.locator('[data-file-window]')).toHaveCount(2)
    await expectInvariants(page, ['file01', 'file03'])

    const closed = await page.evaluate(() => {
      const host = document.querySelector('[data-media-host="file02"]')
      if (!host) return { gone: true, inPreview: false, src: null as string | null }
      return {
        gone: false,
        inPreview: !!host.closest('[data-preview-slot]'),
        src: host.querySelector('video')?.getAttribute('src') ?? null,
      }
    })
    expect(closed.gone || closed.inPreview || closed.src === null).toBe(true)
  })

  // This used to hover first, so that opening had to carry an already-playing
  // element across the reparent. The explorer pane holds no media any more —
  // nothing decodes until a window opens — so the premise is gone and what is
  // left is the part that still has to hold: the window plays the full encode,
  // and it keeps playing.
  test('the focused window plays the full encode and keeps playing', async ({ page }) => {
    await boot(page)
    await openRow(page, 0)
    const video = page.locator('[data-file-window="file01"] video')
    await expect(video).toHaveAttribute('src', /file01_full\.mp4/)
    await expect
      .poll(async () => video.evaluate((v: HTMLVideoElement) => !v.paused && v.currentTime > 0), { timeout: 6000 })
      .toBe(true)

    const first = await video.evaluate((v: HTMLVideoElement) => v.currentTime)
    await page.waitForTimeout(600)
    const second = await video.evaluate((v: HTMLVideoElement) => v.currentTime)
    expect(second, 'playback advances after the move').toBeGreaterThan(first)
  })

  test('no inline transform survives the move beat', async ({ page }) => {
    await boot(page)
    await page.locator('[data-file-row]').nth(0).hover()
    await page.waitForTimeout(600)
    await page.locator('[data-file-row]').nth(0).click()
    await page.waitForTimeout(900)   // MOVE_MS is 520
    const residue = await page.evaluate(() =>
      [...document.querySelectorAll('.media-host')].map((h) => (h as HTMLElement).style.transform))
    expect(residue.every((t) => t === '')).toBe(true)
  })

  test('unfocused windows are muted thumbs under the overlay; the focused one is not', async ({ page }) => {
    await boot(page)
    await openRow(page, 0)
    await openRow(page, 1)

    const read = (id: string) => page.evaluate((sel) => {
      const win = document.querySelector(`[data-file-window="${sel}"]`)!
      const body = win.querySelector('.fw-body')!
      const v = body.querySelector('video') as HTMLVideoElement
      return {
        focused: win.getAttribute('data-focused'),
        src: v.getAttribute('src'),
        muted: v.muted,
        overlay: Number(getComputedStyle(body, '::after').opacity),
      }
    }, id)

    const back = await read('file01')
    expect(back.focused).toBe('false')
    expect(back.src).toMatch(/_thumb\.mp4/)
    expect(back.muted).toBe(true)
    expect(back.overlay, 'unfocused window carries the degradation overlay').toBe(1)

    const front = await read('file02')
    expect(front.focused).toBe('true')
    expect(front.src).toMatch(/_full\.mp4/)
    expect(front.overlay, 'the focused window resolves — no overlay').toBe(0)

    // The explorer pane used to be checked here too, as a permanently-overlaid
    // 240p surface. It no longer shows media at all, so the window is the only
    // place the overlay has left to apply.
    await expect(page.locator('.preview-standby')).toBeVisible()
    await expect(page.locator('.explorer-preview video')).toHaveCount(0)
  })

  test('the focused window has audio available; losing focus silences it without forgetting the level', async ({ page }) => {
    await boot(page)
    await openRow(page, 0)
    const win = page.locator('[data-file-window="file01"]')
    await win.getByRole('button', { name: /^Volume \d+ percent$/ }).click()
    await win.locator('input[type="range"]').fill('60')
    await page.waitForTimeout(200)

    await expect(win.locator('.vol-readout')).toHaveText('060')
    const audible = await win.locator('video').evaluate((v: HTMLVideoElement) => ({ muted: v.muted, volume: v.volume }))
    expect(audible.muted).toBe(false)
    expect(audible.volume).toBeCloseTo(0.6, 2)

    // another window takes focus
    await openRow(page, 1)
    const silenced = await win.locator('video').evaluate((v: HTMLVideoElement) => ({ muted: v.muted, volume: v.volume }))
    expect(silenced.muted).toBe(true)
    expect(silenced.volume, 'the stored level is not discarded').toBeCloseTo(0.6, 2)
    await expect(win.locator('.vol-readout')).toHaveText('060')
  })
})
