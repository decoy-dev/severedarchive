// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { act, useEffect } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { ArchiveSelectionProvider, useArchiveSelection, type ArchiveSelectionApi } from './selection'
import { DEFAULT_FRONT_ID } from '../data/archive'

declare global { var IS_REACT_ACT_ENVIRONMENT: boolean }
globalThis.IS_REACT_ACT_ENVIRONMENT = true

let container: HTMLDivElement
let root: Root
let api: ArchiveSelectionApi

function Probe({ open }: { open?: (id: string) => void }) {
  api = useArchiveSelection()
  const { registerOpener } = api
  useEffect(() => {
    if (!open) return
    registerOpener(open)
    return () => registerOpener(null)
  }, [open, registerOpener])
  return <span data-selected={api.selectedId} data-view={api.view} />
}

const mount = (open?: (id: string) => void) =>
  act(() => root.render(<ArchiveSelectionProvider><Probe open={open} /></ArchiveSelectionProvider>))

const setWidth = (w: number) => Object.defineProperty(window, 'innerWidth', { value: w, configurable: true })

beforeEach(() => {
  localStorage.clear()
  document.body.innerHTML = ''
  container = document.body.appendChild(document.createElement('div'))
  root = createRoot(container)
  setWidth(1440)
})
afterEach(() => { act(() => root.unmount()) })

describe('ArchiveSelection', () => {
  it('starts on the default front and tracks select()', () => {
    mount()
    expect(api.selectedId).toBe(DEFAULT_FRONT_ID)
    act(() => api.select('file09'))
    expect(api.selectedId).toBe('file09')
    expect(container.querySelector('span')!.dataset.selected).toBe('file09')
  })

  it('select never opens anything', () => {
    const open = vi.fn()
    mount(open)
    act(() => api.select('file09'))
    expect(open).not.toHaveBeenCalled()
  })

  it('activate always selects first, then applies the policy', () => {
    const open = vi.fn()
    mount(open)
    act(() => api.activate('file09', 'row'))
    expect(api.selectedId).toBe('file09')
    expect(open).toHaveBeenCalledWith('file09')
  })

  // The hole the 861px width ruling created: a touch tablet never fires
  // onMouseEnter, so without "activate selects first" the backdrop and preview
  // would never track the user's actual choice.
  it('selects on activate even where nothing opens', () => {
    setWidth(390)
    const open = vi.fn()
    mount(open)
    act(() => api.activate('file09', 'tile'))
    expect(api.selectedId).toBe('file09')
    expect(open).not.toHaveBeenCalled()
  })

  it('a tile activation leaves the grid first', () => {
    const open = vi.fn()
    mount(open)
    act(() => api.setView('grid'))
    expect(api.view).toBe('grid')
    act(() => api.activate('file03', 'tile'))
    expect(api.view).toBe('list')
    expect(open).toHaveBeenCalledWith('file03')
  })

  it('persists the view and migrates the legacy stack value', () => {
    mount()
    act(() => api.setView('grid'))
    expect(localStorage.getItem('severedarchive.archiveView')).toBe('grid')
    act(() => root.unmount())

    localStorage.setItem('severedarchive.archiveView', 'stack')
    root = createRoot(container)
    mount()
    expect(api.view).toBe('list')
  })

  it('is inert when no opener has registered', () => {
    mount()
    expect(() => act(() => api.activate('file09', 'row'))).not.toThrow()
    expect(api.selectedId).toBe('file09')
  })
})
