import { useState } from 'react'
import ArchiveStack from './ArchiveStack'
import ArchiveGrid from './ArchiveGrid'
import type { PerfTier } from '../lib/perfTier'

const KEY = 'severedarchive.archiveView'
type View = 'stack' | 'grid'

function initialView(): View {
  try { return localStorage.getItem(KEY) === 'grid' ? 'grid' : 'stack' } catch { return 'stack' }
}

export default function ArchivePanel({ tier, onFrontChange }: { tier: PerfTier; onFrontChange: (id: string) => void }) {
  const [view, setView] = useState<View>(initialView)
  const pick = (v: View) => { setView(v); try { localStorage.setItem(KEY, v) } catch { /* private mode */ } }
  return (
    <div className="panel archive-panel">
      <div className="view-toggle">
        <button aria-label="Stack view" className={view === 'stack' ? 'is-active' : ''} onClick={() => pick('stack')}>STACK</button>
        <button aria-label="Grid view" className={view === 'grid' ? 'is-active' : ''} onClick={() => pick('grid')}>GRID</button>
      </div>
      {view === 'stack' ? <ArchiveStack tier={tier} onFrontChange={onFrontChange} /> : <ArchiveGrid tier={tier} />}
    </div>
  )
}
