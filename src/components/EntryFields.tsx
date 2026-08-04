import { UPLOAD_LIMITS, formatBytes } from '../data/content'

/**
 * The fields an archive entry has, as one form fragment.
 *
 * Shared by publishing and editing because they collect exactly the same
 * things — and because the Worker validates them with one function. Two copies
 * of this markup would be two chances to add a field to the upload form and not
 * to the editor, which is how an entry ends up with a description that can be
 * set but never corrected.
 */
export type EntryDraft = {
  name: string
  kind: 'video' | 'photo'
  tagline: string
  description: string
  /** ISO `YYYY-MM-DD`. */
  date: string
  postUrl: string
}

/** The device's date — the default for a new entry, editable to backdate it. */
export const todayISO = (): string => {
  const d = new Date()
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

export const emptyDraft = (): EntryDraft => ({
  name: '', kind: 'video', tagline: '', description: '', date: todayISO(), postUrl: '',
})

/** A filename turned into a plausible entry name. The Worker normalises it again. */
export const nameFromFile = (filename: string): string =>
  filename.replace(/\.[^.]+$/, '').toUpperCase().replace(/[^A-Z0-9]+/g, '_')

/** What the backend accepts, stated rather than discovered through a rejection. */
export function UploadLimitsHint({ file }: { file: File | null }) {
  return (
    <p className="admin-hint">
      VIDEO {UPLOAD_LIMITS.video.join(' / ')} · PHOTO {UPLOAD_LIMITS.photo.join(' / ')}
      {' · UP TO '}{formatBytes(UPLOAD_LIMITS.maxBytes)}
      {file ? ` · SELECTED ${formatBytes(file.size)}` : ''}
    </p>
  )
}

export default function EntryFields({
  draft, onChange, nameHint,
}: {
  draft: EntryDraft
  onChange: (next: EntryDraft) => void
  /** Shown under NAME where the name cannot be used to identify files. */
  nameHint?: string
}) {
  const set = <K extends keyof EntryDraft>(key: K, value: EntryDraft[K]) =>
    onChange({ ...draft, [key]: value })

  return (
    <>
      <label className="admin-field"><span>NAME</span>
        <input value={draft.name} onChange={(e) => set('name', e.target.value)} placeholder="CHROME_SEQ" />
        {nameHint && <em className="admin-note">{nameHint}</em>}
      </label>
      <label className="admin-field"><span>KIND</span>
        <select value={draft.kind} onChange={(e) => set('kind', e.target.value as 'video' | 'photo')}>
          <option value="video">VIDEO</option>
          <option value="photo">PHOTO</option>
        </select>
      </label>
      <label className="admin-field"><span>DATE</span>
        <input type="date" value={draft.date} onChange={(e) => set('date', e.target.value)} />
      </label>
      <label className="admin-field"><span>TAGLINE</span>
        <input value={draft.tagline} onChange={(e) => set('tagline', e.target.value)} placeholder="liquid metal study" />
      </label>
      <label className="admin-field"><span>POST URL</span>
        <input value={draft.postUrl} onChange={(e) => set('postUrl', e.target.value)} placeholder="https://instagram.com/p/…" />
      </label>
      <label className="admin-field admin-field-wide"><span>DESCRIPTION</span>
        <textarea value={draft.description} onChange={(e) => set('description', e.target.value)} rows={3} />
      </label>
    </>
  )
}
