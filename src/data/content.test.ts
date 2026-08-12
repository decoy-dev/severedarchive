import { describe, it, expect } from 'vitest'
import CONTENT_FILE from './content.json'
import { SITE_CONTENT } from './content'
import { parseContent } from '../lib/contentDraft'

/**
 * The link between the admin editor and the screen.
 *
 * This file exists because that link was missing and nothing caught it. The
 * Worker committed every ABOUT/LINKS edit, the deploy ran and succeeded, the
 * panel reported LIVE — and the site went on rendering the constants in
 * `content.ts`, because nothing imported `content.json`. Every test passed
 * throughout: they covered the editor's parsing and the Worker's commit, and
 * neither one knows whether anybody reads the result.
 *
 * So these assert the seam rather than either side of it.
 */
describe('SITE_CONTENT', () => {
  it('renders what content.json says, not the seed', () => {
    const file = parseContent(JSON.stringify(CONTENT_FILE))
    // If this fails, the committed file is a shape the editor itself would
    // refuse — a different bug, and the fallback below is doing its job.
    expect(file).not.toBeNull()
    expect(SITE_CONTENT.about).toEqual(file!.about)
    expect(SITE_CONTENT.links).toEqual(file!.links)
  })

  it('carries no bookkeeping into what the site renders', () => {
    // `rest` is the editor's round-trip store. It reaching here would also
    // reach `AdminPanel`'s seed, which stringifies SITE_CONTENT back into
    // content.json — a junk key that writes itself into the file on next save.
    expect(Object.keys(SITE_CONTENT).sort()).toEqual(['about', 'links'])
  })
})
