import { useId } from 'react'
import { UPLOAD_LIMITS, formatBytes } from '../data/content'
import { DEFAULT_THUMB, type ThumbSpec } from '../lib/thumbCrop'

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
  /**
   * Kept in the draft with NO field in either panel: nothing displays it since
   * the window's VIEW ON INSTAGRAM plate was removed, but the Worker validates
   * it and every existing entry carries one — the edit form must round-trip the
   * stored value, not blank it. Dropping it from this type would do the latter
   * silently.
   */
  postUrl: string
  /** How the poster still is made. See `src/lib/thumbCrop.ts`. */
  thumb: ThumbSpec
}

/** The device's date — the default for a new entry, editable to backdate it. */
export const todayISO = (): string => {
  const d = new Date()
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

export const emptyDraft = (): EntryDraft => ({
  name: '', kind: 'video', tagline: '', description: '', date: todayISO(), postUrl: '',
  thumb: { ...DEFAULT_THUMB },
})

/** A filename turned into a plausible entry name. The Worker normalises it again. */
export const nameFromFile = (filename: string): string =>
  filename.replace(/\.[^.]+$/, '').toUpperCase().replace(/[^A-Z0-9]+/g, '_')

/** What the backend accepts, stated rather than discovered through a rejection. */
export function UploadLimitsHint({ file }: { file: File | null }) {
  return (
    <p className="admin-hint">
      CLIP {UPLOAD_LIMITS.video.join(' / ')}
      {' · STILL '}{UPLOAD_LIMITS.photo.join(' / ')}
      {' · UP TO '}{formatBytes(UPLOAD_LIMITS.maxBytes)}{' EACH'}
      {file ? ` · SELECTED ${formatBytes(file.size)}` : ''}
    </p>
  )
}

export default function EntryFields({
  draft, onChange, nameHint, allowPhoto = true,
}: {
  draft: EntryDraft
  onChange: (next: EntryDraft) => void
  /** Shown under NAME where the name cannot be used to identify files. */
  nameHint?: string
  /**
   * Whether PHOTO may be chosen. Allowed by default now that the still pipeline
   * exists — `process-photo.sh` writes a `.jpg` ladder and every surface renders
   * an `<img>` for it. It was disabled for a day while only the video ladder
   * existed, because a still would have published as broken video renditions.
   */
  allowPhoto?: boolean
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
          <option value="photo" disabled={!allowPhoto}>PHOTO</option>
        </select>
        {!allowPhoto && <em className="admin-note">STILLS AS ENTRIES ARE NOT AVAILABLE HERE</em>}
      </label>
      <label className="admin-field"><span>DATE</span>
        <input type="date" value={draft.date} onChange={(e) => set('date', e.target.value)} />
      </label>
      <label className="admin-field"><span>TAGLINE</span>
        <input value={draft.tagline} onChange={(e) => set('tagline', e.target.value)} placeholder="liquid metal study" />
      </label>
      <label className="admin-field admin-field-wide"><span>DESCRIPTION</span>
        <textarea value={draft.description} onChange={(e) => set('description', e.target.value)} rows={3} />
      </label>
    </>
  )
}

/**
 * The file picker both panels use, in place of a bare `<input type="file">`.
 *
 * The native control renders as the browser's own "Choose File — No file
 * chosen" widget, which ignores every token this interface is set in. The input
 * is still here and still does the work — it is visually hidden, labelled by
 * the styled row, and keeps keyboard focus and the OS dialog — so nothing about
 * the mechanics changes, only what is drawn.
 */
export function FilePicker({
  file, accept, emptyLabel, onPick, inputRef,
}: {
  file: File | null
  accept: string
  /** What the empty state says — "SELECT A FILE" upload-side, softer edit-side. */
  emptyLabel: string
  onPick: (file: File | null) => void
  inputRef?: React.Ref<HTMLInputElement>
}) {
  const id = useId()
  return (
    <span className="file-picker">
      <input
        id={id}
        ref={inputRef}
        className="file-picker-input"
        type="file"
        accept={accept}
        onChange={(e) => onPick(e.target.files?.[0] ?? null)}
      />
      <label htmlFor={id} className="file-picker-row">
        <span className="file-picker-cta">BROWSE…</span>
        <span className="file-picker-name" data-empty={file ? undefined : 'true'}>
          {file ? file.name : emptyLabel}
        </span>
        {file && <span className="file-picker-size">{formatBytes(file.size)}</span>}
      </label>
    </span>
  )
}
