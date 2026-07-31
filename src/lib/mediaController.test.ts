// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { createMediaController, resolveDesired, slotRank, type SlotName, type MoveAnimator } from './mediaController'

// jsdom stubs play/pause/load as "not implemented" and hard-codes `paused` to
// true, so a real <video> cannot express playback state. Swap in a tiny ledger:
// volume, muted, currentTime and src are all genuinely implemented, so only the
// transport needs faking.
function stubMediaTransport() {
  const state = new WeakMap<HTMLMediaElement, boolean>()
  Object.defineProperty(HTMLMediaElement.prototype, 'paused', {
    configurable: true,
    get(this: HTMLMediaElement) { return state.get(this) ?? true },
  })
  HTMLMediaElement.prototype.play = function (this: HTMLMediaElement) { state.set(this, false); return Promise.resolve() }
  HTMLMediaElement.prototype.pause = function (this: HTMLMediaElement) { state.set(this, true) }
  HTMLMediaElement.prototype.load = function (this: HTMLMediaElement) { state.set(this, true) }
}
stubMediaTransport()

// jsdom has no layout, so every rect is zero and the controller's "both rects
// non-zero" guard would suppress every animation. Give connected elements a real
// box and leave detached ones (the attic) at zero, which is what a browser
// reports anyway — so "arriving from the attic does not animate" stays true.
const fakeRect = (w: number, h: number): DOMRect =>
  ({ x: 0, y: 0, width: w, height: h, top: 0, left: 0, right: w, bottom: h, toJSON: () => ({}) }) as DOMRect
Element.prototype.getBoundingClientRect = function (this: Element) {
  return this.isConnected ? fakeRect(320, 180) : fakeRect(0, 0)
}

/**
 * Stand-in for the MediaLayer portal that Slice C mounts: it renders exactly one
 * <video> into each host and never touches placement. Deliberately does not
 * re-add a src it did not put there, so a released file stays released — the
 * same thing React does when the src prop goes undefined.
 */
function mountMissingVideos(ids: readonly string[], hostOf: (id: string) => HTMLElement | undefined) {
  for (const id of ids) {
    const host = hostOf(id)
    if (!host) continue
    if (host.querySelector('video')) continue
    const v = document.createElement('video')
    v.src = `/media/${id}_thumb.mp4`
    host.appendChild(v)
  }
}

const videoIn = (host: HTMLElement) => host.querySelector('video') as HTMLVideoElement

describe('slotRank / resolveDesired', () => {
  it('ranks window above primary above preview', () => {
    expect(slotRank('window:file01')).toBeGreaterThan(slotRank('primary'))
    expect(slotRank('primary')).toBeGreaterThan(slotRank('preview'))
  })

  it('gives a file its highest-priority claimed slot and leaves the rest empty', () => {
    const live = new Set<SlotName>(['preview', 'primary', 'window:file01'])
    const got = resolveDesired(
      [
        { slot: 'preview', fileId: 'file01' },
        { slot: 'primary', fileId: 'file01' },
        { slot: 'window:file01', fileId: 'file01' },
      ],
      (s) => live.has(s),
    )
    expect(got.get('file01')).toBe('window:file01')
    expect(got.size).toBe(1)
  })

  it('ignores claims on slots that are not registered', () => {
    const got = resolveDesired(
      [{ slot: 'window:file01', fileId: 'file01' }, { slot: 'preview', fileId: 'file01' }],
      (s) => s === 'preview',
    )
    expect(got.get('file01')).toBe('preview')
  })

  it('drops a file entirely when none of its slots are live', () => {
    const got = resolveDesired([{ slot: 'preview', fileId: 'file01' }], () => false)
    expect(got.size).toBe(0)
  })

  it('resolves a contested slot to the first claimant, deterministically', () => {
    const got = resolveDesired(
      [{ slot: 'preview', fileId: 'file01' }, { slot: 'preview', fileId: 'file02' }],
      () => true,
    )
    expect(got.get('file01')).toBe('preview')
    expect(got.has('file02')).toBe(false)
  })
})

const slotEl = () => document.body.appendChild(document.createElement('div'))

describe('mediaController', () => {
  let preview: HTMLElement
  let winA: HTMLElement
  let animateMove: MoveAnimator

  const make = () => {
    animateMove = vi.fn()
    const c = createMediaController({ animateMove })
    c.registerSlot('preview', preview)
    return c
  }

  beforeEach(() => {
    document.body.innerHTML = ''
    preview = slotEl()
    winA = slotEl()
  })

  it('creates one host per file and parks it in the requested slot', () => {
    const c = make()
    c.reconcile([{ slot: 'preview', fileId: 'file03' }])
    const host = c.hostFor('file03')!
    expect(host).toBeDefined()
    expect(host.parentElement).toBe(preview)
    // reconciling the same desire again must not churn the DOM
    c.reconcile([{ slot: 'preview', fileId: 'file03' }])
    expect(c.hostFor('file03')).toBe(host)
    expect(animateMove).not.toHaveBeenCalled()
  })

  it('never lets a file appear in two places at once', () => {
    const c = make()
    c.registerSlot('window:file03', winA)
    c.reconcile([{ slot: 'preview', fileId: 'file03' }, { slot: 'window:file03', fileId: 'file03' }])
    const host = c.hostFor('file03')!
    expect(host.parentElement).toBe(winA)
    expect(preview.children).toHaveLength(0)
    expect(c.slotOf('file03')).toBe('window:file03')
  })

  it('evacuates and releases when a slot unregisters', () => {
    const c = make()
    c.reconcile([{ slot: 'preview', fileId: 'file03' }])
    mountMissingVideos(c.hostedFileIds(), c.hostFor)
    const host = c.hostFor('file03')!
    const video = videoIn(host)
    video.play()

    c.registerSlot('preview', null)

    expect(host.parentElement).toBe(c.attic())
    expect(video.getAttribute('src')).toBeNull()
    expect(video.paused).toBe(true)
    expect(c.slotOf('file03')).toBeNull()
    // identity survives teardown: the host is the same object on re-acquire
    c.registerSlot('preview', preview)
    expect(c.hostFor('file03')).toBe(host)
  })

  it('carries volume and playhead across a move, and keeps volume across a release', () => {
    const c = make()
    c.registerSlot('window:file03', winA)
    c.reconcile([{ slot: 'preview', fileId: 'file03' }])
    mountMissingVideos(c.hostedFileIds(), c.hostFor)
    const video = videoIn(c.hostFor('file03')!)

    c.setVolume('file03', 0.6)
    expect(video.volume).toBeCloseTo(0.6)
    expect(video.muted).toBe(false)
    video.currentTime = 4.25
    video.play()

    c.reconcile([{ slot: 'window:file03', fileId: 'file03' }])

    expect(video.parentElement).toBe(c.hostFor('file03'))
    expect(video.currentTime).toBeCloseTo(4.25)
    expect(video.volume).toBeCloseTo(0.6)
    expect(video.paused).toBe(false)

    // row 6: the level outlives the placement, so a window adopting this node
    // renders VOL 060 rather than 000.
    c.registerSlot('window:file03', null)
    expect(c.stateOf('file03').volume).toBeCloseTo(0.6)
    expect(c.stateOf('file03').currentTime).toBe(0)
  })

  it('mutes without discarding the stored level', () => {
    const c = make()
    c.reconcile([{ slot: 'preview', fileId: 'file03' }])
    mountMissingVideos(c.hostedFileIds(), c.hostFor)
    const video = videoIn(c.hostFor('file03')!)
    c.setVolume('file03', 0.4)
    c.setMuted('file03', true)
    expect(video.muted).toBe(true)
    expect(c.stateOf('file03').volume).toBeCloseTo(0.4)
    c.setMuted('file03', false)
    expect(video.volume).toBeCloseTo(0.4)
  })

  it('animates a real move and only a real move', () => {
    const c = make()
    c.registerSlot('window:file03', winA)
    c.reconcile([{ slot: 'preview', fileId: 'file03' }], { animate: true })
    expect(animateMove).not.toHaveBeenCalled()   // first placement is not a move
    c.reconcile([{ slot: 'window:file03', fileId: 'file03' }], { animate: true })
    expect(animateMove).toHaveBeenCalledTimes(1)
    c.reconcile([{ slot: 'window:file03', fileId: 'file03' }], { animate: true })
    expect(animateMove).toHaveBeenCalledTimes(1)
  })

  it('notifies subscribers when the hosted set or placement changes', () => {
    const c = make()
    const seen: number[] = []
    const off = c.subscribe(() => seen.push(c.hostedFileIds().length))
    c.reconcile([{ slot: 'preview', fileId: 'file03' }])
    const first = c.getSnapshot()
    c.reconcile([{ slot: 'preview', fileId: 'file03' }])
    expect(c.getSnapshot()).toBe(first)          // stable identity when nothing moved
    c.reconcile([{ slot: 'preview', fileId: 'file05' }])
    expect(c.getSnapshot()).not.toBe(first)
    off()
    c.reconcile([{ slot: 'preview', fileId: 'file03' }])
    expect(seen).toEqual([1, 2])
  })

  it('releases everything on dispose', () => {
    const c = make()
    c.registerSlot('window:file03', winA)
    c.reconcile([{ slot: 'preview', fileId: 'file05' }, { slot: 'window:file03', fileId: 'file03' }])
    mountMissingVideos(c.hostedFileIds(), c.hostFor)
    const hosts = c.hostedFileIds().map((id) => c.hostFor(id)!)
    c.dispose()
    for (const h of hosts) {
      expect(h.parentElement).toBe(null)
      expect(videoIn(h).getAttribute('src')).toBeNull()
    }
  })
})

// ---------------------------------------------------------------------------
// The gate for the whole slice. Drives the controller through the exact
// sequence §5 names and asserts, after every step, that each file has exactly
// one node, that the node's parent is what the priority rule predicts, and that
// released files carry no src.
// ---------------------------------------------------------------------------
describe('mediaController — full lifecycle', () => {
  it('acquire → preview → window → focus swap → 2nd window → close → grid → unmount', () => {
    document.body.innerHTML = ''
    const preview = slotEl()
    const primary = slotEl()
    const winA = slotEl()
    const winB = slotEl()

    const c = createMediaController()
    const identity = new Map<string, HTMLElement>()
    const check = (expected: Record<string, HTMLElement | null>) => {
      for (const [id, host] of Object.entries(
        Object.fromEntries(c.hostedFileIds().map((id) => [id, c.hostFor(id)!])),
      )) {
        // one node per file, forever
        if (identity.has(id)) expect(host, `${id} host identity`).toBe(identity.get(id))
        else identity.set(id, host)
      }
      mountMissingVideos(c.hostedFileIds(), c.hostFor)
      for (const [id, parent] of Object.entries(expected)) {
        const host = c.hostFor(id)!
        expect(host.parentElement, `${id} placement`).toBe(parent ?? c.attic())
        if (parent === null) {
          expect(videoIn(host).getAttribute('src'), `${id} released src`).toBeNull()
        }
      }
    }

    // 1. explorer mounts, file03 selected → preview
    c.registerSlot('preview', preview)
    c.reconcile([{ slot: 'preview', fileId: 'file03' }])
    check({ file03: preview })

    // 2. open a window on file03 — window outranks preview, the pane goes empty
    c.registerSlot('window:file03', winA)
    c.reconcile([{ slot: 'preview', fileId: 'file03' }, { slot: 'window:file03', fileId: 'file03' }], { animate: true })
    check({ file03: winA })
    expect(preview.children).toHaveLength(0)

    // 3. the crash trigger: hover moves to another row while a window is open
    c.reconcile([{ slot: 'preview', fileId: 'file05' }, { slot: 'window:file03', fileId: 'file03' }])
    check({ file03: winA, file05: preview })

    // 4. open a second window, on the file the preview is showing
    c.registerSlot('window:file05', winB)
    c.reconcile([
      { slot: 'preview', fileId: 'file05' },
      { slot: 'window:file03', fileId: 'file03' },
      { slot: 'window:file05', fileId: 'file05' },
    ], { animate: true })
    check({ file03: winA, file05: winB })
    expect(preview.children).toHaveLength(0)

    // 5. close the first window: reconcile without it, synchronously, then the
    //    slot element unmounts. file03 is wanted nowhere → released.
    c.reconcile([{ slot: 'preview', fileId: 'file05' }, { slot: 'window:file05', fileId: 'file05' }])
    check({ file03: null, file05: winB })
    c.registerSlot('window:file03', null)
    check({ file03: null, file05: winB })

    // 6. selection moves back to the closed file — the same host comes back
    c.reconcile([{ slot: 'preview', fileId: 'file03' }, { slot: 'window:file05', fileId: 'file05' }])
    check({ file03: preview, file05: winB })

    // 7. mobile primary outranks preview but never a window
    c.registerSlot('primary', primary)
    c.reconcile([
      { slot: 'preview', fileId: 'file03' }, { slot: 'primary', fileId: 'file03' },
      { slot: 'window:file05', fileId: 'file05' },
    ])
    check({ file03: primary, file05: winB })
    c.registerSlot('primary', null)
    c.reconcile([{ slot: 'preview', fileId: 'file03' }, { slot: 'window:file05', fileId: 'file05' }])
    check({ file03: preview, file05: winB })

    // 8. view switches to GRID — the explorer unmounts, windows are untouched
    c.registerSlot('preview', null)
    check({ file03: null, file05: winB })

    // 9. desktop unmounts
    c.dispose()
    expect(c.hostFor('file03')!.parentElement).toBe(null)
    expect(c.hostFor('file05')!.parentElement).toBe(null)
    expect(videoIn(c.hostFor('file05')!).getAttribute('src')).toBeNull()
    // every file still has exactly the node it started with
    for (const [id, host] of identity) expect(c.hostFor(id)).toBe(host)
  })
})
