import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { createDraggable } from 'animejs'
import { ARCHIVE } from '../data/archive'
import { SITE_CONTENT } from '../data/content'
import { ADMIN_API } from '../lib/adminSession'
import { serialiseThumb } from '../lib/thumbCrop'
import EntryFields, { UploadLimitsHint, emptyDraft, nameFromFile, type EntryDraft } from './EntryFields'
import ThumbnailEditor from './ThumbnailEditor'

/**
 * What the passcode was for: publishing.
 *
 * Two jobs, which are the two things the Worker can do — upload a file with its
 * fields, and edit the ABOUT copy and LINKS rows. Both go through the session
 * cookie the login set, which is httpOnly, so nothing here has or needs a token.
 *
 * It reports what the backend said rather than interpreting it. An upload
 * answers 202, not 200: the Worker has staged the file and asked Actions to
 * transcode it, and that takes minutes. Saying "published" would be a lie for
 * most of that window, so it says what actually happened.
 */
type Status = { kind: 'idle' | 'busy' | 'ok' | 'error'; message?: string }

export default function AdminPanel({ onClose }: { onClose: () => void }) {
  const [tab, setTab] = useState<'upload' | 'content'>('upload')
  const [status, setStatus] = useState<Status>({ kind: 'idle' })

  // Upload fields. One draft object, shared with the edit panel via
  // `EntryFields`, so a field cannot exist in one form and not the other.
  const [file, setFile] = useState<File | null>(null)
  const [draft, setDraft] = useState<EntryDraft>(emptyDraft)
  const [thumbImage, setThumbImage] = useState<File | null>(null)
  /**
   * The picked file, as something the preview can scrub.
   *
   * A blob URL of the upload itself — the clip has not been transcoded yet, so
   * there is nothing on the server to seek. The browser decodes the original,
   * which is the same frames the pipeline will grab from.
   */
  const [localUrl, setLocalUrl] = useState<string | null>(null)
  const [localMeta, setLocalMeta] = useState<{ aspect: number; duration: number } | null>(null)

  useEffect(() => {
    if (!file) { setLocalUrl(null); setLocalMeta(null); return }
    const url = URL.createObjectURL(file)
    setLocalUrl(url)
    // Probed rather than assumed: the crop box must be the clip's own shape, and
    // the scrubber's range must be the clip's own length.
    const probe = document.createElement('video')
    probe.preload = 'metadata'
    probe.onloadedmetadata = () => setLocalMeta({
      aspect: probe.videoWidth && probe.videoHeight ? probe.videoWidth / probe.videoHeight : 16 / 9,
      // The pipeline trims to 12s, so a frame past that will not exist.
      duration: Math.min(12, probe.duration || 12),
    })
    probe.src = url
    return () => { URL.revokeObjectURL(url); probe.src = '' }
  }, [file])

  // Content editing.
  const [content, setContent] = useState('')
  const [sha, setSha] = useState<string | null>(null)
  const firstRef = useRef<HTMLInputElement | null>(null)
  const panelRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => { firstRef.current?.focus() }, [])

  // Draggable by its header, like a file window — it covers the archive, and
  // being able to shove it aside to read what is underneath is the point.
  // `containerPadding` keeps it from being dragged off screen entirely.
  useEffect(() => {
    const panel = panelRef.current
    if (!panel) return
    const drag = createDraggable(panel, {
      trigger: panel.querySelector('[data-admin-drag]') as HTMLElement,
      container: document.body,
      // Negative, so it can be pushed most of the way off screen — the point of
      // dragging it is to see what it covers.
      containerPadding: -260,
    })
    return () => { drag.revert() }
  }, [])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      // Swallowed: the desktop's global Escape closes the focused window, and
      // dismissing this must not also close what is behind it.
      e.stopPropagation()
      onClose()
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [onClose])

  // Loaded on demand rather than at mount: it is a GitHub round trip, and most
  // sessions are an upload.
  useEffect(() => {
    if (tab !== 'content' || sha !== null || content) return
    setStatus({ kind: 'busy', message: 'READING content.json' })
    fetch(`${ADMIN_API}/api/content`, { credentials: 'include' })
      .then((r) => r.json())
      .then((body) => {
        // Seeded from what the site is currently showing when the file does not
        // exist yet. An empty box asks the owner to retype the site from memory
        // in JSON, which is the opposite of an editor.
        setContent(body.content ?? `${JSON.stringify(SITE_CONTENT, null, 2)}\n`)
        setSha(body.sha ?? null)
        setStatus({ kind: 'idle' })
      })
      .catch(() => setStatus({ kind: 'error', message: 'COULD NOT READ content.json' }))
  }, [tab, sha, content])

  const upload = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!file) return
    setStatus({ kind: 'busy', message: 'STAGING UPLOAD' })
    const form = new FormData()
    form.set('file', file)
    form.set('name', draft.name)
    form.set('kind', draft.kind)
    form.set('tagline', draft.tagline)
    form.set('description', draft.description)
    form.set('date', draft.date)
    form.set('postUrl', draft.postUrl)
    form.set('thumb', serialiseThumb(draft.thumb))
    if (thumbImage) form.set('thumbImage', thumbImage)
    // So the Worker can reject a duplicate name against what is actually live,
    // rather than only against what it happens to know.
    form.set('existingNames', JSON.stringify(ARCHIVE.map((f) => f.name)))
    try {
      const res = await fetch(`${ADMIN_API}/api/upload`, { method: 'POST', credentials: 'include', body: form })
      const body = await res.json().catch(() => ({}))
      if (res.status === 202) {
        setStatus({
          kind: 'ok',
          message: 'STAGED. TRANSCODE AND DEPLOY RUNNING — A FEW MINUTES.',
        })
        // Reset to a fresh draft, keeping the date: a run of uploads from one
        // shoot all carry the same one.
        setFile(null); setThumbImage(null); setDraft((d) => ({ ...emptyDraft(), date: d.date }))
      } else if (res.status === 422) {
        setStatus({ kind: 'error', message: (body.details ?? ['INVALID ENTRY']).join(' · ').toUpperCase() })
      } else if (res.status === 401) {
        setStatus({ kind: 'error', message: 'SESSION EXPIRED. LOG IN AGAIN.' })
      } else {
        setStatus({ kind: 'error', message: `REFUSED (${res.status})` })
      }
    } catch {
      setStatus({ kind: 'error', message: 'BACKEND UNREACHABLE' })
    }
  }

  const save = async () => {
    setStatus({ kind: 'busy', message: 'COMMITTING content.json' })
    try {
      const res = await fetch(`${ADMIN_API}/api/content`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ content, sha }),
      })
      if (res.ok) setStatus({ kind: 'ok', message: 'COMMITTED. DEPLOY RUNS ON THE NEXT WORKFLOW.' })
      else if (res.status === 422) setStatus({ kind: 'error', message: 'NOT VALID JSON' })
      else if (res.status === 409) setStatus({ kind: 'error', message: 'CHANGED ELSEWHERE — REOPEN AND REDO' })
      else setStatus({ kind: 'error', message: `REFUSED (${res.status})` })
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
    <div className="admin-panel glass" ref={panelRef} role="dialog" aria-label="Admin">
      <header className="admin-head" data-admin-drag>
        <span className="admin-title">PUBLISH</span>
        <nav className="admin-tabs">
          <button className={tab === 'upload' ? 'is-active' : ''} onClick={() => setTab('upload')}>UPLOAD</button>
          <button className={tab === 'content' ? 'is-active' : ''} onClick={() => setTab('content')}>ABOUT / LINKS</button>
        </nav>
        <button className="admin-close" onClick={onClose} aria-label="Close admin">✕</button>
      </header>

      {tab === 'upload' ? (
        <form className="admin-body" onSubmit={upload}>
          <label className="admin-field">
            <span>FILE</span>
            {/* Stated rather than left to be discovered by a rejection. The size
                comes from the same constant the Worker enforces. */}
            <input
              ref={firstRef}
              type="file"
              accept="video/*,image/*"
              onChange={(e) => {
                const picked = e.target.files?.[0] ?? null
                setFile(picked)
                // A sensible name from the filename, still editable. The Worker
                // normalises it again, so this only saves typing.
                if (picked) {
                  setDraft((d) => ({
                    ...d,
                    name: d.name || nameFromFile(picked.name),
                    kind: picked.type.startsWith('image/') ? 'photo' : d.kind,
                  }))
                }
              }}
            />
          </label>
          <EntryFields draft={draft} onChange={setDraft} />
          <ThumbnailEditor
            spec={draft.thumb}
            onChange={(thumb) => setDraft((d) => ({ ...d, thumb }))}
            videoSrc={draft.kind === 'video' ? localUrl ?? undefined : undefined}
            posterSrc={draft.kind === 'photo' ? localUrl ?? undefined : undefined}
            aspect={localMeta?.aspect ?? 16 / 9}
            durationSec={localMeta?.duration ?? 12}
            customImage={thumbImage}
            onCustomImage={setThumbImage}
          />
          <UploadLimitsHint file={file} />
          <button className="admin-submit" type="submit" disabled={!file || status.kind === 'busy'}>
            {status.kind === 'busy' ? '···' : 'UPLOAD'}
          </button>
        </form>
      ) : (
        <div className="admin-body admin-body-content">
          <textarea
            className="admin-json"
            value={content}
            spellCheck={false}
            onChange={(e) => setContent(e.target.value)}
          />
          <button className="admin-submit" onClick={save} disabled={status.kind === 'busy' || !content}>
            {status.kind === 'busy' ? '···' : 'COMMIT'}
          </button>
        </div>
      )}

      {status.message && (
        <p className="admin-status" data-kind={status.kind} role="status">&gt; {status.message}</p>
      )}
    </div>,
    document.body,
  )
}
