/**
 * One media node per file, and one place that may move it.
 *
 * The unit of movement is a **host** `<div>` created here with
 * `document.createElement`. It never enters a React tree as a child, so React
 * has no recorded parent for it and can never be surprised by where it is. The
 * `<video>` inside the host *is* React-rendered — via a portal targeting the
 * host — so `src`, `poster`, `loop`, `playsInline` and handlers stay declarative.
 * React only ever appends to and removes from `host`; `host`'s parent is
 * invisible to it.
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
 *
 * Two further rules exist because breaking either is invisible until it is a
 * black pane:
 *
 * 1. **Unregistering a slot parks; only reconcile releases.** React re-fires an
 *    inline ref's cleanup and attach on *every* render, so treating an
 *    unregister as a teardown means an ordinary re-render silently destroys the
 *    media it just placed — and the re-attach puts the host back, so placement
 *    still looks correct afterwards. Parking is the only reading that survives
 *    ref churn without asking every future surface author to remember an idiom.
 *
 * 2. **This module never writes `src`.** It is a React-owned attribute.
 *    Removing it imperatively leaves React's prop record holding the old value,
 *    so a later render with that same value diffs equal and writes nothing —
 *    the attribute is gone for good. Release is therefore a *signal*
 *    (`wantsMedia` goes false) that the declarative layer renders.
 */

export type SlotName = 'preview' | 'primary' | `window:${string}`

export type Placement = { slot: SlotName; fileId: string }

/**
 * Which encode a file should be showing. One `full` at a time, by construction:
 * it is derived from the focus hint, not stored per file.
 */
export type MediaTier = 'full' | 'thumb'

/**
 * The playback policy object (`VideoDirector`). Structural rather than imported
 * so this module keeps no dependency on it — there is exactly one instance in
 * the app, constructed by `Desktop` and handed here.
 */
export type PlaybackDirector = {
  register(id: string, el: { play(): void | Promise<void>; pause(): void; readonly paused: boolean }): void
  unregister(id: string): void
  setFocus(id: string | null): void
  setBackground(ids: readonly string[] | null): void
}

export type MediaState = {
  volume: number
  muted: boolean
  currentTime: number
  /** playback intent, kept across a park so a re-render does not stop the video */
  playing: boolean
}

/** Single-element FLIP on the host. Injected so this module stays anime-free. */
export type MoveAnimator = (host: HTMLElement, from: DOMRectReadOnly, to: DOMRectReadOnly) => void

export type MediaSnapshot = {
  /** files that own a host, in first-acquisition order — one portal each */
  readonly fileIds: readonly string[]
  /** fileId → the slot it occupies, or null when parked in the attic */
  readonly placement: Readonly<Record<string, SlotName | null>>
  /** fileId → whether the declarative layer should give it a `src` at all */
  readonly wanted: Readonly<Record<string, boolean>>
  /** fileId → which encode to render. Exactly one file is ever `full`. */
  readonly tier: Readonly<Record<string, MediaTier>>
}

export type MediaController = {
  acquire(fileId: string): HTMLDivElement
  hostFor(fileId: string): HTMLDivElement | undefined
  /**
   * The element attached for this file, or null. Read-only, and by fileId —
   * which is the whole point: the dashboard needs a live `<video>` to sample
   * (clock, buffered, readyState, playback quality) and the binding rule is
   * that nothing finds a media element by DOM shape. This is the sanctioned
   * way to ask, and `mediaLookup.test.ts` is what enforces the alternative.
   */
  videoFor(fileId: string): HTMLVideoElement | null
  /**
   * Returns a cleanup bound to `el`. React 19 uses a ref callback's return value
   * as its cleanup, so the safe idiom is the whole call:
   * `ref={(el) => media.registerSlot('preview', el)}`. Because the cleanup
   * closes over its element it can refuse to unregister a slot another element
   * has already claimed (mount-before-unmount ordering).
   */
  registerSlot(slot: SlotName, el: HTMLElement | null): () => void
  /**
   * The declarative layer's `<video>` ref. Same idiom and same identity guard as
   * `registerSlot`: `ref={(el) => media.attachVideo(id, el)}`. It is how the
   * controller learns an element exists at all — `acquire` only makes the host,
   * and the element inside it is created a render later by React.
   */
  attachVideo(fileId: string, el: HTMLVideoElement | null): () => void
  /**
   * `loadeddata` from the declarative layer. A tier swap replaces the source, so
   * the element resets to paused at time zero underneath every ledger in the
   * app; this is where the playhead and the play/pause policy are re-applied.
   */
  resync(fileId: string): void
  reconcile(
    desired: readonly Placement[],
    opts?: {
      animate?: boolean
      /** the file that plays full-res with audio available; everything else is a muted thumb */
      focus?: string | null
    },
  ): void
  release(fileId: string): void
  setVolume(fileId: string, v: number): void
  setMuted(fileId: string, muted: boolean): void
  stateOf(fileId: string): MediaState
  slotOf(fileId: string): SlotName | null
  fileInSlot(slot: SlotName): string | null
  hostedFileIds(): readonly string[]
  /**
   * The declarative contract. The layer that renders the `<video>` must render
   * `src` when this is true and `undefined` when it is false, and must never be
   * second-guessed by an imperative write from here.
   */
  wantsMedia(fileId: string): boolean
  /** Which encode the declarative layer must render for this file. */
  tierOf(fileId: string): MediaTier
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
 *   surface that has unmounted resolves to "nowhere";
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

const DEFAULT_STATE = (): MediaState => ({ volume: 0, muted: true, currentTime: 0, playing: false })

/** A seek is not free; only issue one when the playhead is actually wrong. */
const SEEK_EPSILON = 0.05

export function createMediaController(
  opts: { animateMove?: MoveAnimator; director?: PlaybackDirector } = {},
): MediaController {
  const hosts = new Map<string, HTMLDivElement>()
  const order: string[] = []
  const slots = new Map<SlotName, HTMLElement>()
  const placement = new Map<string, SlotName>()
  const states = new Map<string, MediaState>()
  const released = new Set<string>()
  const subscribers = new Set<() => void>()
  const videos = new Map<string, HTMLVideoElement>()
  const tiers = new Map<string, MediaTier>()
  /** files whose source is about to be swapped, and the playhead to land back on */
  const resumeAt = new Map<string, number>()
  let focusId: string | null = null

  // Detached on purpose. A parked host keeps its identity, its <video> and its
  // src, so an ordinary re-render costs a round trip and nothing else.
  const atticEl = document.createElement('div')
  atticEl.setAttribute('data-media-attic', '')

  let desiredCache: readonly Placement[] = []
  let focusCache: string | null = null
  let snapshot: MediaSnapshot = { fileIds: [], placement: {}, wanted: {}, tier: {} }
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
  const elFor = (fileId: string) => {
    const host = hosts.get(fileId)
    return host ? videoIn(host) : null
  }
  const tierOf = (fileId: string): MediaTier => tiers.get(fileId) ?? 'thumb'

  /**
   * The single writer of `muted` and `volume` on an element.
   *
   * **`muted` has exactly one owner and it is this module**, writing it as a
   * property from the per-file record. The declarative layer must render neither
   * `muted` nor `volume`: rendering `muted` as well is the same prop-desync that
   * made an imperative `src` removal permanent, only in a quieter attribute —
   * React's record would keep saying `true`, diff equal, and never write again.
   */
  function applyAudio(fileId: string) {
    const v = elFor(fileId)
    if (!v) return
    const rec = stateOf(fileId)
    if (v.muted !== rec.muted) v.muted = rec.muted
    if (v.volume !== rec.volume) v.volume = rec.volume
  }

  /**
   * The focus policy, applied to the record rather than to the element: only the
   * focused file may sound. `volume` is untouched, so refocusing restores the
   * level the user chose instead of 000 — that is what "mutes without discarding
   * the stored level" means with `muted` and `volume` as separate fields.
   */
  function applyFocusMuting() {
    for (const fileId of placement.keys()) {
      const rec = stateOf(fileId)
      rec.muted = fileId !== focusId || rec.volume === 0
      applyAudio(fileId)
    }
  }

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

  /**
   * Read what a file is doing. While a file is parked its element is detached
   * and paused — by us, or eventually by the user agent's "removed from a
   * document" steps — so the element is not a truthful source of playback
   * intent. The record is.
   */
  function capture(fileId: string): MediaState {
    const rec = stateOf(fileId)
    const host = hosts.get(fileId)
    const v = host ? videoIn(host) : null
    const live = placement.has(fileId) && v !== null
    return {
      volume: rec.volume,
      muted: rec.muted,
      currentTime: live ? v.currentTime : rec.currentTime,
      playing: live ? !v.paused : rec.playing,
    }
  }

  /**
   * Restore unconditionally after every move. All three engines were measured
   * keeping a <video> playing across a same-document reparent, so this is not a
   * browser-quirk fallback — it is what makes a node arriving with a stale
   * volume or playhead correct, on every engine, with no detection. It is also
   * idempotent, which matters now that a move can happen on any render: seeking
   * to the position the element is already at would stutter playback.
   */
  function restore(fileId: string, snap: MediaState) {
    const v = elFor(fileId)
    if (!v) return
    applyAudio(fileId)
    if (
      Number.isFinite(snap.currentTime) && snap.currentTime > 0 &&
      Math.abs(v.currentTime - snap.currentTime) > SEEK_EPSILON
    ) {
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

  /**
   * Evacuate to the attic, keeping the media intact.
   *
   * This is what an unregistering slot gets, and it has to be survivable:
   * React fires an inline ref's cleanup and attach on every single render, so a
   * teardown here would strip a file's media on an ordinary re-render and the
   * re-attach would hide the damage by restoring the host into the right slot.
   * Playback intent moves into the record so the round trip resumes.
   */
  function park(fileId: string) {
    const host = hosts.get(fileId)
    if (!host) return
    const rec = stateOf(fileId)
    const v = videoIn(host)
    if (v && placement.has(fileId)) {
      rec.currentTime = v.currentTime
      rec.playing = !v.paused
    }
    if (v && !v.paused) v.pause()
    if (host.parentElement !== atticEl) atticEl.appendChild(host)
    if (placement.delete(fileId)) dirty = true
  }

  /**
   * Give up the decode. Park, then drop the demand for media: the declarative
   * layer sees `wantsMedia` go false and stops rendering a `src`, which is the
   * only way to release a resource React owns without desyncing its prop record.
   * Nothing here touches the `<video>`'s attributes.
   */
  function releaseFile(fileId: string) {
    if (!hosts.has(fileId)) return
    park(fileId)
    const rec = stateOf(fileId)
    // The level is a per-file record for the session and survives teardown, so
    // reopening a file does not silently reset it to 000. The playhead does not:
    // the decode it referred to is gone.
    rec.currentTime = 0
    rec.playing = false
    resumeAt.delete(fileId)
    opts.director?.unregister(fileId)
    if (!released.has(fileId)) { released.add(fileId); dirty = true }
  }

  function notify() {
    if (!dirty) return
    dirty = false
    snapshot = {
      fileIds: order.slice(),
      placement: Object.fromEntries(order.map((id) => [id, placement.get(id) ?? null])),
      wanted: Object.fromEntries(order.map((id) => [id, !released.has(id)])),
      tier: Object.fromEntries(order.map((id) => [id, tierOf(id)])),
    }
    for (const cb of subscribers) cb()
  }

  /**
   * `mayRelease` is the whole difference between "the desired map dropped this
   * file" and "a slot's ref happened to churn". Only the former is a teardown.
   */
  function apply(animate: boolean, mayRelease: boolean) {
    const resolved = resolveDesired(desiredCache, isLive)
    // A focus hint naming a file this pass does not place is not focus.
    focusId = focusCache !== null && resolved.has(focusCache) ? focusCache : null
    // Evacuate first: it frees the slots the survivors are about to claim, and
    // it means a window closing never leaves a node inside a subtree React is
    // about to unmount. Collect before acting — both paths delete from the map
    // being read.
    //
    // Scope differs by intent, and it matters. A reconcile is a complete
    // statement of what should exist, so it is authoritative over every hosted
    // file — including ones already parked, which would otherwise sit in the
    // attic holding a decode that nothing will ever ask for again. A slot
    // change only says something about what is placed right now.
    const doomed: string[] = []
    for (const fileId of (mayRelease ? hosts.keys() : placement.keys())) {
      if (!resolved.has(fileId)) doomed.push(fileId)
    }
    for (const fileId of doomed) (mayRelease ? releaseFile : park)(fileId)
    for (const [fileId, slot] of resolved) {
      acquire(fileId)
      if (released.delete(fileId)) dirty = true
      moveHost(fileId, slots.get(slot)!, animate)
      if (placement.get(fileId) !== slot) { placement.set(fileId, slot); dirty = true }
    }
    applyTiers()
    applyFocusMuting()
    // The single director in the app, fed once per pass: one focus, everything
    // else placed is background, in placement order. Nothing else calls it.
    const placed = [...placement.keys()]
    if (opts.director) {
      // Idempotent, and the recovery path for a file that was released (and so
      // unregistered) and has since been asked for again.
      for (const fileId of placed) {
        const v = elFor(fileId)
        if (v) opts.director.register(fileId, v)
      }
      opts.director.setFocus(focusId)
      opts.director.setBackground(placed.filter((id) => id !== focusId))
    }
    notify()
  }

  /**
   * Tier is derived, never stored as intent: the focused file gets `_full` with
   * audio available, everything else gets the 240p thumb. Changing it swaps the
   * element's source, which resets it to paused at time zero underneath us — so
   * the playhead is stashed here and re-applied on `resync`, and the swap is a
   * render (the layer reads `snapshot.tier`) rather than an attribute write.
   */
  function applyTiers() {
    for (const fileId of order) {
      const want: MediaTier = fileId === focusId && placement.has(fileId) ? 'full' : 'thumb'
      if (tierOf(fileId) === want) continue
      const v = elFor(fileId)
      if (v && placement.has(fileId)) {
        const rec = stateOf(fileId)
        rec.currentTime = v.currentTime
        rec.playing = !v.paused
        resumeAt.set(fileId, v.currentTime)
        freezeFrame(fileId, v)
      }
      tiers.set(fileId, want)
      dirty = true
    }
  }

  /**
   * Hold the last frame across a tier swap.
   *
   * Swapping `src` empties the element: it shows its poster (a jump-cut to an
   * unrelated frame) or black until the new encode has data, and the seek back to
   * the stashed playhead lands a beat after that. On a window being promoted to
   * focus — the moment its neighbour closes — that read as the surviving windows
   * "glitching". So the frame that is on screen is copied to a canvas laid over
   * the video INSIDE the host, and removed only when the new source is seeked and
   * presenting. The host is this module's own element, never React's, which is
   * what makes an imperative child here legitimate at all.
   *
   * `try` around the draw: a tainted or not-yet-decoded element throws, and jsdom
   * has no canvas — in every such case the swap simply behaves as it did before
   * this existed.
   */
  function freezeFrame(fileId: string, v: HTMLVideoElement) {
    const host = hosts.get(fileId)
    if (!host || v.videoWidth === 0) return
    try {
      const c = document.createElement('canvas')
      c.width = v.videoWidth
      c.height = v.videoHeight
      const ctx = c.getContext('2d')
      if (!ctx) return
      ctx.drawImage(v, 0, 0)
      host.querySelector('[data-media-freeze]')?.remove()
      c.setAttribute('data-media-freeze', '')
      // Same geometry the video renders with (`.media-host > video` is
      // object-fit: contain), so the held frame sits exactly over the live one.
      c.style.cssText =
        'position:absolute;inset:0;width:100%;height:100%;object-fit:contain;pointer-events:none'
      host.style.position = 'relative'
      host.appendChild(c)

      let done = false
      const lift = () => {
        if (done) return
        done = true
        c.remove()
        v.removeEventListener('seeked', lift)
        v.removeEventListener('playing', lift)
        v.removeEventListener('error', lift)
        window.clearTimeout(timer)
      }
      // `seeked` is the moment the new encode is presenting the stashed playhead
      // — resync() sets currentTime on loadeddata, so it fires once per swap.
      // `playing` covers the one case resync does not seek (a playhead within
      // SEEK_EPSILON of zero, where the new source already starts in the right
      // place). The timeout is the escape hatch for a source that never loads (a
      // released file, a network failure): a stale still over a dead pane is
      // strictly worse than the pane.
      const timer = window.setTimeout(lift, 4000)
      v.addEventListener('seeked', lift)
      v.addEventListener('playing', lift)
      v.addEventListener('error', lift)
    } catch {
      /* no freeze — the swap is merely as abrupt as it always was */
    }
  }

  return {
    acquire,
    hostFor: (fileId) => hosts.get(fileId),
    videoFor: (fileId) => videos.get(fileId) ?? null,

    registerSlot(slot, el) {
      const detach = () => {
        // Identity guard: if a different element already owns this slot, this is
        // a late cleanup from a mount-before-unmount ordering, and dropping the
        // registration would strand the surface that is actually live.
        if (el !== null && slots.get(slot) !== el) return
        if (!slots.delete(slot)) return
        apply(false, false)   // park, never release — see the header
      }
      if (el === null) { detach(); return () => {} }
      if (slots.get(slot) === el) return detach
      slots.set(slot, el)
      // A slot appearing is a placement change like any other, so it goes
      // through the same path rather than a special case: the retained desire is
      // re-resolved against the slots that now exist.
      apply(false, false)
      return detach
    },

    reconcile(desired, o) {
      desiredCache = desired
      if (o && 'focus' in o) focusCache = o.focus ?? null
      apply(o?.animate ?? false, true)
    },

    attachVideo(fileId, el) {
      const detach = () => {
        if (el !== null && videos.get(fileId) !== el) return
        if (!videos.delete(fileId)) return
        opts.director?.unregister(fileId)
      }
      if (el === null) { detach(); return () => {} }
      if (videos.get(fileId) === el) return detach
      videos.set(fileId, el)
      // Ref callbacks run inside the commit, before any media data exists, so
      // this lands well ahead of the user agent's autoplay decision — which is
      // the whole reason `muted` must not be a rendered prop.
      applyAudio(fileId)
      opts.director?.register(fileId, el)
      return detach
    },

    resync(fileId) {
      const v = elFor(fileId)
      if (!v) return
      const at = resumeAt.get(fileId)
      if (at !== undefined) {
        resumeAt.delete(fileId)
        // A tier swap changes the encode, not the clip: land back where the
        // viewer was, unless the new source is too short to hold that playhead.
        if (at > SEEK_EPSILON && (!Number.isFinite(v.duration) || at < v.duration)) {
          try { v.currentTime = at } catch { /* seek before metadata */ }
        }
      }
      applyAudio(fileId)
      // Re-registering is the director's resync idiom: it re-judges against the
      // element's real `paused`, which a source swap has just reset to true.
      if (videos.get(fileId) === v) opts.director?.register(fileId, v)
    },

    release(fileId) { releaseFile(fileId); notify() },

    setVolume(fileId, v) {
      const clamped = Math.max(0, Math.min(1, v))
      const rec = stateOf(fileId)
      rec.volume = clamped
      rec.muted = clamped === 0
      const host = hosts.get(fileId)
      const el = host ? videoIn(host) : null
      if (el) { el.volume = clamped; el.muted = rec.muted }
    },

    setMuted(fileId, muted) {
      const rec = stateOf(fileId)
      rec.muted = muted
      const host = hosts.get(fileId)
      const el = host ? videoIn(host) : null
      if (el) { el.muted = muted; el.volume = rec.volume }
    },

    stateOf: (fileId) => ({ ...stateOf(fileId) }),
    slotOf: (fileId) => placement.get(fileId) ?? null,
    fileInSlot: (slot) => {
      for (const [fileId, s] of placement) if (s === slot) return fileId
      return null
    },
    hostedFileIds: () => snapshot.fileIds,
    wantsMedia: (fileId) => hosts.has(fileId) && !released.has(fileId),
    tierOf,

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
      videos.clear()
      resumeAt.clear()
      desiredCache = []
      focusCache = null
      focusId = null
      dirty = true
      notify()
      subscribers.clear()
    },
  }
}
