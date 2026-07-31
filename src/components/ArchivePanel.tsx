import ArchiveExplorer from './ArchiveExplorer'
import ArchiveGrid from './ArchiveGrid'
import { useArchiveSelection } from '../lib/selection'

export default function ArchivePanel() {
  // View mode lives above this panel, so a trip to ABOUT and back no longer
  // resets it — and neither does the ARCHIVE panel remounting for any other
  // reason. Persistence and the legacy `stack` → `list` migration live with it.
  const { view, setView } = useArchiveSelection()
  return (
    <div className="panel archive-panel">
      <div className="view-toggle">
        <button aria-label="List view" className={view === 'list' ? 'is-active' : ''} onClick={() => setView('list')}>LIST</button>
        <button aria-label="Grid view" className={view === 'grid' ? 'is-active' : ''} onClick={() => setView('grid')}>GRID</button>
      </div>
      {/* relative wrapper: ArchiveGrid's .panel positions absolute against it
          instead of blanketing the whole archive-panel (which hid the toggle) */}
      <div className="archive-panel-body">
        {view === 'grid' ? <ArchiveGrid /> : <ArchiveExplorer />}
      </div>
    </div>
  )
}
