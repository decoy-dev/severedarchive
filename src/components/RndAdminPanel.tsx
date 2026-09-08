import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { createDraggable } from 'animejs'
import { ADMIN_API } from '../lib/adminSession'
import { DEFAULT_THUMB, serialiseThumb } from '../lib/thumbCrop'
import { watchForDeploy } from '../lib/deployWatch'
import EntryFields, { FilePicker, UploadLimitsHint, type EntryDraft } from './EntryFields'
import { RND, type RndFile } from '../data/rnd'

/**
 * The owner's edit surface for one R&D entry: change its fields, replace its
 * image, or remove it. New entries are published from the admin console's R+D
 * tab; this panel never creates, so create and edit cannot drift into two
 * competing upload workflows.
 *
 * It is the archive's edit panel reshaped for stills: KIND is fixed and hidden,
 * and there is no per-clip thumbnail conversation (the poster is the whole
 * image, so there is no `ThumbnailEditor`). Everything else — the drag, the
 * deploy watch, the "report what the backend actually said" habit, the
 * typed-back removal — is the archive panels' behaviour, kept so the two
 * collections feel like one system.
 *
 * `collection: 'rnd'` is set on every request; the Worker routes it to the R&D
 * data file and prefixes the id with `rnd_` downstream.
 */
type Status = { kind: 'idle' | 'busy' | 'ok' | 'error' | 'live'; message?: string }

const draftFrom = (file: RndFile): EntryDraft => ({
  name: file.name,
  kind: 'photo',
  tagline: file.tagline,
  description: file.description ?? '',
  date: file.date,
  postUrl: file.postUrl,
  // R&D never carries a custom crop — the poster is the whole still — so the
  // editor always opens on the default rather than reconstructing one.
  thumb: { ...DEFAULT_THUMB },
})

export default function RndAdminPanel({ file, onClose }: { file: RndFile; onClose: () => void }) {
  const [draft, setDraft] = useState<EntryDraft>(() => draftFrom(file))
  const [image, setImage] = useState<File | null>(null)
  const [status, setStatus] = useState<Status>({ kind: 'idle' })
  const [confirming, setConfirming] = useState(false)
  const [confirm, setConfirm] = useState('')
  const panelRef = useRef<HTMLDivElement | null>(null)

  /** One watch at a time, cancelled with the panel. */
  const deployWatchRef = useRef<(() => void) | null>(null)
  useEffect(() => () => deployWatchRef.current?.(), [])
  const watchDeploy = () => {
    deployWatchRef.current?.()
    deployWatchRef.current = watchForDeploy({
      onLive: () => setStatus({ kind: 'live', message: 'LIVE. RELOAD TO SEE IT.' }),
      onTimeout: () => setStatus((cur) =>
        cur.kind === 'ok' ? { kind: 'ok', message: 'STILL DEPLOYING — CHECK BACK IN A MINUTE.' } : cur),
    })
  }

  // Draggable by its header, like every archive admin panel and file window.
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

  // Escape closes this, swallowed so the desktop's global Escape does not also
  // act on whatever is under it.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      e.stopPropagation()
      onClose()
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [onClose])

  /** The fields every save sends; `collection` is what makes it R&D. */
  const commonFields = (form: FormData) => {
    form.set('name', draft.name)
    form.set('kind', 'photo')
    form.set('tagline', draft.tagline)
    form.set('description', draft.description)
    form.set('date', draft.date)
    form.set('postUrl', draft.postUrl)
    form.set('thumb', serialiseThumb(draft.thumb))
    form.set('collection', 'rnd')
    form.set('existingNames', JSON.stringify(RND.map((f) => f.name)))
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setStatus({ kind: 'busy', message: image ? 'STAGING REPLACEMENT' : 'SAVING' })
    const form = new FormData()
    commonFields(form)
    if (image) form.set('file', image)
    form.set('currentName', file.name)
    try {
      const res = await fetch(`${ADMIN_API}/api/entry/${encodeURIComponent(file.id)}`, {
        method: 'POST', credentials: 'include', body: form,
      })
      const body = await res.json().catch(() => ({}))
      if (res.status === 202) {
        setStatus({
          kind: 'ok',
          message: image
            ? 'STAGED. TRANSCODE AND DEPLOY RUNNING — A FEW MINUTES.'
            : 'SAVED. DEPLOY RUNNING — A MINUTE OR TWO.',
        })
        watchDeploy()
        setImage(null)
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
        body: JSON.stringify({ name: file.name, confirm, collection: 'rnd' }),
      })
      if (res.status === 202) {
        setStatus({ kind: 'ok', message: 'REMOVED. DEPLOY RUNNING — A MINUTE OR TWO.' })
        setConfirming(false)
        setConfirm('')
        watchDeploy()
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

  return createPortal(
    <div className="admin-panel glass" ref={panelRef} role="dialog" aria-label={`Edit ${file.name}`}>
      <header className="admin-head">
        <span className="admin-grab" data-admin-drag>
          <span className="admin-title">EDIT R+D</span>
          <span className="admin-subject tw-dim">{file.name}.{file.ext}</span>
        </span>
        <button
          type="button"
          className="admin-remove admin-remove-head"
          onClick={() => { setConfirming((c) => !c); setConfirm('') }}
          aria-expanded={confirming}
          aria-label={`Remove ${file.name} from R+D`}
        >
          REMOVE
        </button>
        <button className="admin-close" onClick={onClose} aria-label="Close">✕</button>
      </header>

      <form className="admin-body" onSubmit={submit}>
        <label className="admin-field admin-field-wide"><span>REPLACE IMAGE</span>
          <FilePicker
            file={image}
            accept="image/*"
            emptyLabel="LEAVE EMPTY TO KEEP THE CURRENT IMAGE"
            onPick={setImage}
          />
          {image && <em className="admin-note">THE CURRENT RENDITIONS WILL BE OVERWRITTEN</em>}
        </label>
        <EntryFields
          draft={draft}
          onChange={setDraft}
          hideKind
          nameHint="DISPLAY NAME ONLY — THE ENTRY'S ID AND URLS DO NOT CHANGE"
        />
        <UploadLimitsHint file={image} kind="photo" />
        <button className="admin-submit" type="submit" disabled={status.kind === 'busy'}>
          {status.kind === 'busy' ? '···' : 'SAVE'}
        </button>
      </form>

      {confirming && (
        <div className="admin-danger">
          <div className="admin-confirm">
            <label className="admin-field admin-field-wide">
              <span>TYPE {file.name} TO REMOVE</span>
              <input value={confirm} onChange={(e) => setConfirm(e.target.value)} autoFocus />
            </label>
            <p className="admin-note">THIS DELETES THE ENTRY'S RENDITIONS. THERE IS NO UNDO HERE.</p>
            <div className="admin-confirm-row">
              <button
                type="button"
                className="admin-remove"
                onClick={remove}
                disabled={status.kind === 'busy' || confirm.trim().toUpperCase() !== file.name}
              >
                CONFIRM REMOVAL
              </button>
              <button
                type="button"
                className="admin-cancel"
                onClick={() => { setConfirming(false); setConfirm('') }}
              >
                CANCEL
              </button>
            </div>
          </div>
        </div>
      )}

      {status.message && (
        <p className="admin-status" data-kind={status.kind} role="status">
          &gt; {status.message}
          {status.kind === 'live' && (
            <button type="button" className="admin-reload" onClick={() => window.location.reload()}>
              RELOAD
            </button>
          )}
        </p>
      )}
    </div>,
    document.body,
  )
}
