import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { createDraggable } from 'animejs'
import { ARCHIVE, type ArchiveFile } from '../data/archive'
import { ADMIN_API } from '../lib/adminSession'
import EntryFields, { UploadLimitsHint, nameFromFile, type EntryDraft } from './EntryFields'

/**
 * What an authenticated admin gets on an entry that already exists: its fields,
 * its file, and the option to take it out of the archive.
 *
 * The same shape as the publish panel — same fields, same drag behaviour, same
 * habit of reporting what the backend actually said — with two differences that
 * matter:
 *
 * - It opens PRE-FILLED from the entry, because an editor that starts empty is
 *   a form that silently blanks everything you do not retype.
 * - Removal is destructive against committed media, so it asks for the name to
 *   be typed back. That is not friction for its own sake: the edit run deletes
 *   three renditions and there is no undo in this interface.
 */
type Status = { kind: 'idle' | 'busy' | 'ok' | 'error'; message?: string }

const draftFrom = (file: ArchiveFile): EntryDraft => ({
  name: file.name,
  kind: file.kind,
  tagline: file.tagline,
  description: file.description ?? '',
  // The original twelve carry a year and no day (see `ArchiveEntry.date`). The
  // field needs a real date, so their year is offered as its first of January —
  // visibly a placeholder to correct, not a claim about when it was made.
  date: file.date ?? `${file.year}-01-01`,
  postUrl: file.postUrl,
})

export default function EntryEditPanel({ file, onClose }: { file: ArchiveFile; onClose: () => void }) {
  const [draft, setDraft] = useState<EntryDraft>(() => draftFrom(file))
  const [replacement, setReplacement] = useState<File | null>(null)
  const [status, setStatus] = useState<Status>({ kind: 'idle' })
  const [confirming, setConfirming] = useState(false)
  const [confirm, setConfirm] = useState('')
  const panelRef = useRef<HTMLDivElement | null>(null)

  // Draggable by its header, like the publish panel and every file window: it
  // covers the thing it is editing, and being able to shove it aside to look at
  // that is the point.
  useEffect(() => {
    const panel = panelRef.current
    if (!panel) return
    const drag = createDraggable(panel, {
      trigger: panel.querySelector('[data-admin-drag]') as HTMLElement,
      container: document.body,
      containerPadding: -260,
    })
    return () => { drag.revert() }
  }, [])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      // Swallowed: the desktop's global Escape closes the focused window, and
      // dismissing this must not also close the window being edited.
      e.stopPropagation()
      onClose()
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [onClose])

  const save = async (e: React.FormEvent) => {
    e.preventDefault()
    setStatus({ kind: 'busy', message: replacement ? 'STAGING REPLACEMENT' : 'SAVING' })
    const form = new FormData()
    form.set('name', draft.name)
    form.set('kind', draft.kind)
    form.set('tagline', draft.tagline)
    form.set('description', draft.description)
    form.set('date', draft.date)
    form.set('postUrl', draft.postUrl)
    // So the Worker can tell "renamed onto another entry" from "unchanged".
    form.set('currentName', file.name)
    form.set('existingNames', JSON.stringify(ARCHIVE.map((f) => f.name)))
    if (replacement) form.set('file', replacement)
    try {
      const res = await fetch(`${ADMIN_API}/api/entry/${encodeURIComponent(file.id)}`, {
        method: 'POST', credentials: 'include', body: form,
      })
      const body = await res.json().catch(() => ({}))
      if (res.status === 202) {
        setStatus({
          kind: 'ok',
          message: replacement
            ? 'SAVED. TRANSCODE AND DEPLOY RUNNING — A FEW MINUTES.'
            : 'SAVED. DEPLOY RUNNING — A MINUTE OR TWO.',
        })
        setReplacement(null)
      } else if (res.status === 422) {
        setStatus({ kind: 'error', message: (body.details ?? ['INVALID ENTRY']).join(' · ').toUpperCase() })
      } else if (res.status === 401) {
        setStatus({ kind: 'error', message: 'SESSION EXPIRED. LOG IN AGAIN.' })
      } else if (res.status === 413) {
        setStatus({ kind: 'error', message: 'FILE IS TOO LARGE' })
      } else {
        setStatus({ kind: 'error', message: `REFUSED (${res.status})` })
      }
    } catch {
      setStatus({ kind: 'error', message: 'BACKEND UNREACHABLE' })
    }
  }

  const remove = async () => {
    setStatus({ kind: 'busy', message: 'REMOVING' })
    try {
      const res = await fetch(`${ADMIN_API}/api/entry/${encodeURIComponent(file.id)}`, {
        method: 'DELETE',
        credentials: 'include',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name: file.name, confirm }),
      })
      if (res.status === 202) {
        setStatus({ kind: 'ok', message: 'REMOVED. DEPLOY RUNNING — A MINUTE OR TWO.' })
        setConfirming(false)
        setConfirm('')
      } else if (res.status === 422) {
        setStatus({ kind: 'error', message: 'NAME DOES NOT MATCH' })
      } else if (res.status === 401) {
        setStatus({ kind: 'error', message: 'SESSION EXPIRED. LOG IN AGAIN.' })
      } else {
        setStatus({ kind: 'error', message: `REFUSED (${res.status})` })
      }
    } catch {
      setStatus({ kind: 'error', message: 'BACKEND UNREACHABLE' })
    }
  }

  /**
   * Both admin panels are portalled to `document.body`.
   *
   * They are `position: fixed` with a high z-index, which reads as "above
   * everything" and is not: z-index only orders siblings within a stacking
   * context, and these were rendered inside one — the publish panel inside the
   * terminal, the editor inside the file window it edits. So they painted under
   * other chrome, and `elementFromPoint` over the panel's own header answered with
   * the desktop. The visible symptom was that neither panel could be dragged: the
   * pointerdown never reached the drag handle. A file window is worse still, since
   * it takes a `clip-path` while it dissolves, and a clip applies to fixed
   * descendants too.
   *
   * A portal keeps them in the React tree that owns their state — the window still
   * knows which file it is — while taking them out of that context in the DOM.
   */
  return createPortal(
    <div className="admin-panel glass" ref={panelRef} role="dialog" aria-label={`Edit ${file.name}`}>
      <header className="admin-head" data-admin-drag>
        <span className="admin-title">EDIT</span>
        <span className="admin-subject tw-dim">{file.name}.{file.ext}</span>
        <button className="admin-close" onClick={onClose} aria-label="Close editor">✕</button>
      </header>

      <form className="admin-body" onSubmit={save}>
        <EntryFields
          draft={draft}
          onChange={setDraft}
          nameHint="DISPLAY NAME ONLY — THE FILE'S ID AND URLS DO NOT CHANGE"
        />
        <label className="admin-field admin-field-wide"><span>REPLACE FILE</span>
          <input
            type="file"
            accept="video/*,image/*"
            onChange={(e) => {
              const picked = e.target.files?.[0] ?? null
              setReplacement(picked)
              // Offered, not imposed: the name is an existing entry's and
              // changing it is a decision, so this only fills an empty field.
              if (picked && !draft.name) setDraft({ ...draft, name: nameFromFile(picked.name) })
              if (picked?.type.startsWith('image/')) setDraft((d) => ({ ...d, kind: 'photo' }))
            }}
          />
          <em className="admin-note">
            {replacement ? 'THE CURRENT RENDITIONS WILL BE OVERWRITTEN' : 'LEAVE EMPTY TO KEEP THE CURRENT FILE'}
          </em>
        </label>
        <UploadLimitsHint file={replacement} />
        <button className="admin-submit" type="submit" disabled={status.kind === 'busy'}>
          {status.kind === 'busy' ? '···' : 'SAVE'}
        </button>
      </form>

      <div className="admin-danger">
        {!confirming ? (
          <button className="admin-remove" onClick={() => setConfirming(true)}>REMOVE FROM ARCHIVE</button>
        ) : (
          <div className="admin-confirm">
            <label className="admin-field admin-field-wide">
              <span>TYPE {file.name} TO REMOVE</span>
              <input value={confirm} onChange={(e) => setConfirm(e.target.value)} autoFocus />
            </label>
            <p className="admin-note">THIS DELETES THE FILE'S RENDITIONS. THERE IS NO UNDO HERE.</p>
            <div className="admin-confirm-row">
              <button
                className="admin-remove"
                onClick={remove}
                // Checked here as well as by the Worker, so the button that
                // cannot succeed also cannot be pressed.
                disabled={status.kind === 'busy' || confirm.trim().toUpperCase() !== file.name}
              >
                CONFIRM REMOVAL
              </button>
              <button className="admin-cancel" onClick={() => { setConfirming(false); setConfirm('') }}>
                CANCEL
              </button>
            </div>
          </div>
        )}
      </div>

      {status.message && (
        <p className="admin-status" data-kind={status.kind} role="status">&gt; {status.message}</p>
      )}
    </div>,
    document.body,
  )
}
