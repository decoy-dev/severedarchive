import { createContext, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { createScope, createDraggable, createSpring, animate } from 'animejs'
import { isStill, aspectRatio, fileById } from '../data/archive'
import { openWindow, focusWindow, closeWindow, windowBox, type WinState } from '../lib/windowManager'
import { prefersReducedMotion, type PerfTier } from '../lib/perfTier'
import { isInteractiveTarget } from '../lib/keyboard'
import { useArchiveSelection } from '../lib/selection'
import { desiredPlacement } from '../lib/placement'
import { useIsDesktop } from '../hooks/useIsDesktop'
import { createMediaController } from '../lib/mediaController'
import { flipMove } from '../lib/mediaMove'
import { RECEDE_MS } from '../lib/recede'
import { LOCK_MS, lockDelta, lockEase, lockIsNoop, lockTransform, type LockBox } from '../lib/lockOn'
import { VideoDirector } from '../lib/videoDirector'
import FileWindow from './FileWindow'
import { MediaControllerProvider, MediaLayer } from './MediaLayer'
import {
  EMPTY_WINDOW_VIEW, usePublishWindows, type OpenWindowInfo, type WindowView,
} from '../lib/windowRegistry'

export type DesktopApi = {
  open: (id: string) => void
}

export const DesktopContext = createContext<DesktopApi>({ open: () => {} })

const REFUSAL_MS = 450
/** 3 windows + the explorer preview + the backdrop. The backdrop is not registered. */
const MAX_PLAYING = 5

function playRefusal(el: HTMLElement) {
  // The blowout itself is CSS on .stage, keyed off `data-refusing` — only the
  // type is driven here. It carries its own `opacity: 0` in css, so it has to be
  // animated directly; animating the container would fade a box whose contents
  // stay invisible.
  const text = el.querySelector('.refusal-text')!
  if (prefersReducedMotion()) {
    animate(text, { opacity: [0, 1, 0], duration: REFUSAL_MS, ease: 'linear' })
    return
  }
  animate(text, { opacity: [0, 1, 1, 0], scale: [1.04, 1], duration: REFUSAL_MS, ease: 'outQuad' })
}

/**
 * The enlarge/minimize beat: the frame glides to its new box while a stepped
 * scanline roll passes through it. See `lib/lockOn` for the curve and why the
 * geometry is smooth while the overlay stutters.
 *
 * Driven here rather than in `FileWindow` because the pre-change box only exists
 * before React is told about the toggle, and Desktop is where the toggle happens
 * — it also already holds the window elements (`els`).
 *
 * rAF and `important`, for the same reason the recede uses them: the enlarged rule
 * cancels transforms with `!important`, and on the way down the FLIP has to compose
 * with the translate anime.js holds for a dragged window rather than replace it.
 */
function playLockOn(el: HTMLElement, from: LockBox, enlarging: boolean) {
  if (prefersReducedMotion()) return
  const to = el.getBoundingClientRect()
  const delta = lockDelta(from, to)
  if (lockIsNoop(delta)) return

  // Going up, the window must end with NO transform — the enlarged rule cancels
  // the drag offset, and composing with it here would slide the centred box off
  // by however far it had been dragged. Coming down, the offset is the base.
  const base = enlarging ? '' : el.style.transform

  el.dataset.locking = 'true'
  el.style.transformOrigin = '0 0'
  // Progress 0 is written HERE, synchronously, not in the first rAF callback.
  // This runs in a layout effect — before paint — so the window is mapped back
  // onto its old box in the same frame that resized it. Deferring even one frame
  // paints the new layout untransformed first: a full-size flash before the
  // travel starts, which is exactly what a FLIP exists to prevent.
  el.style.setProperty('transform', lockTransform(base, delta, 0), 'important')
  const start = performance.now()
  const step = (now: number) => {
    const t = (now - start) / LOCK_MS
    el.style.setProperty('transform', lockTransform(base, delta, lockEase(t)), 'important')
    if (t < 1) { requestAnimationFrame(step); return }
    // Hand everything back: the CSS `none` while enlarged, or anime's own inline
    // translate. Leaving an important transform here would outrank both.
    el.style.removeProperty('transform')
    if (base) el.style.transform = base
    el.style.transformOrigin = ''
    delete el.dataset.locking
  }
  requestAnimationFrame(step)
}

/** The window on top, i.e. the one that plays full-res with audio available. */
const topWindowId = (windows: readonly WinState[]): string | null =>
  windows.reduce<WinState | null>((top, w) => (!top || w.z > top.z ? w : top), null)?.id ?? null

/**
 * Slot priority (`window:*` > `primary` > `preview`) resolves the overlap when
 * the selected file is also open, so the preview pane shows that file's poster
 * rather than competing for its node. The policy itself is pure and lives in
 * `lib/placement.ts`; this only supplies the current state.
 */
const desiredFor = (
  selectedId: string,
  windows: readonly WinState[],
  isDesktop: boolean,
  tier: PerfTier,
) =>
  desiredPlacement({
    selectedId,
    windowIds: windows.map((w) => w.id),
    focusedWindowId: topWindowId(windows),
    isDesktop,
    tier,
    // A still is never placed: see the note on this parameter. The whole of photo
    // support in the media layer is this one omission.
    isStill,
  })

export default function Desktop({
  children,
  onTabShift,
  tier,
}: {
  children: ReactNode
  onTabShift?: (dir: 1 | -1) => void
  tier: PerfTier
}) {
  const [windows, setWindows] = useState<WinState[]>([])
  const isDesktop = useIsDesktop()
  const [refusing, setRefusing] = useState(false)
  const [live, setLive] = useState('')
  // One controller and one director for the whole app, owned here. The director
  // is the controller's policy object, not a second decision-maker: nothing else
  // in the app constructs or calls one.
  // Held separately from the controller so the cap can move: the controller takes
  // the director as its policy object and never reaches back out for it.
  const director = useMemo(() => new VideoDirector(MAX_PLAYING), [])
  const media = useMemo(
    () => createMediaController({ animateMove: flipMove, director }),
    [director],
  )
  const [volumes, setVolumes] = useState<Record<string, number>>({})
  const rootRef = useRef<HTMLDivElement | null>(null)
  const nodes = useRef(new Map<string, HTMLElement>())
  /**
   * Every window's root element, unconditionally. `nodes` looks like this map and
   * is not: it doubles as attachDrag's "already wired" guard, so it is emptied for
   * a window whose draggable is torn down (the whole enlarged period). The lock-on
   * and the dashboard's live sampler need the element precisely then, which is why
   * they read this map and never that one.
   */
  const els = useRef(new Map<string, HTMLElement>())
  const scopes = useRef(new Map<string, { revert: () => void }>())
  /** The live draggable per window — the only holder of a dragged window's position. */
  const drags = useRef(new Map<string, ReturnType<typeof createDraggable>>())
  /** Where each enlarged window's drag was, so restoring can put it back. */
  const dragCoords = useRef(new Map<string, { x: number; y: number }>())
  /** The box a window is leaving, captured on the toggle so the lock-on can FLIP. */
  const lockFrom = useRef<{ id: string; box: LockBox | null } | null>(null)
  /**
   * One STABLE `bodyRef` per window, for the life of the window.
   *
   * An inline `(el) => media.registerSlot(...)` changes identity every render, and
   * React refires a changed ref: the old cleanup PARKS the file (pause, detach to
   * the attic) and the new attach restores it. Ordinary re-renders of this
   * component were therefore pausing and resuming every window's video — measured
   * as three pause/play cycles per enlarge toggle and two per close, each a decode
   * stall on a slower machine. A stable identity means the ref fires once on mount
   * and its cleanup once on unmount, which is the round trip `registerSlot` was
   * actually designed around. Entries die with the window in `closeNow`.
   */
  const bodyRefs = useRef(new Map<string, (el: HTMLDivElement | null) => (() => void) | void>())
  const bodyRefFor = (id: string) => {
    let cb = bodyRefs.current.get(id)
    if (!cb) {
      cb = (el) => media.registerSlot(`window:${id}`, el)
      bodyRefs.current.set(id, cb)
    }
    return cb
  }
  const refusalRef = useRef<HTMLDivElement | null>(null)
  const refusalTimer = useRef<number | undefined>(undefined)

  const focusedId = useMemo(() => topWindowId(windows), [windows])

  const refuse = useCallback(() => {
    // a refusal landing while the previous one is still on screen replays the flash:
    // the element stays mounted, so its ref callback would not fire a second time.
    if (refusalRef.current) playRefusal(refusalRef.current)
    setRefusing(true)
    // The status region is mounted for the life of the desktop and only its text
    // changes — a live region inserted *with* its text never announces, which is
    // what the previous `aria-live` on the refusal element did. Clearing it after
    // the beat also makes the next refusal a change rather than a repeat.
    setLive('Buffer full. Three files are already open.')
    window.clearTimeout(refusalTimer.current)
    refusalTimer.current = window.setTimeout(() => { setRefusing(false); setLive('') }, REFUSAL_MS)
  }, [])

  const open = useCallback((id: string) => {
    // Opening while another window is enlarged brings that window down first.
    // An enlarged portrait clip leaves the explorer visible in the margins and
    // the scrim does not eat clicks (it is decorative), so a row can be picked —
    // and the new window then mounted at 10+z, behind the enlarged one's 60,
    // looking exactly like it had opened backwards. The viewer asked for a new
    // video; the enlarged state belongs to "the thing being looked at", and that
    // is about to be the new window. `lockFrom` is set so the way down plays the
    // same minimize beat the button does.
    const enlarged = enlargedRef.current
    if (enlarged && enlarged !== id) {
      lockFrom.current = { id: enlarged, box: els.current.get(enlarged)?.getBoundingClientRect() ?? null }
      setEnlargedId(null)
    }
    setWindows((cur) => {
      const area = { w: window.innerWidth, h: window.innerHeight }
      const file = fileById(id)
      // The true box, from generated metadata, so the spawn is clamped against
      // the window that will actually render. The old fabricated 16:9 {720,405}
      // made a portrait window spawn overflowing the viewport bottom, with no
      // drag involved and therefore nothing to correct it.
      const size = file ? windowBox(aspectRatio(file), area) : { w: 0, h: 0 }
      const result = openWindow(cur, id, { area, size })
      // Only the cap is a refusal the user caused; an id that is not in the
      // archive is a bug, and BUFFER FULL would be a lie about it.
      if (!result.ok) {
        if (result.reason === 'cap') refuse()
        return cur
      }
      return result.windows
    })
  }, [refuse])

  // The activation policy lives above Desktop, so Desktop hands its opener up
  // rather than any surface reaching down for DesktopContext.
  const { registerOpener, selectedId } = useArchiveSelection()
  useEffect(() => {
    registerOpener(open)
    return () => registerOpener(null)
  }, [open, registerOpener])

  // Read by `close`, which has to state the post-close world before React knows
  // about it. Kept in refs so `close` does not change identity per render.
  const windowsRef = useRef(windows)
  const selectedRef = useRef(selectedId)
  const envRef = useRef({ isDesktop, tier })
  windowsRef.current = windows
  selectedRef.current = selectedId
  envRef.current = { isDesktop, tier }

  /**
   * Windows mid-close, receding into the background. They are still mounted and
   * still hold their media — the close is deferred, not faked, so nothing is torn
   * out from under the animation. Kept in state because the window has to
   * re-render to paint.
   */
  const [receding, setReceding] = useState<readonly string[]>([])

  /**
   * The one window filling the browser window, or null.
   *
   * Held here rather than inside `FileWindow` because Escape has to mean "come
   * back down" before it means "close", and §4.6 gives the application exactly one
   * window-level keydown listener — the one below — to decide that. Single-valued,
   * so enlarging one window brings any other back down by construction.
   */
  const [enlargedId, setEnlargedId] = useState<string | null>(null)

  const enlargedRef = useRef<string | null>(null)
  enlargedRef.current = enlargedId

  /**
   * Enlarging also raises: the enlarged window is the one being looked at, and
   * focus is what earns it the full-resolution encode (see `desiredPlacement`).
   *
   * The drag coordinates are snapshotted HERE, in the handler, rather than in the
   * effect below. anime.js watches the window with a ResizeObserver and re-clamps
   * its offset to keep the box inside `.desktop` — an element that has just grown
   * to fill the viewport cannot hold any offset at all, so the position of a
   * window that was dragged before being enlarged is destroyed about 150ms later
   * (the observer's debounce). Reading it on the click is reading it before that.
   */
  const toggleEnlarge = useCallback((id: string) => {
    // The box it is leaving, measured before React is told anything. This is the
    // only moment it exists: a layout effect runs after the commit, when the
    // window is already at its new size, and React has no pre-commit hook for
    // function components. `playLockOn` needs both boxes to FLIP between.
    lockFrom.current = { id, box: els.current.get(id)?.getBoundingClientRect() ?? null }
    if (enlargedRef.current !== id) {
      const drag = drags.current.get(id)
      if (drag) dragCoords.current.set(id, { x: drag.x, y: drag.y })
      // The draggable is TORN DOWN for the whole enlarged period, not merely
      // ignored. Its ResizeObserver reacts to the window growing by scheduling a
      // debounced `refresh()`, and refresh ends in `setX/setY` — a PLAIN inline
      // transform write, which strips the `!important` off the lock-on's write
      // and hands the property to the enlarged rule's `transform: none`. On
      // screen that was the window snapping to full size for one frame in the
      // middle of its own travel, ~150ms in (the observer's debounce), every
      // time. `attachDrag` declines to re-wire while this id is enlarged, and
      // the restore render re-wires automatically because `registerEl` refires
      // on every render.
      nodes.current.delete(id)
      scopes.current.get(id)?.revert()
      scopes.current.delete(id)
      setEnlargedId(id)
    } else {
      setEnlargedId(null)
    }
    setWindows((cur) => focusWindow(cur, id))
  }, [])

  /**
   * Coming back down: hand the saved offset back to anime.js.
   *
   * A layout effect, so the window has already been re-rendered at its cascade
   * width — `refresh()` recomputes the drag bounds against that box, and without
   * it `setX` would clamp against the bounds of the viewport-filling one it just
   * left and drop the window near the top-left corner. The observer's own
   * debounced refresh lands after this and finds nothing to change.
   */
  useLayoutEffect(() => {
    for (const [id, saved] of dragCoords.current) {
      if (id === enlargedId) continue
      const drag = drags.current.get(id)
      dragCoords.current.delete(id)
      if (!drag) continue
      drag.refresh()
      drag.setX(saved.x)
      drag.setY(saved.y)
    }
    // AFTER the offset is back, never before: on the way down the window has to
    // end up where anime.js says it is, and `playLockOn` reads that transform as
    // the base it animates toward.
    const from = lockFrom.current
    lockFrom.current = null
    if (!from?.box) return
    const el = els.current.get(from.id)
    if (el) playLockOn(el, from.box, enlargedId === from.id)
  }, [enlargedId])

  /**
   * While one window fills the browser window, only that window decodes.
   *
   * Everything else — the other two windows, the explorer preview, whatever the
   * backdrop is doing — is behind an opaque picture and a blurred scrim, so its
   * frames are being decoded, composited and blurred for pixels nobody can see.
   * Three of the four decodes measured with a full desktop are exactly that.
   *
   * The cap PAUSES the surplus rather than releasing it, which is why this is
   * cheap to reverse: a paused file holds its frame and its playhead and resumes
   * in place, where a released one drops its `src` and restarts from zero (see
   * `releaseFile`). Nothing about placement or layout changes, so coming back down
   * has nothing to rebuild.
   */
  useEffect(() => {
    director.setMaxPlaying(enlargedId ? 1 : MAX_PLAYING)
  }, [director, enlargedId])

  const closeNow = useCallback((id: string) => {
    // Or the id would outlive its window and re-enlarge the next window to reuse
    // it — the slot is recycled, and this state is keyed by id.
    setEnlargedId((cur) => (cur === id ? null : cur))
    scopes.current.get(id)?.revert()
    scopes.current.delete(id)
    nodes.current.delete(id)
    els.current.delete(id)
    bodyRefs.current.delete(id)
    // Closing is a reconcile, not an inverse animation. It runs synchronously
    // BEFORE setWindows so React never unmounts a body that still contains the
    // node: either a live slot still wants the file (it moves there, instantly,
    // re-tiered) or it is released.
    const remaining = windowsRef.current.filter((w) => w.id !== id)
    const { isDesktop: onDesktop, tier: curTier } = envRef.current
    const next = desiredFor(selectedRef.current, remaining, onDesktop, curTier)
    media.reconcile(next.desired, { animate: false, focus: next.focus })
    setWindows((cur) => closeWindow(cur, id))
  }, [media])

  /**
   * Closing is two beats: the window is pulled back into the background, then it
   * is actually closed. Deferred rather than animated-on-the-way-out, because the
   * media node inside it belongs to the controller and `closeWindow` reconciles
   * it away synchronously — start that first and the animation would be playing
   * on a window whose contents had already left.
   */
  const requestClose = useCallback((id: string) => {
    if (prefersReducedMotion()) { closeNow(id); return }
    setReceding((cur) => (cur.includes(id) ? cur : [...cur, id]))
    window.setTimeout(() => {
      closeNow(id)
      setReceding((cur) => cur.filter((x) => x !== id))
    }, RECEDE_MS)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])


  // Drag wiring. createScope gives us the React-ref root, the desktop/mobile
  // split as a media query, and automatic teardown of the draggable.
  //
  // File windows only. The terminal/explorer is a fixed background layer with no
  // drag, no z-rank and no focus rank (binding ruling 7), so there is no longer
  // any caller that needs "grabbing must not focus".
  const attachDrag = useCallback((id: string, el: HTMLElement | null) => {
    if (!el) return
    els.current.set(id, el)
    // No draggable exists while this window is enlarged — see `toggleEnlarge` for
    // why it is torn down. `registerEl` refires on every render, so without this
    // guard the very next render would quietly wire a new one, observer and all.
    if (enlargedRef.current === id) return
    // The ref callbacks below are inline arrows, so React detaches and re-attaches
    // them on every render. Key the guard on the node rather than on "have I ever
    // wired this id", so a re-render is a no-op but a swapped node re-wires — and
    // the previous draggable is reverted so nothing stays bound to a detached node.
    if (nodes.current.get(id) === el) return
    // React attaches child refs before parent refs, so rootRef can still be null on
    // the commit that mounts the desktop and the first window together. Every
    // window root is a direct child of .desktop, so its parent is that same element.
    const root = rootRef.current ?? el.parentElement
    if (!root) return
    scopes.current.get(id)?.revert()
    scopes.current.delete(id)
    nodes.current.set(id, el)
    const scope = createScope({ root, mediaQueries: { desktop: '(min-width: 861px)' } })
      .add((self) => {
        if (!self?.matches.desktop) return
        const reduce = prefersReducedMotion()
        const drag = createDraggable(el, {
          trigger: el.querySelector('[data-drag-handle]') as HTMLElement,
          container: root,
          containerPadding: -24,
          containerFriction: 0.82,
          // below containerFriction ⇒ the window overshoots and springs back
          releaseContainerFriction: reduce ? 1 : 0.55,
          releaseEase: reduce ? 'outQuad' : createSpring({ stiffness: 120, damping: 14 }),
          onGrab: () => setWindows((cur) => focusWindow(cur, id)),
        })
        // Kept so enlarging can put the drag back where it found it — see
        // `toggleEnlarge`. anime.js is the only holder of a dragged window's
        // position, so nothing else can restore it.
        drags.current.set(id, drag)
        return () => { drags.current.delete(id); drag.revert() }
      })
    scopes.current.set(id, scope)
  }, [])

  // The application's single window-level keydown listener (§4.6). It handles
  // only the two genuinely global keys and both consult the same guard, so
  // holding the volume slider and nudging it with the keyboard no longer
  // switches tabs and unmounts the panel underneath the control.
  // ArrowUp/ArrowDown/Enter are local to the explorer's row list by design.
  // Esc closes the focused window; the explorer is not a window and is
  // unreachable from here.
  //
  // Esc on an ENLARGED window brings it back down instead, and only then closes
  // it on a second press. Escape means "undo the last thing that took over the
  // screen", and one key doing both steps in order is why this state lives up here
  // rather than in the window: two listeners would race and the window would
  // shrink and close on the same press.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (isInteractiveTarget(e)) return
      if (e.key === 'ArrowLeft') { onTabShift?.(-1); return }
      if (e.key === 'ArrowRight') { onTabShift?.(1); return }
      if (e.key !== 'Escape' || !focusedId) return
      // Through the toggle, not straight to state: the keyboard gets the same
      // beat, and the same drag-offset restore, as the button.
      if (enlargedId === focusedId) { toggleEnlarge(focusedId); return }
      requestClose(focusedId)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [focusedId, enlargedId, requestClose, toggleEnlarge, onTabShift])

  useEffect(() => () => window.clearTimeout(refusalTimer.current), [])

  useEffect(() => () => media.dispose(), [media])

  const setVolume = useCallback((id: string, v: number) => {
    media.setVolume(id, v)
    // Mirrored into React state only so the control re-renders; the controller
    // record is the source of truth and survives the window closing.
    setVolumes((cur) => ({ ...cur, [id]: media.stateOf(id).volume }))
  }, [media])

  const flash = useCallback((el: HTMLDivElement | null) => {
    refusalRef.current = el
    if (el) playRefusal(el)
  }, [])

  // The one reconcile that drives the app, and deliberately without a dependency
  // array: refs commit before layout effects, so every slot this render wants is
  // registered by the time the desired map is handed over — including the body
  // of a window that mounted in this very commit. A pass where nothing actually
  // moved is a no-op inside the controller.
  useLayoutEffect(() => {
    const next = desiredFor(selectedId, windows, isDesktop, tier)
    media.reconcile(next.desired, { animate: true, focus: next.focus })
  })

  const focus = useCallback((id: string) => setWindows((cur) => focusWindow(cur, id)), [])

  // `nodes` is a ref, so this identity is stable and reading it always sees the
  // element currently mounted for that id.
  const windowNode = useCallback((id: string) => els.current.get(id) ?? null, [])

  // Top of the stack first, so the dashboard's reading order is the screen's
  // depth order. Volume comes from the controller record rather than `volumes`
  // alone: that mirror is only populated once a window's slider has been
  // touched, and an untouched window still has a real volume.
  const openWindows = useMemo<OpenWindowInfo[]>(
    () =>
      [...windows]
        .sort((a, b) => b.z - a.z)
        .map((w) => ({
          id: w.id,
          slot: w.slot,
          z: w.z,
          x: w.x,
          y: w.y,
          focused: w.id === focusedId,
          volume: volumes[w.id] ?? media.stateOf(w.id).volume,
        })),
    [windows, focusedId, volumes, media],
  )

  // Handed UP, never reached down for: the explorer is forbidden from importing
  // DesktopContext (selection contract rule 1), so what is open travels the same
  // way the opener does — into a registry that sits above this component.
  const publishWindows = usePublishWindows()
  const view = useMemo<WindowView>(
    () => ({ windows: openWindows, enlargedId, focus, close: requestClose, node: windowNode }),
    [openWindows, enlargedId, focus, requestClose, windowNode],
  )
  useEffect(() => {
    publishWindows(view)
    // Desktop outlives every surface that reads this, but it does unmount on a
    // reload boundary in tests; leaving a stale list behind would outlive it.
    return () => publishWindows(EMPTY_WINDOW_VIEW)
  }, [publishWindows, view])

  const api = useMemo<DesktopApi>(() => ({ open }), [open])

  return (
    <DesktopContext.Provider value={api}>
      <MediaControllerProvider value={media}>
        {/* `data-enlarged` is on the desktop as well as on the window: the scrim
            that dims and blurs everything behind an enlarged window is one layer
            under it, not something each window can own, because only one window
            is ever enlarged. */}
        <div
          className="desktop"
          ref={rootRef}
          data-refusing={refusing ? 'true' : undefined}
          data-enlarged={enlargedId ? 'true' : undefined}
        >
          <MediaLayer controller={media} />
          {children}
          {windows.map((w) => {
            const file = fileById(w.id)
            if (!file) return null
            return (
              <FileWindow
                key={w.id}
                file={file}
                x={w.x} y={w.y} z={w.z}
                focused={focusedId === w.id}
                receding={receding.includes(w.id)}
                enlarged={enlargedId === w.id}
                // Hydrated from the controller record, which outlives the window:
                // adopting a node already at 0.6 renders VOL 060, not 000.
                volume={volumes[w.id] ?? media.stateOf(w.id).volume}
                onVolume={(v) => setVolume(w.id, v)}
                onFocus={() => setWindows((cur) => focusWindow(cur, w.id))}
                onClose={() => requestClose(w.id)}
                onToggleEnlarge={() => toggleEnlarge(w.id)}
                registerEl={(el) => attachDrag(w.id, el)}
                bodyRef={bodyRefFor(w.id)}
              />
            )
          })}
          {refusing && (
            <div className="refusal" data-refusal ref={flash} aria-hidden="true">
              <div className="refusal-text">BUFFER FULL</div>
            </div>
          )}
          <div className="sr-only" data-live-region role="status" aria-live="assertive">{live}</div>
        </div>
      </MediaControllerProvider>
    </DesktopContext.Provider>
  )
}
