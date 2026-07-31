import ArchiveStack from './ArchiveStack'
import ArchiveGrid from './ArchiveGrid'
import { useArchiveSelection } from '../lib/selection'
import type { PerfTier } from '../lib/perfTier'

export default function ArchivePanel({ tier, onFrontChange }: { tier: PerfTier; onFrontChange: (id: string) => void }) {
  // View mode lives above this panel, so a trip to ABOUT and back no longer
  // resets it — and neither does the ARCHIVE panel remounting for any other
  // reason. Persistence and the legacy `stack` → `list` migration live with it.
  const { view, setView } = useArchiveSelection()
  return (
    <div className="panel archive-panel">
      <div className="view-toggle">
        <button aria-label="Stack view" className={view === 'list' ? 'is-active' : ''} onClick={() => setView('list')}>STACK</button>
        <button aria-label="Grid view" className={view === 'grid' ? 'is-active' : ''} onClick={() => setView('grid')}>GRID</button>
      </div>
      {/* relative wrapper: ArchiveGrid's .panel positions absolute against it
          instead of blanketing the whole archive-panel (which hid the toggle) */}
      <div className="archive-panel-body">
        {view === 'grid' ? <ArchiveGrid tier={tier} /> : <ArchiveStack tier={tier} onFrontChange={onFrontChange} />}
      </div>
    </div>
  )
}
