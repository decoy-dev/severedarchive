import { useEffect, useId, useRef, useState } from 'react'
import { formatEntryDate, type ArchiveFile } from '../data/archive'

/**
 * The (i) beside a filename: description and date, on demand.
 *
 * A popover rather than always-on text because the window chrome is 40px and a
 * portrait bar is ~250px — there is no room to say more there, and the
 * dashboard card already spends its lines on telemetry. This is the place the
 * long-form note lives.
 *
 * Closes on Escape and on a pointer press outside, and the trigger keeps focus
 * when it closes so the keyboard does not land on `<body>`.
 */
export default function InfoPopover({
  file,
  align = 'end',
}: {
  file: ArchiveFile
  /**
   * Which edge the panel hangs from. `end` (the default) opens leftward, for a
   * trigger near the right of a narrow window bar. `start` opens rightward, for
   * the dashboard card where the trigger is in the left-hand control column.
   */
  align?: 'start' | 'end'
}) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLSpanElement | null>(null)
  const triggerRef = useRef<HTMLButtonElement | null>(null)
  const panelId = useId()

  useEffect(() => {
    if (!open) return
    const onDown = (e: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      // Swallowed, or the desktop's global Escape would close the window this
      // popover is attached to as well.
      e.stopPropagation()
      setOpen(false)
      triggerRef.current?.focus()
    }
    window.addEventListener('pointerdown', onDown)
    window.addEventListener('keydown', onKey, true)
    return () => {
      window.removeEventListener('pointerdown', onDown)
      window.removeEventListener('keydown', onKey, true)
    }
  }, [open])

  // The twelve original entries have no description of their own; their tagline
  // is the only note they have, so it stands in rather than showing an empty
  // panel.
  const description = file.description?.trim() || file.tagline
  const dated = formatEntryDate(file)

  return (
    <span className="info" ref={rootRef}>
      <button
        ref={triggerRef}
        className="info-trigger"
        aria-expanded={open}
        aria-controls={panelId}
        aria-label={`Details for ${file.name}.${file.ext}`}
        // The window raises on pointerdown and its title bar is a drag handle;
        // without this the press would be read as a grab on the chrome.
        onPointerDown={(e) => e.stopPropagation()}
        onClick={() => setOpen((v) => !v)}
      >
        i
      </button>
      {open && (
        <span className="info-panel" data-align={align} id={panelId} role="note">
          <span className="info-panel-head">
            {file.name}<span className="tw-dim">.{file.ext}</span>
          </span>
          <span className="info-panel-date tw-dim">{dated}</span>
          <span className="info-panel-body">{description.toUpperCase()}</span>
        </span>
      )}
    </span>
  )
}
