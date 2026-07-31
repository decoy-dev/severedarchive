// @vitest-environment jsdom
/**
 * The regression test for the crash that superseded Tasks 10–17.
 *
 * React 19's deletion path resolves the nearest host ancestor *in the React
 * tree* and calls `parentInstance.removeChild(child)` unguarded. A React-rendered
 * `<video>` that has been `appendChild`-ed somewhere else therefore throws
 * NotFoundError from the commit phase, and with no error boundary above the root
 * the whole app unmounts. The trigger is a mouse move onto another row while a
 * window is open.
 *
 * The first half of this file proves the hazard is real on the React actually
 * installed. The second proves the host indirection removes it.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { act, useLayoutEffect, useState, type ReactNode } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { createPortal, flushSync } from 'react-dom'
import { createMediaController, type MediaController, type Placement } from './mediaController'

declare global {
  // eslint-disable-next-line no-var
  var IS_REACT_ACT_ENVIRONMENT: boolean
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true
// jsdom has no media transport; release() legitimately calls load().
HTMLMediaElement.prototype.load = () => {}

let container: HTMLDivElement
let root: Root

beforeEach(() => {
  document.body.innerHTML = ''
  container = document.body.appendChild(document.createElement('div'))
  root = createRoot(container, {
    // Without this, React 19 reports the commit-phase throw to console.error and
    // the test runner treats the noise as a failure. We want the throw itself.
    onUncaughtError: () => {},
  })
})

afterEach(() => {
  try { act(() => root.unmount()) } catch { /* already torn down by a crash */ }
})

// ---------------------------------------------------------------------------
// 1. The hazard, reproduced.
// ---------------------------------------------------------------------------
describe('React 19 deletion of a moved node', () => {
  it('throws when a React-rendered element is removed after being reparented', () => {
    const elsewhere = document.body.appendChild(document.createElement('div'))

    function Old({ id }: { id: string }) {
      // exactly the superseded shape: the media element is a keyed React child
      // of the surface, so a selection change deletes it and mounts a new one.
      return <div data-preview><video key={id} data-video={id} /></div>
    }

    act(() => root.render(<Old id="file03" />))
    const video = container.querySelector('video')!

    // what Desktop.open used to do
    elsewhere.appendChild(video)

    let threw: unknown = null
    try {
      act(() => root.render(<Old id="file05" />))
    } catch (e) { threw = e }

    expect(threw, 'React 19 no longer throws here — re-check §2.1 before relying on it').not.toBeNull()
    expect(String(threw)).toMatch(/NotFoundError|not a child/i)
  })
})

// ---------------------------------------------------------------------------
// 2. The same sequence through mediaController, which must not throw.
// ---------------------------------------------------------------------------
const FILES = ['file03', 'file05'] as const

function Harness({
  controller, selectedId, windows, generation,
}: {
  controller: MediaController
  selectedId: string
  windows: readonly string[]
  generation: number
}) {
  // Refs commit before layout effects, so every slot this render wants is
  // registered by the time the desired map is handed over.
  useLayoutEffect(() => {
    const desired: Placement[] = [
      { slot: 'preview', fileId: selectedId },
      ...windows.map((id) => ({ slot: `window:${id}` as const, fileId: id })),
    ]
    controller.reconcile(desired, { animate: true })
  })

  return (
    <div>
      {/* the MediaLayer: one portal per file, into a host React does not own.
          `generation` is in the key so a forced remount can be exercised. */}
      {FILES.map((id) =>
        createPortal(
          <video key={`${id}:${generation}`} data-video={id} src={`/media/${id}_thumb.mp4`} muted />,
          controller.acquire(id),
          id,
        ),
      )}
      <div data-preview ref={(el) => {
        controller.registerSlot('preview', el)
        return () => controller.registerSlot('preview', null)
      }} />
      {windows.map((id) => (
        <div key={id} data-window={id}>
          <div data-body ref={(el) => {
            controller.registerSlot(`window:${id}`, el)
            return () => controller.registerSlot(`window:${id}`, null)
          }} />
        </div>
      ))}
    </div>
  )
}

describe('mediaController under React', () => {
  it('survives the exact sequence that blanks the page under the old shape', () => {
    const controller = createMediaController()
    const render = (selectedId: string, windows: readonly string[], generation = 0) =>
      act(() => root.render(
        <Harness controller={controller} selectedId={selectedId} windows={windows} generation={generation} />,
      ))

    const alive = () => expect(container.querySelector('[data-preview]'), 'React root unmounted').not.toBeNull()
    const preview = () => container.querySelector('[data-preview]')!
    const body = (id: string) => container.querySelector(`[data-window="${id}"] [data-body]`)!

    // explorer up, file03 selected
    render('file03', [])
    alive()
    expect(controller.hostFor('file03')!.parentElement).toBe(preview())
    expect(container.querySelector('[data-video="file03"]')).not.toBeNull()

    // open a window on file03 — window outranks preview
    render('file03', ['file03'])
    alive()
    expect(controller.hostFor('file03')!.parentElement).toBe(body('file03'))
    expect(preview().children).toHaveLength(0)

    // THE TRIGGER: hover moves to another row while the window is open
    render('file05', ['file03'])
    alive()
    expect(controller.hostFor('file03')!.parentElement).toBe(body('file03'))
    expect(controller.hostFor('file05')!.parentElement).toBe(preview())

    // a keyed remount of every video while one of them is away in a window
    render('file05', ['file03'], 1)
    alive()
    expect(controller.hostFor('file03')!.parentElement).toBe(body('file03'))
    expect(controller.hostFor('file03')!.querySelector('video')).not.toBeNull()

    // the window closes: React unmounts a subtree that used to hold the node
    render('file05', [])
    alive()
    expect(controller.hostFor('file03')!.parentElement).toBe(controller.attic())
    expect(controller.hostFor('file03')!.querySelector('video')!.getAttribute('src')).toBeNull()
    expect(controller.hostFor('file05')!.parentElement).toBe(preview())

    // explorer unmounts entirely (view switch to grid / tab switch)
    act(() => root.render(<div data-preview-gone />))
    expect(controller.hostFor('file05')!.parentElement).toBe(controller.attic())
  })

  it('does not throw when the whole tree unmounts with a node placed in a window', () => {
    const controller = createMediaController()
    act(() => root.render(
      <Harness controller={controller} selectedId="file03" windows={['file03']} generation={0} />,
    ))
    expect(controller.hostFor('file03')!.parentElement).not.toBe(controller.attic())
    expect(() => act(() => root.unmount())).not.toThrow()
  })

  it('reconciles synchronously inside flushSync without tearing', () => {
    // Desktop.close() must be able to reconcile before setWindows lands, so the
    // controller has to be safe to drive from a synchronous flush.
    const controller = createMediaController()
    function App() {
      const [windows, setWindows] = useState<readonly string[]>(['file03'])
      useLayoutEffect(() => { (App as unknown as { close: () => void }).close = () => {
        controller.reconcile([{ slot: 'preview', fileId: 'file03' }])
        flushSync(() => setWindows([]))
      } })
      return <Harness controller={controller} selectedId="file03" windows={windows} generation={0} />
    }
    act(() => root.render(<App /> as ReactNode))
    expect(controller.hostFor('file03')!.parentElement).toBe(container.querySelector('[data-body]'))
    expect(() => act(() => (App as unknown as { close: () => void }).close())).not.toThrow()
    expect(controller.hostFor('file03')!.parentElement).toBe(container.querySelector('[data-preview]'))
  })
})
