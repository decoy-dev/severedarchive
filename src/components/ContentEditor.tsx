import { useMemo, useState } from 'react'
import {
  parseContent, serialiseContent, moveItem, removeItem, replaceItem,
  blankAbout, blankLink, LINK_ICONS, normaliseHref, hrefWarning, type ContentDraft,
} from '../lib/contentDraft'

/**
 * The ABOUT/LINKS editor: fields, not JSON.
 *
 * It was a textarea holding the raw file, which made every edit an exercise in
 * hand-writing JSON — a missing comma came back as `NOT VALID JSON` from the
 * Worker after a round trip, and the shape had to be remembered rather than shown.
 *
 * The raw string stays the single source of truth and stays the thing that is
 * committed: this parses it, binds the fields, and serialises back on every edit.
 * `AdminPanel.save` is untouched, and so is the Worker contract.
 *
 * The RAW view is still here, one toggle away, and it is not a nicety — it is the
 * fallback for a file this form cannot model. `parseContent` refuses rather than
 * guessing (an unknown link icon, a block with no body), and when it refuses the
 * only honest editor is the text itself.
 */
export default function ContentEditor({
  value, onChange, section,
}: {
  value: string
  onChange: (next: string) => void
  /**
   * Which half to show. ABOUT and LINKS are separate admin tabs, but they are
   * halves of ONE file: the caller passes the same `value` under both, so an
   * uncommitted ABOUT edit is still in the payload when LINKS commits.
   */
  section: 'about' | 'links'
}) {
  const draft = useMemo(() => parseContent(value), [value])
  const [raw, setRaw] = useState(false)

  // Forced, not chosen: there is nothing to render fields from.
  const mustBeRaw = draft === null
  const showRaw = raw || mustBeRaw

  const write = (next: ContentDraft) => onChange(serialiseContent(next))

  return (
    <div className="content-editor">
      <div className="ce-modes">
        <button
          type="button"
          className={showRaw ? '' : 'is-active'}
          onClick={() => setRaw(false)}
          disabled={mustBeRaw}
        >
          FIELDS
        </button>
        <button type="button" className={showRaw ? 'is-active' : ''} onClick={() => setRaw(true)}>
          RAW JSON
        </button>
        {mustBeRaw && (
          <span className="ce-note">
            &gt; THIS FILE HAS SOMETHING THE FORM DOES NOT MODEL — EDITING AS TEXT SO NOTHING IS LOST
          </span>
        )}
      </div>

      {showRaw ? (
        /* The WHOLE file, whichever tab it was opened from: raw mode exists for
           a file the form cannot model, and showing half of it would invite an
           edit that deletes the other half. */
        <textarea
          className="admin-json"
          value={value}
          spellCheck={false}
          onChange={(e) => onChange(e.target.value)}
          aria-label="content.json"
        />
      ) : (
        <div className="ce-scroll">
          {section === 'about' && <section className="ce-section">
            <h3 className="ce-head">ABOUT</h3>
            {draft!.about.length === 0 && <p className="ce-empty">&gt; NO BLOCKS</p>}
            {draft!.about.map((block, i) => (
              <article className="ce-item" key={i}>
                <div className="ce-item-bar">
                  <span className="ce-index">{String(i + 1).padStart(2, '0')}</span>
                  <label className="ce-inline">
                    {/* The one piece of presentation the copy carries: `big` is what
                        makes OPERATOR and FIELD read as headings. Named for what it
                        does on the page rather than for the field. */}
                    <input
                      type="checkbox"
                      checked={!!block.big}
                      onChange={(e) => write({
                        ...draft!,
                        about: replaceItem(draft!.about, i, { ...block, big: e.target.checked }),
                      })}
                    />
                    <span>LARGE</span>
                  </label>
                  <Reorder
                    at={i}
                    of={draft!.about.length}
                    onMove={(dir) => write({ ...draft!, about: moveItem(draft!.about, i, dir) })}
                    onRemove={() => write({ ...draft!, about: removeItem(draft!.about, i) })}
                    what={`block ${i + 1}`}
                  />
                </div>
                <label className="ce-field">
                  <span>LABEL</span>
                  <input
                    type="text"
                    value={block.label}
                    onChange={(e) => write({
                      ...draft!,
                      about: replaceItem(draft!.about, i, { ...block, label: e.target.value }),
                    })}
                  />
                </label>
                <label className="ce-field">
                  <span>BODY</span>
                  <textarea
                    rows={block.big ? 2 : 4}
                    value={block.body}
                    onChange={(e) => write({
                      ...draft!,
                      about: replaceItem(draft!.about, i, { ...block, body: e.target.value }),
                    })}
                  />
                </label>
              </article>
            ))}
            <button
              type="button"
              className="ce-add"
              onClick={() => write({ ...draft!, about: [...draft!.about, blankAbout()] })}
            >
              + ADD BLOCK
            </button>
          </section>}

          {section === 'links' && <section className="ce-section">
            <h3 className="ce-head">LINKS</h3>
            {draft!.links.length === 0 && <p className="ce-empty">&gt; NO ROWS</p>}
            {draft!.links.map((row, i) => (
              <article className="ce-item" key={i}>
                <div className="ce-item-bar">
                  <span className="ce-index">{String(i + 1).padStart(2, '0')}</span>
                  <label className="ce-inline">
                    <span>ICON</span>
                    {/* A select, not a text field: the glyphs are SVG paths in code
                        and there are exactly three. Typing a fourth name would
                        commit a row that renders no mark. */}
                    <select
                      value={row.icon}
                      onChange={(e) => write({
                        ...draft!,
                        links: replaceItem(draft!.links, i, { ...row, icon: e.target.value as typeof row.icon }),
                      })}
                    >
                      {LINK_ICONS.map((icon) => (
                        <option key={icon} value={icon}>{icon.toUpperCase()}</option>
                      ))}
                    </select>
                  </label>
                  <Reorder
                    at={i}
                    of={draft!.links.length}
                    onMove={(dir) => write({ ...draft!, links: moveItem(draft!.links, i, dir) })}
                    onRemove={() => write({ ...draft!, links: removeItem(draft!.links, i) })}
                    what={`row ${i + 1}`}
                  />
                </div>
                <div className="ce-pair">
                  <label className="ce-field">
                    <span>LABEL</span>
                    <input
                      type="text"
                      value={row.label}
                      onChange={(e) => write({
                        ...draft!,
                        links: replaceItem(draft!.links, i, { ...row, label: e.target.value }),
                      })}
                    />
                  </label>
                  <label className="ce-field">
                    <span>SHOWN AS</span>
                    <input
                      type="text"
                      value={row.value}
                      onChange={(e) => write({
                        ...draft!,
                        links: replaceItem(draft!.links, i, { ...row, value: e.target.value }),
                      })}
                    />
                  </label>
                </div>
                <label className="ce-field">
                  <span>LINK</span>
                  {/* `type="url"` would reject `mailto:` and the `#` placeholder the
                      commissions row uses, both of which are live values today. */}
                  <input
                    type="text"
                    inputMode="url"
                    value={row.href}
                    placeholder="https://… or mailto:…"
                    onChange={(e) => write({
                      ...draft!,
                      links: replaceItem(draft!.links, i, { ...row, href: e.target.value }),
                    })}
                    // On blur, not on change: rewriting mid-keystroke fights the
                    // typing — `chris@severedarchive.com` passes through states
                    // that already look like a finished address, and prefixing
                    // one of them puts the caret behind seven characters the
                    // owner did not type. Leaving it to the commit instead would
                    // fix the file silently and leave the field disagreeing with
                    // what shipped, so the correction happens here, in view.
                    onBlur={(e) => {
                      const href = normaliseHref(e.target.value)
                      if (href === row.href) return
                      write({ ...draft!, links: replaceItem(draft!.links, i, { ...row, href }) })
                    }}
                  />
                  {/* Where the rewrite cannot be sure, say so rather than commit a
                      link that resolves somewhere nobody intended. */}
                  {hrefWarning(row.href) && (
                    <em className="ce-warn" role="status">{hrefWarning(row.href)}</em>
                  )}
                </label>
              </article>
            ))}
            <button
              type="button"
              className="ce-add"
              onClick={() => write({ ...draft!, links: [...draft!.links, blankLink()] })}
            >
              + ADD LINK
            </button>
          </section>}
        </div>
      )}
    </div>
  )
}

/** Move up, move down, delete — the same three controls for both lists. */
function Reorder({
  at, of, onMove, onRemove, what,
}: {
  at: number
  of: number
  onMove: (dir: -1 | 1) => void
  onRemove: () => void
  what: string
}) {
  return (
    <span className="ce-ctl">
      <button type="button" onClick={() => onMove(-1)} disabled={at === 0} aria-label={`Move ${what} up`}>↑</button>
      <button type="button" onClick={() => onMove(1)} disabled={at === of - 1} aria-label={`Move ${what} down`}>↓</button>
      <button type="button" className="ce-del" onClick={onRemove} aria-label={`Remove ${what}`}>✕</button>
    </span>
  )
}
