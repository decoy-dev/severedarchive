import { test, expect, type Page, type Route } from '@playwright/test'

/**
 * The owner's tools: logging in, and what that unlocks on an existing entry.
 *
 * The backend is a Cloudflare Worker, so it is routed rather than run. That is
 * the point of these tests — the Worker's own rules have unit tests in
 * `server/`, and what cannot be checked there is whether the interface offers
 * the right controls to the right person and sends what it claims to send. Every
 * assertion here is about the page.
 *
 * The passcode is whatever the fake accepts. Nothing real is involved.
 */
test.describe('admin tools', () => {
  test.skip(({ viewport }) => viewport!.width < 861, 'the admin footer is desktop-only')

  /** What the browser sent, so the tests can assert on the request, not just the UI. */
  type Seen = {
    method: string; url: string; fields: Record<string, string>
    hasFile: boolean; hasThumbImage?: boolean
  }

  /** A 10x10 PNG, small enough to inline and real enough for the browser to decode. */
  const PNG = Buffer.from(
    '89504e470d0a1a0a0000000d494844520000000a0000000a08060000008d32cfbd' +
    '0000001849444154789c63fccf801f30fe0762206a01006f4f04f70000000049454e44ae426082',
    'hex',
  )

  const stubBackend = async (page: Page, seen: Seen[]) => {
    await page.route('**/api/session', async (route: Route) => {
      if (route.request().method() === 'DELETE') {
        seen.push({ method: 'DELETE', url: 'session', fields: {}, hasFile: false })
        return route.fulfill({ status: 200, body: '{"ok":true}' })
      }
      const ok = (route.request().postData() ?? '').includes('open-sesame')
      return route.fulfill({ status: ok ? 200 : 401, body: '{}' })
    })
    await page.route('**/api/content', (route) => route.fulfill({ status: 200, body: '{"content":null,"sha":null}' }))
    await page.route('**/api/entry/**', async (route: Route) => {
      const req = route.request()
      const body = req.postData() ?? ''
      if (req.method() === 'DELETE') {
        const parsed = JSON.parse(body || '{}')
        seen.push({ method: 'DELETE', url: req.url(), fields: parsed, hasFile: false })
        const match = String(parsed.confirm ?? '').trim().toUpperCase() === String(parsed.name ?? '').toUpperCase()
        return route.fulfill({
          status: match ? 202 : 422,
          body: JSON.stringify(match ? { ok: true } : { details: ['type the name to confirm'] }),
        })
      }
      // Multipart, read out of the raw body: enough to prove which fields and
      // whether a file rode along.
      const fields: Record<string, string> = {}
      for (const part of body.split(/------[^\r\n]*/)) {
        const m = /name="([^"]+)"(?:; filename="[^"]*")?\r?\n(?:[^\r\n]*\r?\n)*\r?\n([\s\S]*?)\r?\n?$/.exec(part)
        if (m) fields[m[1]] = m[2]
      }
      seen.push({
        method: 'POST', url: req.url(), fields,
        hasFile: body.includes('name="file"'),
        hasThumbImage: body.includes('name="thumbImage"'),
      })
      return route.fulfill({ status: 202, body: JSON.stringify({ ok: true, replaced: body.includes('name="file"') }) })
    })
  }

  const boot = async (page: Page, seen: Seen[]) => {
    await stubBackend(page, seen)
    await page.goto('./')
    await expect(page.locator('.stage')).toHaveAttribute('data-booted', 'true', { timeout: 6000 })
  }

  const signIn = async (page: Page) => {
    await page.locator('.admin-open').click()
    await page.locator('#admin-passcode').fill('open-sesame')
    await page.locator('.admin-go').click()
    await expect(page.locator('.admin-panel')).toBeVisible()
    // The publish panel opens on success; closing it must not sign out.
    await page.locator('.admin-panel .admin-close').click()
    await expect(page.locator('.admin-panel')).toHaveCount(0)
  }

  const openWindow = async (page: Page) => {
    await page.locator('[data-file-row]').first().click()
    await page.waitForTimeout(700)
    await expect(page.locator('[data-file-window]')).toHaveCount(1)
  }

  test('EDIT appears only once signed in, and goes away again', async ({ page }) => {
    const seen: Seen[] = []
    await boot(page, seen)
    await openWindow(page)
    // The controls are gated on the interface's knowledge of a session. The
    // endpoints check the cookie themselves — this is about not offering a
    // control that could only fail.
    await expect(page.locator('.fw-edit')).toHaveCount(0)

    await signIn(page)
    await expect(page.locator('.fw-edit')).toHaveCount(1)

    await page.locator('.admin-signout').click()
    await expect(page.locator('.fw-edit')).toHaveCount(0)
    expect(seen.filter((s) => s.method === 'DELETE' && s.url === 'session')).toHaveLength(1)
  })

  test('a wrong passcode unlocks nothing', async ({ page }) => {
    const seen: Seen[] = []
    await boot(page, seen)
    await openWindow(page)
    await page.locator('.admin-open').click()
    await page.locator('#admin-passcode').fill('not-the-passcode')
    await page.locator('.admin-go').click()
    await expect(page.locator('.admin-result')).toContainText('REJECTED')
    await expect(page.locator('.fw-edit')).toHaveCount(0)
  })

  test('the editor opens pre-filled from the entry', async ({ page }) => {
    const seen: Seen[] = []
    await boot(page, seen)
    await openWindow(page)
    await signIn(page)

    const title = await page.locator('.fw-title').first().innerText()
    await page.locator('.fw-edit').first().click()
    const panel = page.locator('.admin-panel')
    await expect(panel.locator('.admin-subject')).toHaveText(title)
    // An editor that opens empty is a form that blanks what you do not retype.
    await expect(panel.locator('.admin-field').filter({ hasText: 'NAME' }).locator('input'))
      .toHaveValue(title.split('.')[0])
    await expect(panel.locator('.admin-field').filter({ hasText: 'TAGLINE' }).locator('input'))
      .not.toHaveValue('')
    await expect(panel.locator('input[type="date"]')).toHaveValue(/^\d{4}-\d{2}-\d{2}$/)
  })

  test('saving sends the edited fields and the entry it is editing', async ({ page }) => {
    const seen: Seen[] = []
    await boot(page, seen)
    await openWindow(page)
    await signIn(page)
    await page.locator('.fw-edit').first().click()
    const panel = page.locator('.admin-panel')

    await panel.locator('.admin-field').filter({ hasText: 'TAGLINE' }).locator('input').fill('EDITED TAGLINE')
    await panel.locator('textarea').fill('a note typed in the editor')
    await panel.locator('.admin-submit').click()
    await expect(panel.locator('.admin-status')).toContainText('SAVED')

    const post = seen.find((s) => s.method === 'POST')!
    expect(post.fields.tagline).toBe('EDITED TAGLINE')
    expect(post.fields.description).toBe('a note typed in the editor')
    // `currentName` is what lets the backend tell "renamed onto another entry"
    // from "unchanged" — without it no entry could ever be saved at all.
    expect(post.fields.currentName).toBeTruthy()
    expect(post.hasFile).toBe(false)
  })

  test('a replacement file rides along and is announced', async ({ page }) => {
    const seen: Seen[] = []
    await boot(page, seen)
    await openWindow(page)
    await signIn(page)
    await page.locator('.fw-edit').first().click()
    const panel = page.locator('.admin-panel')

    const field = panel.locator('.admin-field').filter({ hasText: 'REPLACE FILE' })
    await expect(field.locator('.admin-note')).toContainText('LEAVE EMPTY')
    await field.locator('input[type="file"]').setInputFiles({
      name: 'replacement.mp4', mimeType: 'video/mp4', buffer: Buffer.alloc(1024, 7),
    })
    // Overwriting the renditions is not obvious from a file picker, so it says so.
    await expect(field.locator('.admin-note')).toContainText('OVERWRITTEN')
    await expect(panel.locator('.admin-hint')).toContainText('SELECTED')

    await panel.locator('.admin-submit').click()
    await expect(panel.locator('.admin-status')).toContainText('TRANSCODE')
    expect(seen.find((s) => s.method === 'POST')!.hasFile).toBe(true)
  })

  test('the thumbnail editor scrubs the real clip and crops what it previews', async ({ page }) => {
    const seen: Seen[] = []
    await boot(page, seen)
    await openWindow(page)
    await signIn(page)
    await page.locator('.fw-edit').first().click()
    const panel = page.locator('.admin-panel')
    const editor = panel.locator('.thumb-editor')

    // The preview is the committed clip, not a still of it: that is what makes
    // the scrubber a preview rather than a slider with a number beside it.
    await expect(editor.locator('.thumb-frame video')).toHaveCount(1)
    await editor.locator('.thumb-slider input').first().fill('7.5')
    await expect.poll(async () =>
      Number(await editor.locator('.thumb-frame video').evaluate((v: HTMLVideoElement) => v.currentTime)),
    ).toBeGreaterThan(7)

    // Zoom is applied as the transform the pipeline's crop is derived from.
    await editor.locator('.thumb-slider input').nth(1).fill('2.4')
    await expect(editor.locator('.thumb-media')).toHaveAttribute('style', /scale\(2\.4\)/)

    // Dragging moves the focal point, and the transform-origin follows it — the
    // two must agree, because the origin is what the committed crop is computed
    // from.
    const frame = (await editor.locator('.thumb-frame').boundingBox())!
    await page.mouse.move(frame.x + frame.width / 2, frame.y + frame.height / 2)
    await page.mouse.down()
    await page.mouse.move(frame.x + frame.width / 2 - 80, frame.y + frame.height / 2 - 50, { steps: 10 })
    await page.mouse.up()
    const style = await editor.locator('.thumb-media').getAttribute('style')
    const origin = /transform-origin: ([\d.]+)% ([\d.]+)%/.exec(style ?? '')
    expect(origin, `no transform-origin in ${style}`).not.toBeNull()
    expect(Number(origin![1])).toBeGreaterThan(50)
    await expect(editor.locator('.thumb-readout')).toContainText(`FOCUS ${Math.round(Number(origin![1]))}%`)

    // And it is what gets sent.
    await panel.locator('.admin-submit').click()
    await expect(panel.locator('.admin-status')).toContainText('SAVED')
    const thumb = JSON.parse(seen.find((s) => s.method === 'POST')!.fields.thumb)
    expect(thumb.zoom).toBeCloseTo(2.4, 2)
    expect(thumb.time).toBeCloseTo(7.5, 2)
    expect(thumb.cx).toBeGreaterThan(0.5)
    expect(thumb.custom).toBe(false)
  })

  test('dragging does nothing until there is something to crop', async ({ page }) => {
    const seen: Seen[] = []
    await boot(page, seen)
    await openWindow(page)
    await signIn(page)
    await page.locator('.fw-edit').first().click()
    const editor = page.locator('.admin-panel .thumb-editor')

    // At zoom 1 the whole frame is the crop, so there is no slack to pan into.
    // Dragging must be inert rather than fighting a clamp.
    await expect(editor.locator('.thumb-readout')).toContainText('ZOOM IN TO REPOSITION')
    const frame = (await editor.locator('.thumb-frame').boundingBox())!
    await page.mouse.move(frame.x + frame.width / 2, frame.y + frame.height / 2)
    await page.mouse.down()
    await page.mouse.move(frame.x + 10, frame.y + 10, { steps: 6 })
    await page.mouse.up()
    await expect(editor.locator('.thumb-readout')).toContainText('FOCUS 50% · 50%')
  })

  test('a supplied still replaces the frame grab, and reset undoes it', async ({ page }) => {
    const seen: Seen[] = []
    await boot(page, seen)
    await openWindow(page)
    await signIn(page)
    await page.locator('.fw-edit').first().click()
    const panel = page.locator('.admin-panel')
    const editor = panel.locator('.thumb-editor')

    await editor.locator('.thumb-pick input').setInputFiles({
      name: 'still.png', mimeType: 'image/png', buffer: PNG,
    })
    // The preview becomes the image, and scrubbing frames stops meaning anything.
    await expect(editor.locator('.thumb-frame img')).toHaveCount(1)
    await expect(editor.locator('.thumb-slider input').first()).toBeDisabled()
    await expect(editor.locator('.admin-note')).toContainText('COVER-FITTED')

    await panel.locator('.admin-submit').click()
    await expect(panel.locator('.admin-status')).toContainText('SAVED')
    const post = seen.find((s) => s.method === 'POST')!
    expect(JSON.parse(post.fields.thumb).custom).toBe(true)
    expect(post.fields.thumbImage !== undefined || post.hasThumbImage).toBeTruthy()

    // Reset goes back to a frame of the clip, and clears the picked image with it.
    await editor.locator('.thumb-reset').click()
    await expect(editor.locator('.thumb-frame video')).toHaveCount(1)
    await expect(editor.locator('.thumb-reset')).toBeDisabled()
  })

  test('removal cannot be pressed until the name is typed exactly', async ({ page }) => {
    const seen: Seen[] = []
    await boot(page, seen)
    await openWindow(page)
    await signIn(page)
    await page.locator('.fw-edit').first().click()
    const panel = page.locator('.admin-panel')
    const name = (await panel.locator('.admin-subject').innerText()).split('.')[0]

    await panel.locator('.admin-remove').click()
    const confirm = panel.locator('.admin-remove').last()
    const box = panel.locator('.admin-confirm input')

    await expect(confirm).toBeDisabled()
    await box.fill('SOMETHING_ELSE')
    await expect(confirm).toBeDisabled()
    // A near miss must not pass. `normaliseName` was used for this check first,
    // and it maps spaces to underscores and strips punctuation, so a string like
    // this confirmed the deletion.
    await box.fill(name.replace(/_/g, ' ') + '!')
    await expect(confirm).toBeDisabled()
    // Case is not the thing being confirmed.
    await box.fill(name.toLowerCase())
    await expect(confirm).toBeEnabled()

    await confirm.click()
    await expect(panel.locator('.admin-status')).toContainText('REMOVED')
    const del = seen.find((s) => s.method === 'DELETE' && s.url.includes('/api/entry/'))!
    expect(del.fields).toMatchObject({ name })
  })

  test('cancelling a removal leaves the entry alone', async ({ page }) => {
    const seen: Seen[] = []
    await boot(page, seen)
    await openWindow(page)
    await signIn(page)
    await page.locator('.fw-edit').first().click()
    const panel = page.locator('.admin-panel')
    await panel.locator('.admin-remove').click()
    await panel.locator('.admin-confirm input').fill('anything')
    await panel.locator('.admin-cancel').click()
    await expect(panel.locator('.admin-confirm')).toHaveCount(0)
    expect(seen.filter((s) => s.method === 'DELETE')).toHaveLength(0)
  })

  test('the editor is draggable and Escape closes it, not the window', async ({ page }) => {
    const seen: Seen[] = []
    await boot(page, seen)
    await openWindow(page)
    await signIn(page)
    await page.locator('.fw-edit').first().click()
    const panel = page.locator('.admin-panel')

    const before = (await panel.boundingBox())!
    await page.mouse.move(before.x + 200, before.y + 20)
    await page.mouse.down()
    await page.mouse.move(before.x + 340, before.y + 140, { steps: 12 })
    await page.mouse.up()
    const after = (await panel.boundingBox())!
    // It covers what it is editing; being able to shove it aside is the point.
    expect(Math.abs(after.x - before.x)).toBeGreaterThan(40)
    expect(Math.abs(after.y - before.y)).toBeGreaterThan(40)

    await page.keyboard.press('Escape')
    await expect(panel).toHaveCount(0)
    // The desktop's global Escape closes the focused window. Dismissing a dialog
    // must not also close the thing behind it.
    await expect(page.locator('[data-file-window]')).toHaveCount(1)
  })
})
