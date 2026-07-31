import { useId, useEffect, useRef, useState } from 'react'

/** Collapsed: a VOL button whose three bars show the level. Click to expand a slider inline. */
export default function VolumeControl({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLSpanElement | null>(null)
  const expandId = useId()

  const percent = Math.round(value * 100)
  const bars = percent === 0 ? 0 : percent < 34 ? 1 : percent < 67 ? 2 : 3

  // collapse when focus or a pointer click leaves the control
  useEffect(() => {
    if (!open) return
    const onDown = (e: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false)
    }
    const onFocusOut = (e: FocusEvent) => {
      const related = e.relatedTarget as Node | null
      if (related === null || (rootRef.current && !rootRef.current.contains(related))) {
        setOpen(false)
      }
    }
    window.addEventListener('pointerdown', onDown)
    rootRef.current?.addEventListener('focusout', onFocusOut)
    return () => {
      window.removeEventListener('pointerdown', onDown)
      rootRef.current?.removeEventListener('focusout', onFocusOut)
    }
  }, [open])

  return (
    <span className="vol" ref={rootRef} data-open={open ? 'true' : 'false'}>
      <button className="vol-toggle" onClick={() => setOpen((o) => !o)}
        aria-expanded={open} aria-label={`Volume ${percent} percent`} aria-controls={expandId}>
        <span className="tw-dim">VOL</span>
        <span className="vol-bars" aria-hidden="true">
          {[1, 2, 3].map((n) => <i key={n} data-on={n <= bars ? 'true' : 'false'} />)}
        </span>
      </button>
      <span className="vol-expand" id={expandId} inert={!open}>
        <input type="range" min={0} max={100} value={percent}
          aria-label="Volume" tabIndex={open ? 0 : -1}
          onChange={(e) => onChange(Number(e.target.value) / 100)} />
        <span className="vol-readout">{String(percent).padStart(3, '0')}</span>
      </span>
    </span>
  )
}
