/**
 * What an admin content commit is called.
 *
 * Every commit this Worker made for `content.json` was called "Update site
 * content from admin". Twenty-eight of them across two evenings, all with that
 * same subject, to change four lines: `git log --oneline` said nothing about any
 * of them, and finding the commit that repointed a LINK meant diffing them one
 * at a time. Nothing was wrong with the commits — they are deliberate saves,
 * minutes apart — but the history they made was unreadable.
 *
 * The diff is in hand at commit time, so the message says what changed. Subject
 * names the rows for `--oneline`; body gives field-level before/after for
 * `git show`. Both are derived, never supplied by the browser: a message is a
 * claim about what is in the commit, and the only thing that can be trusted to
 * make that claim is the thing writing it.
 *
 * Deliberately tolerant. This runs on a payload that has passed `JSON.parse` and
 * nothing more, and a message is never worth failing a commit over: anything it
 * cannot read falls back to the old constant.
 */

/** The historical subject. Still what a commit is called when nothing else fits. */
const FALLBACK = 'Update site content from admin'

/** Git's soft subject limit. Longer subjects get truncated in half the tools. */
const SUBJECT_MAX = 72

/** Where a quoted value gets cut. An ABOUT body is a paragraph. */
const VALUE_MAX = 40

/** The fields the editor can change, per section, in the order it shows them. */
const ABOUT_FIELDS = ['label', 'body', 'big'] as const
const LINK_FIELDS = ['label', 'value', 'href', 'icon'] as const

const isObj = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v)

type Sections = { about: readonly unknown[]; links: readonly unknown[] }

/**
 * `content.json` as the two lists this cares about, or null if it is not that
 * file at all. A section that is missing reads as empty rather than as a
 * failure — one of the two being absent is a file this can still describe.
 */
function sections(raw: string): Sections | null {
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return null
  }
  if (!isObj(parsed)) return null
  const about = Array.isArray(parsed.about) ? parsed.about : null
  const links = Array.isArray(parsed.links) ? parsed.links : null
  if (!about && !links) return null
  return { about: about ?? [], links: links ?? [] }
}

/**
 * What to call a row in the message: its label, which is what the owner reads on
 * the page, falling back to its position when it has none. Named from the row's
 * current state, so a renamed block is reported under the name it now has.
 */
function nameOf(section: string, row: unknown, i: number): string {
  const label = isObj(row) && typeof row.label === 'string' ? row.label.trim() : ''
  return label || `${section}[${i}]`
}

/** A value as the body shows it: quoted if text, cut if long, named if absent. */
function show(v: unknown): string {
  if (v === undefined) return 'unset'
  if (typeof v !== 'string') return String(v)
  return v.length > VALUE_MAX ? `"${v.slice(0, VALUE_MAX)}…"` : `"${v}"`
}

type Change = { name: string; detail: string }

/**
 * Compare one section by position.
 *
 * By position and not by label because the editor can move, add and remove rows,
 * and a label is itself editable — matching on it would report a rename as a
 * delete and an insert. Position is what the file actually is.
 */
function diffSection(
  section: string,
  fields: readonly string[],
  before: readonly unknown[],
  after: readonly unknown[],
): Change[] {
  const changes: Change[] = []
  for (let i = 0; i < Math.max(before.length, after.length); i++) {
    const was = before[i]
    const now = after[i]
    if (now === undefined) {
      const name = nameOf(section, was, i)
      changes.push({ name, detail: `${section} ${name}: removed` })
      continue
    }
    if (was === undefined) {
      const name = nameOf(section, now, i)
      changes.push({ name, detail: `${section} ${name}: added` })
      continue
    }
    if (!isObj(was) || !isObj(now)) continue
    const name = nameOf(section, now, i)
    for (const field of fields) {
      if (JSON.stringify(was[field]) === JSON.stringify(now[field])) continue
      changes.push({ name, detail: `${section} ${name} ${field}: ${show(was[field])} → ${show(now[field])}` })
    }
  }
  return changes
}

/**
 * The subject: as many row names as fit, then a count of the rest. Always keeps
 * the first name even when that one name is longer than the limit on its own —
 * a subject with a name in it beats a subject that is only a number.
 */
function subjectFor(names: readonly string[]): string {
  const head = 'Admin: edit '
  const kept: string[] = []
  for (const name of names) {
    const remaining = names.length - kept.length - 1
    const trial = head + [...kept, name].join(', ') + (remaining ? ` +${remaining} more` : '')
    if (kept.length && trial.length > SUBJECT_MAX) break
    kept.push(name)
  }
  const left = names.length - kept.length
  return head + kept.join(', ') + (left ? ` +${left} more` : '')
}

/**
 * The commit message for a `content.json` write.
 *
 * `before` is the committed version being replaced, or null when it could not be
 * read — absent, or the read failed. Either way there is nothing to compare, so
 * the message is the old constant rather than a guess.
 */
export function contentCommitMessage(before: string | null, after: string): string {
  if (before === null) return FALLBACK
  const was = sections(before)
  const now = sections(after)
  if (!was || !now) return FALLBACK

  const changes = [
    ...diffSection('ABOUT', ABOUT_FIELDS, was.about, now.about),
    ...diffSection('LINKS', LINK_FIELDS, was.links, now.links),
  ]
  // No detectable change: GitHub will not make a commit for identical content
  // anyway, so this is a message for a commit that will not happen.
  if (!changes.length) return FALLBACK

  const names: string[] = []
  for (const { name } of changes) if (!names.includes(name)) names.push(name)
  return `${subjectFor(names)}\n\n${changes.map((c) => c.detail).join('\n')}\n`
}
