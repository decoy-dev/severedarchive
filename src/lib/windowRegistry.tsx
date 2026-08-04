import { createContext, useCallback, useContext, useState, type ReactNode } from 'react'

/**
 * One open window, flattened for read-only surfaces: `WinState` plus the two
 * facts that live outside it (whether it is the top window, and the volume the
 * controller holds).
 */
export type OpenWindowInfo = {
  id: string
  slot: number
  z: number
  x: number
  y: number
  focused: boolean
  volume: number
}

export type WindowView = {
  /** Open windows, top of the z-stack first. */
  windows: readonly OpenWindowInfo[]
  /** Raise a window that is already open. No-op for an id that is not. */
  focus: (id: string) => void
  close: (id: string) => void
  /**
   * The window's root element, by id, for read-only sampling — the dashboard
   * reads its live rect so POS and SIZE track a drag as it happens. anime moves
   * the node by transform and never tells React, so `OpenWindowInfo.x/y` is the
   * spawn position and stays that way; this is the only way to see the truth.
   */
  node: (id: string) => HTMLElement | null
}

const noop = () => {}
const EMPTY: WindowView = { windows: [], focus: noop, close: noop, node: () => null }

/**
 * What is open, published UP by Desktop and read by surfaces below it.
 *
 * This exists because the explorer must not import `DesktopContext` — selection
 * contract rule 1, the same rule that makes `Desktop` hand its opener up to the
 * activation policy instead of letting `ArchiveExplorer` reach down for it. The
 * dashboard needs the window list, and the honest way to get it is the way the
 * opener already travels: the provider sits ABOVE Desktop, Desktop writes into
 * it, and anything under it reads. Nothing below Desktop depends on Desktop.
 *
 * Two contexts, not one: the publisher is stable for the life of the provider,
 * so `Desktop` re-rendering does not follow from its own write, and readers
 * re-render only when the view actually changes.
 */
const ViewContext = createContext<WindowView>(EMPTY)
const PublishContext = createContext<(view: WindowView) => void>(noop)

export function WindowRegistryProvider({ children }: { children: ReactNode }) {
  const [view, setView] = useState<WindowView>(EMPTY)
  // Identity-stable: `Desktop` publishes from an effect keyed on this, so a
  // changing publisher would be an infinite loop rather than a subscription.
  const publish = useCallback((next: WindowView) => setView(next), [])
  return (
    <PublishContext.Provider value={publish}>
      <ViewContext.Provider value={view}>{children}</ViewContext.Provider>
    </PublishContext.Provider>
  )
}

/** For surfaces that read: the explorer's dashboard. */
export function useWindowView(): WindowView {
  return useContext(ViewContext)
}

/** For Desktop, which owns the state and hands it up. */
export function usePublishWindows(): (view: WindowView) => void {
  return useContext(PublishContext)
}

export const EMPTY_WINDOW_VIEW = EMPTY
