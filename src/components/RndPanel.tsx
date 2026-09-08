import { lazy, Suspense, useCallback, useRef, useState } from 'react'
import type { OpenOrigin } from '../lib/openFrom'
import { useAdminSession } from '../lib/adminSession'
import { RND, type RndFile } from '../data/rnd'
import RndGrid from './RndGrid'
import RndLightbox from './RndLightbox'

/**
 * Code-split like the archive's admin surface: the R&D edit panel is for one
 * person and every other visitor was shipping it. It opens from a deliberate
 * owner click (the focus-view EDIT), where a beat before the form is
 * imperceptible. New R&D entries are published from the admin console's R+D
 * tab — this panel only edits and removes what already exists.
 */
const RndAdminPanel = lazy(() => import('./RndAdminPanel'))

/**
 * The R&D tab: a scrolling wall of experiments that opens into a focused view.
 *
 * All of its state is local — the focused index, the origin the focus grew from,
 * and (owner only) which entry the admin panel is editing. It reaches into no
 * window manager and holds no route; switching tabs unmounts it and the focus
 * with it, the same independence the archive grid keeps.
 */
export default function RndPanel() {
  const { authed } = useAdminSession()
  const [focused, setFocused] = useState<number | null>(null)
  const originRef = useRef<OpenOrigin | null>(null)
  // The admin editor: `null` closed, otherwise the entry being edited.
  const [editor, setEditor] = useState<RndFile | null>(null)

  const open = useCallback((index: number, origin: OpenOrigin) => {
    originRef.current = origin
    setFocused(index)
  }, [])
  const close = useCallback(() => setFocused(null), [])
  const onEdit = useCallback((file: RndFile) => { setFocused(null); setEditor(file) }, [])

  const empty = RND.length === 0

  return (
    <div className="panel rnd-panel">
      <div className="rnd-scroll">
        <header className="rnd-head">
          <div className="rnd-head-line">
            <h2 className="rnd-head-title">R+D — RESEARCH + DEVELOPMENT</h2>
            <span className="rnd-head-count">{String(RND.length).padStart(2, '0')} INDEXED</span>
          </div>
          <p className="rnd-head-sub">
            &gt; EXPERIMENTS, SIDE QUESTS, PROOF OF LIFE AND CONCEPTS.
            {empty && <span className="rnd-head-pending"> FIRST TRANSMISSION PENDING.</span>}
          </p>
        </header>
        <RndGrid onOpen={open} />
      </div>

      {focused !== null && (
        <RndLightbox
          items={RND}
          startIndex={focused}
          origin={originRef.current}
          authed={authed}
          onEdit={onEdit}
          onClose={close}
        />
      )}

      {editor && (
        <Suspense fallback={null}>
          <RndAdminPanel file={editor} onClose={() => setEditor(null)} />
        </Suspense>
      )}
    </div>
  )
}
