import { describe, it, expect } from 'vitest'

/**
 * Selection contract rule 1, as an executable check.
 *
 * The navigation surfaces sit BELOW `Desktop` and must not depend on it. That
 * is why `Desktop` hands its opener up to the activation policy instead of the
 * explorer reaching down for `DesktopContext`, and why what is open travels the
 * same way — published into `lib/windowRegistry` by `Desktop`, read from there
 * by the dashboard.
 *
 * This test exists because the rule was broken while building that dashboard:
 * importing `DesktopContext` into `ArchiveExplorer` works, ships, and passes
 * every other test in the suite. Nothing catches it but a rule.
 */
const modules = import.meta.glob('./*.{ts,tsx}', { query: '?raw', import: 'default', eager: true })

const SURFACES = ['ArchiveExplorer', 'ArchiveGrid', 'ArchiveMobile', 'ArchivePanel', 'FileCard', 'WindowDashboard']

const sources = Object.entries(modules)
  .filter(([path]) => !/\.test\.tsx?$/.test(path))
  .map(([path, src]) => [path, String(src)] as const)

const stripComments = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')

describe('navigation surfaces do not depend on Desktop', () => {
  it('finds the surfaces to check', () => {
    const found = SURFACES.filter((n) => sources.some(([p]) => p === `./${n}.tsx`))
    expect(found).toEqual(SURFACES)
  })

  it('never imports DesktopContext', () => {
    for (const name of SURFACES) {
      const entry = sources.find(([p]) => p === `./${name}.tsx`)!
      const code = stripComments(entry[1])
      expect(code, `${name} imports from Desktop`).not.toMatch(/import[^;]*from\s*['"]\.\/Desktop['"]/)
      expect(code, `${name} uses DesktopContext`).not.toMatch(/\bDesktopContext\b/)
    }
  })
})
