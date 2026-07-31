import { describe, it, expect } from 'vitest'

/**
 * Binding rule from the ownership contract: a media element is never found by
 * DOM shape, only by fileId through mediaController.
 *
 * `document.querySelector('[data-preview-video]')` returns whichever preview
 * happens to exist, not the file that was clicked — so opening from the grid, or
 * opening with the keyboard after the hover has moved on, adopts the wrong
 * file's node. Two call sites in FileWindow did exactly that, one of them
 * silently defaulting to 16:9 when it found nothing.
 *
 * A review-level check is what the contract asks for; this is the executable
 * version of it. Sources are read through Vite's glob rather than node:fs so the
 * app's tsconfig (which carries no node types) still type-checks it.
 */
const modules = import.meta.glob('./*.{ts,tsx}', { query: '?raw', import: 'default', eager: true })

const sources = Object.entries(modules)
  .filter(([path]) => !/\.test\.tsx?$/.test(path))
  .map(([path, src]) => [path, String(src)] as const)

/** Comments discuss the banned pattern by name; only real code counts. */
const stripComments = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')

describe('src/components media lookups', () => {
  it('finds the components to check', () => {
    expect(sources.length).toBeGreaterThan(5)
  })

  it('never reaches for the document to find an element', () => {
    for (const [file, raw] of sources) {
      expect(stripComments(raw), `${file} uses document.querySelector`).not.toMatch(/document\s*\.\s*querySelector/)
    }
  })

  it('never looks up a media element by shape', () => {
    for (const [file, raw] of sources) {
      const code = stripComments(raw)
      expect(code, `${file} looks up a <video> by selector`)
        .not.toMatch(/querySelector(All)?\s*(<[^>]*>)?\s*\(\s*['"`][^'"`]*video/i)
      expect(code, `${file} looks up a preview video by attribute`).not.toMatch(/data-preview-video/)
    }
  })
})
