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
import { DISSOLVE_MS } from '../lib/dissolve'
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
  const media = useMemo(
    () => createMediaController({ animateMove: flipMove, director: new VideoDirector(MAX_PLAYING) }),
    [],
  )
  const [volumes, setVolumes] = useState<Record<string, number>>({})
  const rootRef = useRef<HTMLDivElement | null>(null)
  const nodes = useRef(new Map<string, HTMLElement>())
  const scopes = useRef(new Map<string, { revert: () => void }>())
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
   * Windows mid-dissolve. They are still mounted and still hold their media —
   * the close is deferred, not faked, so nothing is torn out from under the
   * animation. Kept in state because the window has to re-render to paint.
   */
  const [dissolving, setDissolving] = useState<readonly string[]>([])

  const closeNow = useCallback((id: string) => {
    scopes.current.get(id)?.revert()
    scopes.current.delete(id)
    nodes.current.delete(id)
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
   * Closing is two beats now: the window dissolves where it stands, then it is
   * actually closed. Deferred rather than animated-on-the-way-out, because the
   * media node inside it belongs to the controller and `closeWindow` reconciles
   * it away synchronously — start that first and the dissolve would be painting
   * over a window whose contents had already left.
   */
  const requestClose = useCallback((id: string) => {
    if (prefersReducedMotion()) { closeNow(id); return }
    setDissolving((cur) => (cur.includes(id) ? cur : [...cur, id]))
    window.setTimeout(() => {
      closeNow(id)
      setDissolving((cur) => cur.filter((x) => x !== id))
    }, DISSOLVE_MS)
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
        return () => drag.revert()
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
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (isInteractiveTarget(e)) return
      if (e.key === 'ArrowLeft') { onTabShift?.(-1); return }
      if (e.key === 'ArrowRight') { onTabShift?.(1); return }
      if (e.key === 'Escape' && focusedId) requestClose(focusedId)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [focusedId, requestClose, onTabShift])

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
  const windowNode = useCallback((id: string) => nodes.current.get(id) ?? null, [])

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
    () => ({ windows: openWindows, focus, close: requestClose, node: windowNode }),
    [openWindows, focus, requestClose, windowNode],
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
        <div className="desktop" ref={rootRef} data-refusing={refusing ? 'true' : undefined}>
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
                dissolving={dissolving.includes(w.id)}
                // Hydrated from the controller record, which outlives the window:
                // adopting a node already at 0.6 renders VOL 060, not 000.
                volume={volumes[w.id] ?? media.stateOf(w.id).volume}
                onVolume={(v) => setVolume(w.id, v)}
                onFocus={() => setWindows((cur) => focusWindow(cur, w.id))}
                onClose={() => requestClose(w.id)}
                registerEl={(el) => attachDrag(w.id, el)}
                bodyRef={(el) => media.registerSlot(`window:${w.id}`, el)}
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
