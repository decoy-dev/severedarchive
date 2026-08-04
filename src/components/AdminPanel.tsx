import { useEffect, useRef, useState } from 'react'
import { ARCHIVE } from '../data/archive'

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
const API = import.meta.env.VITE_ADMIN_API ?? 'https://severedarchive-admin.chris-216.workers.dev'

/** The device's date, as the date field's default — the owner can backdate it. */
const today = (): string => {
  const d = new Date()
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

type Status = { kind: 'idle' | 'busy' | 'ok' | 'error'; message?: string }

export default function AdminPanel({ onClose }: { onClose: () => void }) {
  const [tab, setTab] = useState<'upload' | 'content'>('upload')
  const [status, setStatus] = useState<Status>({ kind: 'idle' })

  // Upload fields.
  const [file, setFile] = useState<File | null>(null)
  const [name, setName] = useState('')
  const [kind, setKind] = useState<'video' | 'photo'>('video')
  const [tagline, setTagline] = useState('')
  const [description, setDescription] = useState('')
  const [date, setDate] = useState(today)
  const [postUrl, setPostUrl] = useState('')

  // Content editing.
  const [content, setContent] = useState('')
  const [sha, setSha] = useState<string | null>(null)
  const firstRef = useRef<HTMLInputElement | null>(null)

  useEffect(() => { firstRef.current?.focus() }, [])

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
    fetch(`${API}/api/content`, { credentials: 'include' })
      .then((r) => r.json())
      .then((body) => {
        setContent(body.content ?? '{\n  "about": {},\n  "links": []\n}\n')
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
    form.set('name', name)
    form.set('kind', kind)
    form.set('tagline', tagline)
    form.set('description', description)
    form.set('date', date)
    form.set('postUrl', postUrl)
    // So the Worker can reject a duplicate name against what is actually live,
    // rather than only against what it happens to know.
    form.set('existingNames', JSON.stringify(ARCHIVE.map((f) => f.name)))
    try {
      const res = await fetch(`${API}/api/upload`, { method: 'POST', credentials: 'include', body: form })
      const body = await res.json().catch(() => ({}))
      if (res.status === 202) {
        setStatus({
          kind: 'ok',
          message: 'STAGED. TRANSCODE AND DEPLOY RUNNING — A FEW MINUTES.',
        })
        setFile(null); setName(''); setTagline(''); setDescription(''); setPostUrl('')
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
      const res = await fetch(`${API}/api/content`, {
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

  return (
    <div className="admin-panel glass" role="dialog" aria-label="Admin">
      <header className="admin-head">
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
            <input
              ref={firstRef}
              type="file"
              accept="video/*,image/*"
              onChange={(e) => {
                const picked = e.target.files?.[0] ?? null
                setFile(picked)
                // A sensible name from the filename, still editable. The Worker
                // normalises it again, so this only saves typing.
                if (picked && !name) {
                  setName(picked.name.replace(/\.[^.]+$/, '').toUpperCase().replace(/[^A-Z0-9]+/g, '_'))
                }
                if (picked?.type.startsWith('image/')) setKind('photo')
              }}
            />
          </label>
          <label className="admin-field"><span>NAME</span>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="CHROME_SEQ" />
          </label>
          <label className="admin-field"><span>KIND</span>
            <select value={kind} onChange={(e) => setKind(e.target.value as 'video' | 'photo')}>
              <option value="video">VIDEO</option>
              <option value="photo">PHOTO</option>
            </select>
          </label>
          <label className="admin-field"><span>DATE</span>
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </label>
          <label className="admin-field"><span>TAGLINE</span>
            <input value={tagline} onChange={(e) => setTagline(e.target.value)} placeholder="liquid metal study" />
          </label>
          <label className="admin-field"><span>POST URL</span>
            <input value={postUrl} onChange={(e) => setPostUrl(e.target.value)} placeholder="https://instagram.com/p/…" />
          </label>
          <label className="admin-field admin-field-wide"><span>DESCRIPTION</span>
            <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} />
          </label>
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
    </div>
  )
}
