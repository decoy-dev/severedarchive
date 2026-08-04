import { useEffect, useRef } from 'react'
import { prefersReducedMotion, type PerfTier } from '../lib/perfTier'
import { pulseCell } from '../lib/pulseWave'

/** How often the dot blinks and sends a wave. */
const PERIOD_MS = 5000
/** How long one wave takes to cross and spend itself. */
const PULSE_MS = 1800
/**
 * Cell size in CSS pixels. The canvas is drawn at 1/CELL scale and stretched
 * back up with `image-rendering: pixelated`, which is where the chunky grain
 * comes from — it is a low-resolution buffer, not a filter over a fine one.
 */
const CELL = 4

/**
 * The blinking session dot and the wave it sends down the title bar.
 *
 * The wave is a canvas sized to the bar, drawn at quarter resolution: for each
 * cell, `pulseCell` says how bright it is given its distance from the dot and
 * how far the pulse has travelled. It runs for 1.8s of every 5s and holds no
 * rAF in between, so an idle bar costs nothing.
 *
 * Decorative, and it says so: `aria-hidden`, and the dot's state is not
 * information the interface needs to convey — SESSION OPEN beside it already
 * does that in words.
 */
export default function SessionPulse({ tier }: { tier: PerfTier }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const dotRef = useRef<HTMLSpanElement | null>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    const dot = dotRef.current
    // Lite tier and reduced motion get the dot without the wave. The dot itself
    // still blinks in CSS, which is a two-frame opacity change rather than a
    // canvas — cheap enough to leave on, and it is the part that carries the
    // "session is live" reading.
    if (!canvas || !dot || tier === 'lite' || prefersReducedMotion()) return

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    let raf = 0
    let timer: number | undefined
    let cols = 0
    let rows = 0
    let originX = 0
    let originY = 0
    /** One fixed noise value per cell, so the grain sits still instead of boiling. */
    let noise = new Float32Array(0)

    // The bar, not the flex span the canvas is nested in: the wave fills the
    // whole title bar, and `.tw-pulse` is positioned against it (the span is
    // unpositioned, so it is not the containing block either).
    const bar = canvas.closest<HTMLElement>('.tw-titlebar')
    if (!bar) return

    const measure = () => {
      // `offsetWidth`, NOT `getBoundingClientRect`. The terminal window plays a
      // `scale(0.985 → 1)` entrance on mount, and a rect measured during it is
      // ~1.5% small — which sized the canvas 1308px inside a 1326px bar and
      // left the last 18px of it permanently dark, right about the middle of
      // SESSION OPEN. A ResizeObserver never corrected it either: transforms do
      // not resize a box, so nothing fired. Layout size is transform-free.
      const width = bar.offsetWidth
      const height = bar.offsetHeight
      cols = Math.max(1, Math.ceil(width / CELL))
      rows = Math.max(1, Math.ceil(height / CELL))
      canvas.width = cols
      canvas.height = rows
      canvas.style.width = `${width}px`
      canvas.style.height = `${height}px`
      // The wave leaves the dot, so the origin is where the dot actually is.
      // Both rects come from the same painted frame, so dividing by the scale
      // that frame is under puts the origin back in layout coordinates — the
      // same space the canvas is now sized in.
      const barRect = bar.getBoundingClientRect()
      const scale = barRect.width > 0 ? barRect.width / width : 1
      const dotRect = dot.getBoundingClientRect()
      originX = (dotRect.x + dotRect.width / 2 - barRect.x) / scale
      originY = (dotRect.y + dotRect.height / 2 - barRect.y) / scale
      noise = new Float32Array(cols * rows)
      for (let i = 0; i < noise.length; i++) noise[i] = Math.random()
    }

    const draw = (progress: number) => {
      ctx.clearRect(0, 0, cols, rows)
      if (progress <= 0 || progress >= 1) return
      const width = cols * CELL
      // ONE reach, so the front travels at one speed in every direction — a
      // single expanding pulse, not two. Per-direction reaches were tried to
      // make the front land on both edges together; the cost was that the right
      // side crawled while the left raced, which reads as two different waves
      // leaving the same dot. The right edge is only ~100px away and is
      // therefore lit almost at once, which is simply what a pulse from a point
      // near an edge does — it stays lit because there is no hard back edge
      // (see BAND), so nothing dies there early.
      const reach = Math.max(originX, width - originX) + 120
      const image = ctx.createImageData(cols, rows)
      const data = image.data
      const halfRows = Math.max(1, rows / 2)
      for (let ry = 0; ry < rows; ry++) {
        const py = ry * CELL + CELL / 2
        const dy = py - originY
        const spread = Math.min(1, Math.abs(dy) / (halfRows * CELL))
        for (let rx = 0; rx < cols; rx++) {
          const px = rx * CELL + CELL / 2
          const dx = px - originX
          const i = ry * cols + rx
          const value = pulseCell({
            distance: Math.sqrt(dx * dx + dy * dy),
            progress,
            reach,
            noise: noise[i],
            spread,
          })
          if (value <= 0) continue
          const o = i * 4
          // The accent, #b6ff2e, as light rather than as paint: alpha carries
          // the brightness so it adds to whatever the glass is already showing.
          data[o] = 182
          data[o + 1] = 255
          data[o + 2] = 46
          // Low ceiling: this is a hint of light under the chrome, not a wash over
          // it. At 235 it read as a lit panel rather than as something passing
          // through one; 110 leaves the bar's own text firmly on top.
          data[o + 3] = Math.round(Math.min(1, value) * 110)
        }
      }
      ctx.putImageData(image, 0, 0)
    }

    const fire = () => {
      // Re-measured every pulse rather than only on resize: the dot moves
      // whenever the text beside it does — a font swapping in, the scale
      // changing — and none of that resizes the bar, so nothing else would
      // ever notice. It is one layout read every five seconds.
      measure()
      const start = performance.now()
      dot.dataset.pulsing = 'true'
      const step = (now: number) => {
        const progress = (now - start) / PULSE_MS
        if (progress >= 1) {
          draw(1)
          delete dot.dataset.pulsing
          return
        }
        draw(progress)
        raf = requestAnimationFrame(step)
      }
      raf = requestAnimationFrame(step)
    }

    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(bar)

    // A hidden tab throttles timers and would queue a burst of pulses on return.
    const onVisibility = () => {
      window.clearInterval(timer)
      cancelAnimationFrame(raf)
      draw(1)
      if (!document.hidden) timer = window.setInterval(fire, PERIOD_MS)
    }
    document.addEventListener('visibilitychange', onVisibility)

    const first = window.setTimeout(fire, 900)
    timer = window.setInterval(fire, PERIOD_MS)

    return () => {
      window.clearTimeout(first)
      window.clearInterval(timer)
      cancelAnimationFrame(raf)
      observer.disconnect()
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [tier])

  return (
    <>
      <canvas className="tw-pulse" ref={canvasRef} aria-hidden="true" />
      <span className="tw-dot" ref={dotRef} data-tier={tier} aria-hidden="true" />
    </>
  )
}
