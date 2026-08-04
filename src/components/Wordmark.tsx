import { useEffect, useRef } from 'react'
import { animate, createDrawable, stagger } from 'animejs'
import { prefersReducedMotion } from '../lib/perfTier'
import { WORDMARK_LETTERS, WORDMARK_TEXT, WORDMARK_VIEWBOX } from '../data/wordmark.generated'

/** How often the outline traces itself. Long — it is a glint, not a loop. */
const PERIOD_MS = 14_000
/** One letter's draw. */
const DRAW_MS = 900

/**
 * The overprint wordmark, as outlines rather than text.
 *
 * It is an SVG because `createDrawable` needs `getTotalLength()` to animate a
 * stroke along a path, and SVG `<text>` does not have it — text is not
 * geometry. Checked in the browser before committing to this. The letterforms
 * come from the same Archivo Black face at the same -0.04em tracking, traced at
 * build time by `scripts/gen-wordmark-path.mjs`, so this is the wordmark that
 * was always here and not a redrawing of it.
 *
 * Two layers of the same paths: the filled one is the wordmark as it has always
 * looked, and a stroked copy on top traces itself across the letters every
 * fourteen seconds and fades out. Subtle by construction — the stroke is thin,
 * barely-there acid, and it is gone for most of the cycle.
 *
 * Still below the terminal window in z-order, so the glass keeps blurring and
 * refracting it. That refraction is the whole point of the overprint.
 */
export default function Wordmark() {
  const ref = useRef<SVGSVGElement | null>(null)

  useEffect(() => {
    const svg = ref.current
    if (!svg || prefersReducedMotion()) return

    const paths = svg.querySelectorAll<SVGPathElement>('.wordmark-stroke path')
    if (!paths.length) return
    const drawables = createDrawable(paths)

    let cancelled = false
    let timer: number | undefined

    const trace = () => {
      if (cancelled) return
      // `draw` goes from a zero-length segment at the start of each path to the
      // whole path, which is the stroke drawing itself on.
      animate(drawables, {
        draw: ['0 0', '0 1'],
        duration: DRAW_MS,
        delay: stagger(70),
        ease: 'inOutQuad',
      })
      animate(svg.querySelector('.wordmark-stroke')!, {
        opacity: [0, 1],
        duration: 400,
        ease: 'outQuad',
      })
      // Retreat the way it arrived rather than simply vanishing: the tail
      // catches up with the head, so the last thing seen is the stroke leaving.
      window.setTimeout(() => {
        if (cancelled) return
        animate(drawables, { draw: '1 1', duration: DRAW_MS, delay: stagger(70), ease: 'inOutQuad' })
        animate(svg.querySelector('.wordmark-stroke')!, {
          opacity: 0, duration: 700, delay: 500, ease: 'inQuad',
        })
      }, DRAW_MS + 1400)
    }

    // A beat after boot, so it is not competing with the terminal drawing in.
    const first = window.setTimeout(trace, 2200)
    timer = window.setInterval(trace, PERIOD_MS)

    return () => {
      cancelled = true
      window.clearTimeout(first)
      window.clearInterval(timer)
    }
  }, [])

  return (
    <svg
      className="wordmark"
      ref={ref}
      viewBox={WORDMARK_VIEWBOX}
      preserveAspectRatio="xMidYMin meet"
      role="img"
      aria-label={WORDMARK_TEXT}
      focusable="false"
    >
      <g className="wordmark-fill">
        {WORDMARK_LETTERS.map((d, i) => <path key={i} d={d} />)}
      </g>
      {/* Starts invisible; the effect above brings it in. Without this the
          untraced outline would sit on the wordmark for the first 2.2s. */}
      <g className="wordmark-stroke" opacity="0" aria-hidden="true">
        {WORDMARK_LETTERS.map((d, i) => <path key={i} d={d} />)}
      </g>
    </svg>
  )
}
