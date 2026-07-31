import { createContext, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { createScope, createDraggable, createSpring, animate } from 'animejs'
import { ARCHIVE } from '../data/archive'
import { openWindow, focusWindow, closeWindow, cascadePosition, type WinState } from '../lib/windowManager'
import { prefersReducedMotion } from '../lib/perfTier'
import FileWindow from './FileWindow'

export type DesktopApi = {
  open: (id: string) => void
  /** the explorer is a window too: it drags, but has no close control */
  registerTerminal: (el: HTMLElement | null) => void
}

export const DesktopContext = createContext<DesktopApi>({ open: () => {}, registerTerminal: () => {} })

const TERMINAL_ID = '__terminal__'
const REFUSAL_MS = 450

function playRefusal(el: HTMLElement) {
  // reduced motion: opacity only, no white flash. the two children carry their own
  // `opacity: 0` in css, so the type has to be driven directly — animating the
  // container alone would fade a box whose contents stay invisible.
  if (prefersReducedMotion()) {
    animate(el.querySelector('.refusal-text')!, { opacity: [0, 1, 0], duration: REFUSAL_MS, ease: 'linear' })
    return
  }
  animate(el.querySelector('.refusal-flash')!, { opacity: [0, 0.85, 0], duration: 420, ease: 'outQuad' })
  animate(el.querySelector('.refusal-text')!, { opacity: [0, 1, 0], scale: [1.04, 1], duration: REFUSAL_MS, ease: 'outQuad' })
}

export default function Desktop({ children }: { children: ReactNode }) {
  const [windows, setWindows] = useState<WinState[]>([])
  const [refusing, setRefusing] = useState(false)
  const rootRef = useRef<HTMLDivElement | null>(null)
  const nodes = useRef(new Map<string, HTMLElement>())
  const bodies = useRef(new Map<string, HTMLDivElement>())
  const scopes = useRef(new Map<string, { revert: () => void }>())
  const refusalRef = useRef<HTMLDivElement | null>(null)
  const refusalTimer = useRef<number | undefined>(undefined)

  const focusedId = useMemo(
    () => windows.reduce<WinState | null>((top, w) => (!top || w.z > top.z ? w : top), null)?.id ?? null,
    [windows],
  )

  const refuse = useCallback(() => {
    // a refusal landing while the previous one is still on screen replays the flash:
    // the element stays mounted, so its ref callback would not fire a second time.
    if (refusalRef.current) playRefusal(refusalRef.current)
    setRefusing(true)
    window.clearTimeout(refusalTimer.current)
    refusalTimer.current = window.setTimeout(() => setRefusing(false), REFUSAL_MS)
  }, [])

  const open = useCallback((id: string) => {
    setWindows((cur) => {
      const area = { w: window.innerWidth, h: window.innerHeight }
      // cascadePosition only keeps a window in bounds while size <= area, so the
      // window box is clamped against the viewport before it is handed over.
      const size = { w: Math.min(720, area.w * 0.52), h: Math.min(405, area.h * 0.52) }
      const result = openWindow(cur, id, cascadePosition(cur.length, area, size))
      if (!result.ok) {
        refuse()
        return cur
      }
      return result.windows
    })
  }, [refuse])

  const close = useCallback((id: string) => {
    scopes.current.get(id)?.revert()
    scopes.current.delete(id)
    nodes.current.delete(id)
    bodies.current.delete(id)
    setWindows((cur) => closeWindow(cur, id))
  }, [])

  // Drag wiring. createScope gives us the React-ref root, the desktop/mobile
  // split as a media query, and automatic teardown of the draggable.
  const attachDrag = useCallback((id: string, el: HTMLElement | null) => {
    if (!el) return
    // The ref callbacks below are inline arrows, so React detaches and re-attaches
    // them on every render. Key the guard on the node rather than on "have I ever
    // wired this id", so a re-render is a no-op but a swapped node re-wires — and
    // the previous draggable is reverted so nothing stays bound to a detached node.
    if (nodes.current.get(id) === el) return
    // React attaches child refs before parent refs, so rootRef can still be null on
    // the commit that mounts the desktop and the terminal window together. Every
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

  const registerTerminal = useCallback((el: HTMLElement | null) => { attachDrag(TERMINAL_ID, el) }, [attachDrag])

  // spec: Esc closes the focused window. focusedId is derived from `windows`, which
  // never holds TERMINAL_ID, so the explorer is unreachable from here.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || !focusedId) return
      close(focusedId)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [focusedId, close])

  useEffect(() => () => window.clearTimeout(refusalTimer.current), [])

  const flash = useCallback((el: HTMLDivElement | null) => {
    refusalRef.current = el
    if (el) playRefusal(el)
  }, [])

  const api = useMemo<DesktopApi>(() => ({ open, registerTerminal }), [open, registerTerminal])

  return (
    <DesktopContext.Provider value={api}>
      <div className="desktop" ref={rootRef}>
        {children}
        {windows.map((w) => {
          const file = ARCHIVE.find((f) => f.id === w.id)
          if (!file) return null
          return (
            <FileWindow
              key={w.id}
              file={file}
              x={w.x} y={w.y} z={w.z}
              focused={focusedId === w.id}
              onFocus={() => setWindows((cur) => focusWindow(cur, w.id))}
              onClose={() => close(w.id)}
              registerEl={(el) => attachDrag(w.id, el)}
              bodyRef={(el) => { if (el) bodies.current.set(w.id, el); else bodies.current.delete(w.id) }}
            />
          )
        })}
        {refusing && (
          <div className="refusal" data-refusal ref={flash} aria-live="assertive">
            <div className="refusal-flash" />
            <div className="refusal-text">BUFFER FULL</div>
          </div>
        )}
      </div>
    </DesktopContext.Provider>
  )
}
