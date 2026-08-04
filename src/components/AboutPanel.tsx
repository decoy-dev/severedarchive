import { useEffect, useState, type ComponentType } from 'react'
import type { PerfTier } from '../lib/perfTier'
import { useMediaQuery } from '../hooks/useMediaQuery'
import { SITE_CONTENT } from '../data/content'

/**
 * Split out, not statically imported: three.js is ~590kB of the bundle and this
 * is one decorative object on one tab. Loading it with the app would triple the
 * cost of the first paint for everyone who never opens ABOUT.
 *
 * Held in state rather than behind `lazy` + `Suspense`, and that is the whole
 * fix for the pop-in. React throttles hiding a Suspense fallback — it keeps the
 * fallback up for ~300ms so a fast resolution cannot flicker — so even with the
 * chunk, the SVG, the extruded solid and the WebGL context all warmed at
 * start-up, the first visit to ABOUT still showed an empty column for 300ms and
 * then snapped in. Measured: 312ms from click to the component's effect
 * running, of which 0.1ms was actually looking up the warm renderer. Resolving
 * the module into state has no fallback to throttle, so a warm module mounts on
 * the next render.
 */
const loadAsciiObject = () => import('./AboutAsciiObject')
type ObjectComponent = ComponentType<{ tier: PerfTier }>
/** Resolved once per page load and reused, so a later visit re-mounts instantly. */
let resolved: ObjectComponent | null = null

/**
 * The width at which the object is WARMED at start-up. It mounts at every width
 * now — the owner asked for it on the phone too — but a phone should not spend
 * 590kB of three.js in the background for a tab it may never open. Below this
 * the chunk is fetched when ABOUT is actually opened.
 */
const OBJECT_QUERY = '(min-width: 641px)'

/**
 * Warm the chunk and its geometry source during the site's own start-up, so the
 * first visit to ABOUT renders the object instead of popping it in a beat late.
 * Called once from `AppShell` after boot, on idle — deliberately not at import
 * time, which would put three.js back on the critical path it was split off.
 *
 * The width gate is the one from `hasRoom`: a phone never mounts the object, so
 * it must never fetch 590kB to be ready for something that will not happen.
 */
export function preloadAboutObject(tier: PerfTier): void {
  if (!window.matchMedia(OBJECT_QUERY).matches) return
  // Warming the module and the file was not enough — the tab still took ~390ms
  // to go live, because parsing the SVG and extruding the bevelled solid ran
  // after the panel mounted. `warmAboutObject` does that work here instead, so
  // the first visit renders on its first frame.
  void loadAsciiObject().then((m) => m.warmAboutObject(tier)).catch(() => {})
}

export default function AboutPanel({ tier }: { tier: PerfTier }) {
  // The object is mounted at every width. It used to be gated off below 641px
  // for want of room; measured on a 390x844 phone the copy leaves 194px of the
  // panel spare, which is a band the object fits into — see `.ascii-object`'s
  // mobile rule. The page still must not scroll, so the band is capped rather
  // than left to the object's own appetite.
  const wide = useMediaQuery(OBJECT_QUERY)

  // Starts non-null on every visit after the first, so this is a no-op then.
  // The initializer form, not `useState(resolved)`. React treats a function
  // passed to useState as a lazy initializer and CALLS it — with a component
  // that means invoking it outside a render, which broke every visit after the
  // first once `resolved` was set.
  const [ObjectComponent, setObjectComponent] = useState<ObjectComponent | null>(() => resolved)
  useEffect(() => {
    if (resolved) return
    let live = true
    void loadAsciiObject()
      .then((m) => {
        resolved = m.default
        // The updater form, or React would call the component as an initializer.
        if (live) setObjectComponent(() => m.default)
      })
      .catch(() => {})
    return () => { live = false }
  }, [])

  return (
    <div className="panel about-panel" data-with-object="true" data-wide={wide ? 'true' : 'false'}>
      {/* From `SITE_CONTENT`, which is also what the admin editor seeds itself
          from — the copy has one home rather than one per surface. */}
      <div className="about-copy">
        {SITE_CONTENT.about.map((block) => (
          <div className="panel-block" key={block.label}>
            <span className="panel-label">{block.label}</span>
            {block.big ? <p className="panel-big">{block.body}</p> : <p>{block.body}</p>}
          </div>
        ))}
      </div>
      {/* No spinner: the object is decorative, so its absence is an empty
          column for a moment rather than something to announce. */}
      {ObjectComponent
        ? <ObjectComponent tier={tier} />
        : <div className="ascii-object" aria-hidden="true" />}
    </div>
  )
}
