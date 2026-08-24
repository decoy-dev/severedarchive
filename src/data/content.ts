import CONTENT_FILE from './content.json'
import { parseContent } from '../lib/contentDraft'

/**
 * The editable copy: the ABOUT blocks and the LINKS rows.
 *
 * Split out of the components so the admin editor has something real to seed
 * itself from. It used to open on an empty box, which asks the owner to retype
 * the site from memory in JSON — the point of an editor is to start from what is
 * live.
 *
 * The Worker commits this same shape to `src/data/content.json`, and the app
 * PREFERS that file — see `SITE_CONTENT` at the foot of this file. The constants
 * below are the seed: what the site said before anyone edited it, and what it
 * falls back to if the file is ever unreadable. Icons stay in code, keyed by
 * name: they are SVG paths, not content.
 */
export type LinkIcon = 'instagram' | 'mail' | 'inbox'

export type SiteContent = {
  about: { label: string; body: string; big?: boolean }[]
  links: { label: string; value: string; href: string; icon: LinkIcon }[]
}

const SEED_CONTENT: SiteContent = {
  about: [
    { label: 'OPERATOR', body: 'SEVEREDARCHIVE', big: true },
    { label: 'FIELD', body: 'MOTION + VISUAL ART', big: true },
    {
      label: 'BACKSTORY',
      body:
        'Blender-built worlds set to music. Chrome, glass, and metal — still frames and ' +
        'moving sequences in a neo-2000s register. The archive updates when the renders survive.',
    },
    { label: 'TOOLING', body: 'BLENDER · GEOMETRY NODES · SOUND-SYNCED SEQUENCING' },
  ],
  links: [
    { label: 'INSTAGRAM', value: '@severedarchive', href: 'https://instagram.com/severedarchive', icon: 'instagram' },
    { label: 'MAIL', value: 'CONTACT@SEVEREDARCHIVE', href: 'mailto:hello@example.com', icon: 'mail' },
    { label: 'COMMISSIONS', value: 'STATUS: OPEN', href: '#commission', icon: 'inbox' },
  ],
}

/**
 * What the site actually renders: `content.json` when it is the shape this app
 * understands, the seed above when it is not.
 *
 * This link was missing for a week and it is the only reason the admin editor
 * appeared to do nothing. Every ABOUT/LINKS edit committed, every deploy
 * succeeded, and the panel truthfully reported LIVE — while `AboutPanel` and
 * `LinksPanel` went on reading the constants above, which no edit ever touches.
 * A pipeline that ends one import short of the screen is indistinguishable from
 * a broken one.
 *
 * Validated with `parseContent` — the SAME check the editor uses to decide
 * whether it can show the form. That is the point of reusing it rather than
 * writing a second validator here: a file the form accepted can never be a file
 * the site rejects, so the owner cannot be shown a working editor over copy that
 * silently will not render. A file that fails falls back whole rather than per
 * field: half the seed and half the file is a third state nobody wrote.
 *
 * `import type` in `contentDraft` keeps this from being a runtime cycle — the
 * type edges erase, and only `parseContent` crosses at runtime.
 */
const FILE_CONTENT = parseContent(JSON.stringify(CONTENT_FILE))

export const SITE_CONTENT: SiteContent = FILE_CONTENT
  // Narrowed to the two arrays, deliberately. `parseContent` also returns
  // `rest` — the top-level keys the editor does not model, carried so a round
  // trip through the form cannot delete them. That is the EDITOR's concern, and
  // spreading it here puts a `rest` key into what the site renders and, worse,
  // into `AdminPanel`'s seed, which stringifies `SITE_CONTENT` straight back
  // into `content.json`. The renderer wants the copy, not the bookkeeping.
  ? { about: FILE_CONTENT.about, links: FILE_CONTENT.links }
  : SEED_CONTENT

/** What the Worker accepts, stated once so the form and the docs cannot disagree. */
export const UPLOAD_LIMITS = {
  /** Matches `MAX_UPLOAD_BYTES` in `server/worker.ts`. */
  maxBytes: 512 * 1024 * 1024,
  video: ['MP4', 'MOV', 'WEBM', 'M4V'],
  /**
   * Stills, for use as a THUMBNAIL. Not as an entry of their own: the ingest
   * pipeline produces `_full.mp4` and `_thumb.mp4` from every upload and the
   * app expects both, so a still uploaded as an entry would come out as broken
   * video renditions. The `kind: 'photo'` field and its glyph exist for when
   * that pipeline is built; until then the form must not offer what it cannot
   * deliver, which is why PHOTO is disabled for new uploads.
   */
  photo: ['JPG', 'PNG', 'WEBP'],
} as const

export const formatBytes = (bytes: number): string => {
  if (bytes >= 1024 ** 3) return `${(bytes / 1024 ** 3).toFixed(bytes % 1024 ** 3 === 0 ? 0 : 1)} GB`
  return `${Math.round(bytes / 1024 ** 2)} MB`
}
