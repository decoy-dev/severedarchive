import { useEffect, useRef, useState } from 'react'

/** Collapsed: a VOL button whose three bars show the level. Click to expand a slider inline. */
export default function VolumeControl({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLSpanElement | null>(null)

  // collapse when focus or a click leaves the control
  useEffect(() => {
    if (!open) return
    const onDown = (e: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false)
    }
    window.addEventListener('pointerdown', onDown)
    return () => window.removeEventListener('pointerdown', onDown)
  }, [open])

  const bars = value === 0 ? 0 : value < 0.34 ? 1 : value < 0.67 ? 2 : 3

  return (
    <span className="vol" ref={rootRef} data-open={open ? 'true' : 'false'}>
      <button className="vol-toggle" onClick={() => setOpen((o) => !o)}
        aria-expanded={open} aria-label={`Volume ${Math.round(value * 100)} percent`}>
        <span className="tw-dim">VOL</span>
        <span className="vol-bars" aria-hidden="true">
          {[1, 2, 3].map((n) => <i key={n} data-on={n <= bars ? 'true' : 'false'} />)}
        </span>
      </button>
      <span className="vol-expand">
        <input type="range" min={0} max={100} value={Math.round(value * 100)}
          aria-label="Volume" tabIndex={open ? 0 : -1}
          onChange={(e) => onChange(Number(e.target.value) / 100)} />
        <span className="vol-readout">{String(Math.round(value * 100)).padStart(3, '0')}</span>
      </span>
    </span>
  )
}
