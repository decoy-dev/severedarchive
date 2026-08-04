/**
 * The editable copy: the ABOUT blocks and the LINKS rows.
 *
 * Split out of the components so the admin editor has something real to seed
 * itself from. It used to open on an empty box, which asks the owner to retype
 * the site from memory in JSON — the point of an editor is to start from what is
 * live.
 *
 * The Worker commits this same shape to `src/data/content.json`; when that file
 * exists the app should prefer it, and until the first edit these are the
 * values. Icons stay in code, keyed by name: they are SVG paths, not content.
 */
export type LinkIcon = 'instagram' | 'mail' | 'inbox'

export type SiteContent = {
  about: { label: string; body: string; big?: boolean }[]
  links: { label: string; value: string; href: string; icon: LinkIcon }[]
}

export const SITE_CONTENT: SiteContent = {
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
    { label: 'COMMISSIONS', value: 'STATUS: OPEN', href: '#', icon: 'inbox' },
  ],
}

/** What the Worker accepts, stated once so the form and the docs cannot disagree. */
export const UPLOAD_LIMITS = {
  /** Matches `MAX_UPLOAD_BYTES` in `server/worker.ts`. */
  maxBytes: 512 * 1024 * 1024,
  video: ['MP4', 'MOV', 'WEBM', 'M4V'],
  photo: ['JPG', 'PNG', 'WEBP'],
} as const

export const formatBytes = (bytes: number): string => {
  if (bytes >= 1024 ** 3) return `${(bytes / 1024 ** 3).toFixed(bytes % 1024 ** 3 === 0 ? 0 : 1)} GB`
  return `${Math.round(bytes / 1024 ** 2)} MB`
}
