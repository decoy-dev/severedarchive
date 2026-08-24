import { useEffect, useRef, useState, type DragEvent, type FormEvent } from 'react'
import { createPortal } from 'react-dom'
import { animate } from 'animejs'
import { prefersReducedMotion } from '../lib/perfTier'
import { isInteractiveTarget } from '../lib/keyboard'
import { RECEDE_MS, recedeAt, recedeFilter, recedeTransform } from '../lib/recede'
import { openFrom, type OpenOrigin } from '../lib/openFrom'
import { useTurnstile } from '../hooks/useTurnstile'
import {
  COMMISSION_ACTION,
  COMMISSION_FIELDS,
  MOODBOARD_LABEL,
  TURNSTILE_SITE_KEY,
  MOODBOARD_MAX_BYTES,
  blankCommission,
  commissionErrors,
  submitCommission,
  type CommissionInvalid,
  type CommissionValues,
} from '../lib/commission'

/** Rendered, not hardcoded: 10 MB at the current cap, and it moves with the cap. */
const MAX_MB = MOODBOARD_MAX_BYTES / (1024 * 1024)

type Phase = 'idle' | 'busy' | 'done' | 'error'


/**
 * The Tally form's replacement, in the terminal's own idiom. All ten questions
 * come from `COMMISSION_FIELDS` — the wording has one home, in `lib/commission`,
 * and this component is layout and behaviour only.
 *
 * A panel over the whole stage rather than a tab, and portalled to `document.body`
 * like `AdminPanel`: it is opened from the COMMISSIONS card and it covers what it
 * is opened over, so it must not be clipped by `.tw-body`'s `overflow: hidden`
 * and must not sit inside the tab strip's own stacking context.
 *
 * Only `.commission-scroll` scrolls. Ten questions do not fit a 775px window, and
 * the document gaining a scrollbar is not an option — the stage clips.
 */
export default function CommissionPanel({
  origin, closing, onClose,
}: {
  origin: OpenOrigin | null
  /**
   * Leaving. Owned by `App`, which unmounts this after `RECEDE_MS` — the panel
   * plays the recede, the parent decides when it is over.
   */
  closing: boolean
  onClose: () => void
}) {
  const [values, setValues] = useState<CommissionValues>(blankCommission)
  const [file, setFile] = useState<File | null>(null)
  const [invalid, setInvalid] = useState<readonly CommissionInvalid[]>([])
  const [phase, setPhase] = useState<Phase>('idle')
  const [message, setMessage] = useState('')
  const [dragging, setDragging] = useState(false)

  // Focus targets for a failed submit: the first invalid control gets focus so
  // a keyboard user lands on the problem rather than having to hunt for it.
  const controls = useRef<Partial<Record<CommissionInvalid, HTMLElement | null>>>({})
  const panelRef = useRef<HTMLDivElement | null>(null)
  const backdropRef = useRef<HTMLDivElement | null>(null)
  const entered = useRef(false)
  const turnstile = useTurnstile(TURNSTILE_SITE_KEY, COMMISSION_ACTION)

  /**
   * It opens out of the card that was clicked.
   *
   * The transform origin is that card's centre expressed in the panel's own
   * coordinates, so the box grows from the control rather than from the middle of
   * the screen — the same gesture as a file opening into a window, which is the
   * metaphor the rest of this interface runs on.
   *
   * Transform and opacity only, per the binding rules. The backdrop fades faster
   * than the panel grows so the ground is already dark by the time the box lands,
   * rather than the two arriving together and reading as one flat cross-fade.
   */
  useEffect(() => {
    const panel = panelRef.current
    const backdrop = backdropRef.current
    // Once only, as `TerminalWindow`'s entrance does. StrictMode invokes mount
    // effects twice in development, and the second pass measured a panel anime
    // had already scaled to 0.88 — `getBoundingClientRect` reports the SCALED
    // box, so the origin came out ~90px adrift and the panel grew from the wrong
    // place. The guard is what makes the measurement trustworthy.
    if (!panel || entered.current) return
    entered.current = true

    // The backdrop is darkened faster than the panel grows, so the ground is
    // already down by the time the box lands rather than the two arriving
    // together and reading as one flat cross-fade.
    if (backdrop) {
      if (prefersReducedMotion()) backdrop.style.opacity = '1'
      else animate(backdrop, { opacity: [0, 1], duration: 180, ease: 'linear' })
    }
    openFrom(panel, origin, { scale: 0.88 })
  }, [origin])

  /**
   * The close: the panel is pulled back into the background until it is gone.
   *
   * The same `recede` the file windows use, driven the same way — in rAF rather
   * than by anime or a CSS animation, because `recedeAt` is a scale/opacity/blur
   * quadruple per frame and the blur and brightness go through `filter`, which no
   * keyframe here owns. Matching the file windows was the point: closing a panel
   * should look like closing a window, and this interface already had an opinion
   * about what that looks like.
   *
   * `transform-origin` goes back to the centre first. The entrance left it on the
   * card the panel grew out of, and receding toward that point reads as the panel
   * sliding off to one side rather than withdrawing — `recede` is explicit that it
   * pulls back in place.
   */
  useEffect(() => {
    const panel = panelRef.current
    const backdrop = backdropRef.current
    if (!closing || !panel) return
    // `App` unmounts immediately when motion is reduced, so this is unreachable
    // then — guarded anyway, because a panel left mid-recede would be a panel
    // stuck at 8% scale.
    if (prefersReducedMotion()) return

    panel.style.transformOrigin = 'center'
    let raf = 0
    const start = performance.now()
    const tick = (now: number) => {
      const progress = Math.min(1, (now - start) / RECEDE_MS)
      const { scale, opacity, blur, brightness } = recedeAt(progress)
      panel.style.transform = recedeTransform('', scale)
      panel.style.opacity = `${opacity}`
      panel.style.filter = recedeFilter(blur, brightness)
      // The ground comes back linearly while the panel accelerates away, so the
      // site is legible again before the panel has finished leaving.
      if (backdrop) backdrop.style.opacity = `${1 - progress}`
      if (progress < 1) raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [closing])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        // Swallowed, as AdminPanel does: the desktop's global Escape closes the
        // focused file window, and dismissing this must not also close what is
        // behind it.
        e.stopPropagation()
        onClose()
        return
      }
      // Left/Right switch tabs at the desktop level. This panel covers the tabs,
      // so a shift while it is open silently rearranges what is underneath and
      // only shows up on close. Held back on the same terms Desktop itself
      // applies — never when the key belongs to a field, or Left and Right stop
      // moving the caret in a ten-question form.
      if ((e.key === 'ArrowLeft' || e.key === 'ArrowRight') && !isInteractiveTarget(e)) {
        e.stopPropagation()
      }
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [onClose])

  /**
   * Focus goes into the dialog on open and back to whatever opened it on close.
   *
   * Without the second half, dismissing the panel drops a keyboard user at the
   * top of the document and they have to tab back through the whole terminal to
   * reach the card they started from.
   */
  useEffect(() => {
    const returnTo = document.activeElement instanceof HTMLElement ? document.activeElement : null
    panelRef.current?.focus()
    return () => returnTo?.focus()
  }, [])

  const setField = (id: CommissionInvalid, value: string) => {
    setValues((v) => ({ ...v, [id]: value }))
    // Re-validating live would nag mid-edit; clearing the one mark being fixed is enough.
    setInvalid((prev) => prev.filter((x) => x !== id))
  }

  const takeFile = (next: File | null) => {
    setFile(next)
    setInvalid((prev) => prev.filter((x) => x !== 'moodboard'))
  }

  const onDrop = (e: DragEvent) => {
    e.preventDefault()
    setDragging(false)
    takeFile(e.dataTransfer.files[0] ?? null)
  }

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault()
    if (phase === 'busy') return
    const errors = commissionErrors(values, file)
    if (errors.length > 0) {
      setInvalid(errors)
      controls.current[errors[0]]?.focus()
      return
    }
    // commissionErrors returned empty, which requires the file — the contract's
    // type takes File, not File | null, so this is narrowed, not assumed.
    if (!file) return
    // No token, no post. The Worker would refuse it anyway, and spending the
    // upload to be told so is a waste of the visitor's connection.
    if (!turnstile.token) {
      setMessage(turnstile.state === 'unavailable'
        ? 'VERIFICATION COULD NOT LOAD. MAIL CHRIS@SEVEREDARCHIVE.COM INSTEAD.'
        : 'STILL VERIFYING — GIVE IT A MOMENT AND PRESS SUBMIT AGAIN.')
      setPhase('error')
      return
    }
    setPhase('busy')
    const result = await submitCommission(values, file, turnstile.token)
    if (result.ok) {
      setPhase('done')
    } else {
      setMessage(result.message)
      setPhase('error')
      // The token was redeemed by that attempt whether or not the send worked.
      // Without a fresh one the retry fails on an already-spent token, which
      // reads as the form being broken.
      turnstile.reset()
    }
  }

  return createPortal(
    // No dismiss-on-backdrop-click. Escape and the close control are deliberate
    // acts; a stray click on the margin is not, and this form is ten questions
    // deep by the time anyone would make one.
    <div className="commission-overlay" ref={backdropRef} data-closing={closing ? 'true' : undefined}>
      <div
        className="commission-panel glass"
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="commission-title"
        tabIndex={-1}
      >
        <header className="commission-head">
          <div className="commission-titles">
            {/* A heading element, not a styled span like the other panels'
                labels: this panel is a form a screen-reader user has to find and
                work through, and it names the dialog for `aria-labelledby`. */}
            <h2 className="panel-label" id="commission-title">COMMISSION INQUIRY</h2>
            <p className="commission-sub">Tell me about your project</p>
          </div>
          <button
            type="button"
            className="commission-close"
            onClick={onClose}
            aria-label="Close the commission form"
          >
            ✕
          </button>
        </header>

        <div className="commission-scroll">
          {phase === 'done' ? (
            /* The form is replaced outright on success — nothing left mounted
               that could be submitted a second time. */
            <p className="commission-status" data-kind="ok" role="status">
              &gt; INQUIRY RECEIVED — thank you. Expect a reply within a few days.
            </p>
          ) : (
            <form className="commission-form" onSubmit={onSubmit} noValidate>
              {COMMISSION_FIELDS.map((f) => {
                const errId = `cq-${f.id}-error`
                const bad = invalid.includes(f.id)
                return (
                  <div className="commission-field" key={f.id}>
                    <label className="commission-label" htmlFor={`cq-${f.id}`}>
                      {f.label}
                      {f.required && (
                        /* The glyph is decorative; `required`/`aria-required` on
                           the control is the signal a screen reader gets. */
                        <span className="commission-req" aria-hidden="true"> *</span>
                      )}
                    </label>
                    {f.kind === 'line' ? (
                      <input
                        id={`cq-${f.id}`}
                        className="commission-input"
                        type="text"
                        value={values[f.id]}
                        required={f.required}
                        aria-required={f.required}
                        aria-invalid={bad || undefined}
                        aria-describedby={bad ? errId : undefined}
                        ref={(el) => { controls.current[f.id] = el }}
                        onChange={(e) => setField(f.id, e.target.value)}
                      />
                    ) : (
                      <textarea
                        id={`cq-${f.id}`}
                        className="commission-input"
                        rows={3}
                        value={values[f.id]}
                        required={f.required}
                        aria-required={f.required}
                        aria-invalid={bad || undefined}
                        aria-describedby={bad ? errId : undefined}
                        ref={(el) => { controls.current[f.id] = el }}
                        onChange={(e) => setField(f.id, e.target.value)}
                      />
                    )}
                    {bad && (
                      <p className="commission-error" id={errId}>REQUIRED</p>
                    )}
                  </div>
                )
              })}

              <div className="commission-field">
                {/* A label wrapping a visually-hidden native input, not a button:
                    a button cannot open a file picker. The input stays in the tab
                    order and `:focus-within` on the drop zone is what shows it. */}
                <label
                  className="commission-drop"
                  data-drag={dragging ? 'true' : 'false'}
                  aria-invalid={invalid.includes('moodboard') || undefined}
                  aria-describedby={invalid.includes('moodboard') ? 'cq-moodboard-error' : undefined}
                  onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
                  onDragLeave={() => setDragging(false)}
                  onDrop={onDrop}
                >
                  <input
                    className="commission-file"
                    type="file"
                    required
                    aria-required="true"
                    ref={(el) => { controls.current.moodboard = el }}
                    onChange={(e) => takeFile(e.target.files?.[0] ?? null)}
                  />
                  <span className="commission-drop-label">
                    {MOODBOARD_LABEL}
                    <span className="commission-req" aria-hidden="true"> *</span>
                  </span>
                  <span className="commission-drop-hint">
                    {file ? file.name : 'Click to choose a file or drag here'}
                  </span>
                  <span className="commission-drop-size">MAX {MAX_MB} MB</span>
                </label>
                {invalid.includes('moodboard') && (
                  <p className="commission-error" id="cq-moodboard-error">
                    {file && file.size > MOODBOARD_MAX_BYTES ? `EXCEEDS ${MAX_MB} MB` : 'REQUIRED'}
                  </p>
                )}
              </div>

              {/* Turnstile. Above the button rather than below it, so a visitor
                  who has to tick something sees it before they reach for SUBMIT.
                  `commission-turnstile` only reserves the row; the widget draws
                  itself inside and owns its own dimensions. */}
              <div className="commission-turnstile" ref={turnstile.ref} />
              {turnstile.state === 'unavailable' && (
                <p className="commission-status" data-kind="error" role="status">
                  &gt; VERIFICATION COULD NOT LOAD — IT MAY BE BLOCKED BY AN EXTENSION.
                  MAIL CHRIS@SEVEREDARCHIVE.COM AND I WILL PICK IT UP THERE.
                </p>
              )}

              <button className="commission-submit" type="submit" disabled={phase === 'busy'}>
                {phase === 'busy' ? '···' : 'SUBMIT'}
              </button>

              {phase === 'busy' && (
                <p className="commission-status" data-kind="busy" role="status">&gt; TRANSMITTING</p>
              )}
              {phase === 'error' && (
                /* Everything typed stays in the fields; only the verdict is reported. */
                <p className="commission-status" data-kind="error" role="status">&gt; {message}</p>
              )}
            </form>
          )}
        </div>
      </div>
    </div>,
    document.body,
  )
}
