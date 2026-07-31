/**
 * One media node per file, and one place that may move it.
 *
 * The unit of movement is a **host** `<div>` created here with
 * `document.createElement`. It never enters a React tree as a child, so React
 * has no recorded parent for it and can never be surprised by where it is. The
 * `<video>` inside the host *is* React-rendered — via a portal targeting the
 * host — so `src`, `muted`, `poster` and handlers stay declarative. React only
 * ever appends to and removes from `host`; `host`'s parent is invisible to it.
 *
 * That is the whole safety argument, and it is structural rather than careful:
 * React 19 calls `parentInstance.removeChild(child)` unguarded on deletion, so
 * a React-rendered element that has been moved out of its React-recorded parent
 * throws NotFoundError in the commit phase and, with no error boundary above
 * the root, blanks the page. Nothing React owns changes parent here.
 *
 * Surfaces contribute *slots* — an ordinary div whose ref calls registerSlot.
 * Slots contribute box size only; the host carries its own presentation, so a
 * node looks the same wherever it lands.
 */

export type SlotName = 'preview' | 'primary' | `window:${string}`

export type Placement = { slot: SlotName; fileId: string }

export type MediaState = { volume: number; muted: boolean; currentTime: number }

/** Single-element FLIP on the host. Injected so this module stays anime-free. */
export type MoveAnimator = (host: HTMLElement, from: DOMRectReadOnly, to: DOMRectReadOnly) => void

export type MediaSnapshot = {
  /** files that own a host, in first-acquisition order — one portal each */
  readonly fileIds: readonly string[]
  /** fileId → the slot it occupies, or null when parked in the attic */
  readonly placement: Readonly<Record<string, SlotName | null>>
}

export type MediaController = {
  acquire(fileId: string): HTMLDivElement
  hostFor(fileId: string): HTMLDivElement | undefined
  registerSlot(slot: SlotName, el: HTMLElement | null): void
  reconcile(desired: readonly Placement[], opts?: { animate?: boolean }): void
  release(fileId: string): void
  setVolume(fileId: string, v: number): void
  setMuted(fileId: string, muted: boolean): void
  stateOf(fileId: string): MediaState
  slotOf(fileId: string): SlotName | null
  fileInSlot(slot: SlotName): string | null
  hostedFileIds(): readonly string[]
  subscribe(cb: () => void): () => void
  getSnapshot(): MediaSnapshot
  /** hosts that exist but are placed nowhere; for assertions and teardown */
  attic(): HTMLElement
  dispose(): void
}

/** Binding: `window:*` > `primary` > `preview`. This is what makes the desired map total. */
export function slotRank(slot: SlotName): number {
  if (slot.startsWith('window:')) return 2
  if (slot === 'primary') return 1
  return 0
}

/**
 * Desired placements in, one-slot-per-file out. Pure, so the priority rule can
 * be argued about without a DOM.
 *
 * - claims on unregistered slots are dropped, so a file whose only claim is a
 *   surface that has unmounted resolves to "nowhere" and gets released;
 * - a file claiming several live slots takes the highest-ranked one;
 * - a slot claimed by several files goes to the first claimant. The caller is
 *   not supposed to do that; resolving it deterministically beats throwing
 *   inside a React commit.
 */
export function resolveDesired(
  desired: readonly Placement[],
  isLive: (slot: SlotName) => boolean,
): Map<string, SlotName> {
  const best = new Map<string, SlotName>()
  for (const { slot, fileId } of desired) {
    if (!isLive(slot)) continue
    const cur = best.get(fileId)
    if (cur === undefined || slotRank(slot) > slotRank(cur)) best.set(fileId, slot)
  }
  const taken = new Map<SlotName, string>()
  const out = new Map<string, SlotName>()
  for (const [fileId, slot] of best) {
    if (taken.has(slot)) continue
    taken.set(slot, fileId)
    out.set(fileId, slot)
  }
  return out
}

const DEFAULT_STATE = (): MediaState => ({ volume: 0, muted: true, currentTime: 0 })

export function createMediaController(opts: { animateMove?: MoveAnimator } = {}): MediaController {
  const hosts = new Map<string, HTMLDivElement>()
  const order: string[] = []
  const slots = new Map<SlotName, HTMLElement>()
  const placement = new Map<string, SlotName>()
  const states = new Map<string, MediaState>()
  const subscribers = new Set<() => void>()

  // Detached on purpose. A parked host keeps its identity and its <video>, so
  // re-selecting a closed file gets the same object back rather than a new one.
  const atticEl = document.createElement('div')
  atticEl.setAttribute('data-media-attic', '')

  let desiredCache: readonly Placement[] = []
  let snapshot: MediaSnapshot = { fileIds: [], placement: {} }
  let dirty = false

  const isLive = (slot: SlotName) => slots.has(slot)
  const stateOf = (fileId: string): MediaState => {
    let s = states.get(fileId)
    if (!s) { s = DEFAULT_STATE(); states.set(fileId, s) }
    return s
  }
  // Scoped to the host, never to the document: identity comes from the fileId
  // that produced this host, so there is no lookup by DOM shape anywhere.
  const videoIn = (host: HTMLElement) => host.querySelector('video')

  function acquire(fileId: string): HTMLDivElement {
    const existing = hosts.get(fileId)
    if (existing) return existing
    const host = document.createElement('div')
    host.className = 'media-host'
    host.dataset.mediaHost = fileId
    // The host carries its own presentation so the node looks the same wherever
    // it lands; slots contribute box size only.
    host.style.width = '100%'
    host.style.height = '100%'
    host.style.display = 'block'
    atticEl.appendChild(host)
    hosts.set(fileId, host)
    order.push(fileId)
    stateOf(fileId)
    dirty = true
    return host
  }

  /** Read what a live node is actually doing, falling back to the stored record. */
  function capture(fileId: string): MediaState & { playing: boolean } {
    const rec = stateOf(fileId)
    const host = hosts.get(fileId)
    const v = host && videoIn(host)
    if (!v) return { ...rec, playing: false }
    return { volume: rec.volume, muted: rec.muted, currentTime: v.currentTime, playing: !v.paused }
  }

  /**
   * Restore unconditionally after every move. All three engines were measured
   * keeping a <video> playing across a same-document reparent, so this is not a
   * browser-quirk fallback — it is what makes a node arriving with a stale
   * volume or playhead correct, on every engine, with no detection.
   */
  function restore(fileId: string, snap: MediaState & { playing: boolean }) {
    const host = hosts.get(fileId)
    const v = host && videoIn(host)
    if (!v) return
    v.volume = snap.volume
    v.muted = snap.muted
    if (Number.isFinite(snap.currentTime) && snap.currentTime > 0) {
      try { v.currentTime = snap.currentTime } catch { /* seek before metadata */ }
    }
    if (snap.playing && v.paused) {
      const p: Promise<void> | undefined = v.play()
      if (p && typeof p.catch === 'function') p.catch(() => {})
    }
  }

  function moveHost(fileId: string, target: HTMLElement, animate: boolean) {
    const host = hosts.get(fileId)!
    if (host.parentElement === target) return
    const snap = capture(fileId)
    // `from` is the visual box, in-flight transform and all — that is what makes
    // an interrupted move continue from where it looks like it is. Drop the
    // transform before measuring the destination, or `to` is a half-animated box
    // and the next FLIP computes its delta against a lie.
    const from = host.getBoundingClientRect()
    host.style.transform = ''
    target.appendChild(host)
    const to = host.getBoundingClientRect()
    restore(fileId, snap)
    // Both rects non-zero, or there is no move to describe (jsdom, display:none,
    // a host arriving from the attic). Never animate an undefined delta.
    if (animate && opts.animateMove && from.width > 0 && from.height > 0 && to.width > 0 && to.height > 0) {
      opts.animateMove(host, from, to)
    }
    dirty = true
  }

  /** pause → drop the src → load() → detach. Synchronous: the decode dies now. */
  function releaseFile(fileId: string) {
    const host = hosts.get(fileId)
    if (!host) return
    const v = videoIn(host)
    if (v) {
      if (!v.paused) v.pause()
      v.removeAttribute('src')
      v.load()
    }
    // The level is a per-file record for the session and survives teardown, so
    // reopening a file does not silently reset it to 000. The playhead does not:
    // the decode it referred to is gone.
    stateOf(fileId).currentTime = 0
    if (host.parentElement !== atticEl) atticEl.appendChild(host)
    if (placement.delete(fileId)) dirty = true
  }

  function notify() {
    if (!dirty) return
    dirty = false
    snapshot = {
      fileIds: order.slice(),
      placement: Object.fromEntries(order.map((id) => [id, placement.get(id) ?? null])),
    }
    for (const cb of subscribers) cb()
  }

  function apply(animate: boolean) {
    const resolved = resolveDesired(desiredCache, isLive)
    // Release first: it frees the slots the survivors are about to claim, and it
    // means a window closing never leaves a node inside a subtree React is
    // about to unmount. Collect before releasing — releaseFile deletes from the
    // map being read.
    const doomed: string[] = []
    for (const fileId of placement.keys()) if (!resolved.has(fileId)) doomed.push(fileId)
    for (const fileId of doomed) releaseFile(fileId)
    for (const [fileId, slot] of resolved) {
      acquire(fileId)
      moveHost(fileId, slots.get(slot)!, animate)
      if (placement.get(fileId) !== slot) { placement.set(fileId, slot); dirty = true }
    }
    notify()
  }

  return {
    acquire,
    hostFor: (fileId) => hosts.get(fileId),

    registerSlot(slot, el) {
      if (el === null) {
        if (!slots.delete(slot)) return
      } else {
        if (slots.get(slot) === el) return
        slots.set(slot, el)
      }
      // A slot appearing or vanishing is a placement change like any other, so
      // it goes through the same path rather than a special case: the retained
      // desire is simply re-resolved against the slots that now exist.
      apply(false)
    },

    reconcile(desired, o) {
      desiredCache = desired
      apply(o?.animate ?? false)
    },

    release(fileId) { releaseFile(fileId); notify() },

    setVolume(fileId, v) {
      const clamped = Math.max(0, Math.min(1, v))
      const rec = stateOf(fileId)
      rec.volume = clamped
      rec.muted = clamped === 0
      const host = hosts.get(fileId)
      const el = host && videoIn(host)
      if (el) { el.volume = clamped; el.muted = rec.muted }
    },

    setMuted(fileId, muted) {
      const rec = stateOf(fileId)
      rec.muted = muted
      const host = hosts.get(fileId)
      const el = host && videoIn(host)
      if (el) { el.muted = muted; el.volume = rec.volume }
    },

    stateOf: (fileId) => ({ ...stateOf(fileId) }),
    slotOf: (fileId) => placement.get(fileId) ?? null,
    fileInSlot: (slot) => {
      for (const [fileId, s] of placement) if (s === slot) return fileId
      return null
    },
    hostedFileIds: () => snapshot.fileIds,

    subscribe(cb) {
      subscribers.add(cb)
      return () => { subscribers.delete(cb) }
    },
    getSnapshot: () => snapshot,
    attic: () => atticEl,

    dispose() {
      for (const fileId of hosts.keys()) releaseFile(fileId)
      for (const host of hosts.values()) host.remove()
      slots.clear()
      desiredCache = []
      dirty = true
      notify()
      subscribers.clear()
    },
  }
}
