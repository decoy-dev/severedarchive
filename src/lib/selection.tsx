import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from 'react'
import { DEFAULT_FRONT_ID } from '../data/archive'
import { applyActivation, readView, writeView, type ActivationVia, type ViewMode } from './activation'

/**
 * Owns which file is selected, what activating a file means, and the list/grid
 * view mode — above the ARCHIVE panel, so a tab switch or a view switch cannot
 * reset either. (Today's code loses the stack front, and therefore the backdrop,
 * on a trip to ABOUT and back.)
 */
export type ArchiveSelectionApi = {
  /** what the preview pane, the backdrop and the mobile primary player show */
  selectedId: string
  /** hover, roving focus, arrow keys, mobile tap. Changes what is shown. Never opens anything. */
  select: (id: string) => void
  /** click, Enter, tap. The commit. Always selects first, then applies the activation policy. */
  activate: (id: string, via: ActivationVia) => void
  view: ViewMode
  setView: (v: ViewMode) => void
  /**
   * Desktop hands its opener up on mount. The provider sits above Desktop, so
   * this inversion is what lets one activation policy reach `open` without any
   * surface importing DesktopContext.
   */
  registerOpener: (open: ((id: string) => void) | null) => void
}

const noop = () => {}

const ArchiveSelectionContext = createContext<ArchiveSelectionApi>({
  selectedId: DEFAULT_FRONT_ID,
  select: noop,
  activate: noop,
  view: 'list',
  setView: noop,
  registerOpener: noop,
})

export function ArchiveSelectionProvider({ children }: { children: ReactNode }) {
  const [selectedId, setSelectedId] = useState(DEFAULT_FRONT_ID)
  const [view, setViewState] = useState<ViewMode>(readView)
  const opener = useRef<((id: string) => void) | null>(null)

  const select = useCallback((id: string) => setSelectedId(id), [])

  const setView = useCallback((v: ViewMode) => {
    setViewState(v)
    writeView(v)
  }, [])

  const registerOpener = useCallback((open: ((id: string) => void) | null) => {
    opener.current = open
  }, [])

  const activate = useCallback((id: string, via: ActivationVia) => {
    setSelectedId(id)
    applyActivation(id, via, window.innerWidth, { setView, open: opener.current })
  }, [setView])

  const api = useMemo<ArchiveSelectionApi>(
    () => ({ selectedId, select, activate, view, setView, registerOpener }),
    [selectedId, select, activate, view, setView, registerOpener],
  )

  return <ArchiveSelectionContext.Provider value={api}>{children}</ArchiveSelectionContext.Provider>
}

export function useArchiveSelection(): ArchiveSelectionApi {
  return useContext(ArchiveSelectionContext)
}
