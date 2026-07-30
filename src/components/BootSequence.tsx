import { useEffect, useRef } from 'react'
import { createTimeline, stagger } from 'animejs'
import { prefersReducedMotion } from '../lib/perfTier'

const LINES = [
  '> SEVEREDARCHIVE OS v2.6',
  '> MOUNTING /ARCHIVE ................ OK',
  '> 6 FILES INDEXED',
  '> RENDER NODES: CONNECTED',
  '> SESSION OPEN',
]

export default function BootSequence({ onDone }: { onDone: () => void }) {
  const ref = useRef<HTMLDivElement | null>(null)
  const done = useRef(false)

  useEffect(() => {
    if (!ref.current || done.current) return
    done.current = true
    if (prefersReducedMotion()) {
      onDone()
      return
    }
    const rows = ref.current.querySelectorAll('.boot-line')
    const tl = createTimeline({ defaults: { ease: 'linear' } })
    tl.add(rows, { opacity: [0, 1], duration: 60, delay: stagger(140) })
      .add(ref.current, { opacity: [1, 0], duration: 180 }, '+=350')
    tl.then(onDone)
  }, [onDone])

  return (
    <div className="boot" ref={ref} aria-hidden="true">
      {LINES.map((l) => (
        <div key={l} className="boot-line">{l}</div>
      ))}
    </div>
  )
}
