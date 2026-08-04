import { Suspense, lazy } from 'react'
import type { PerfTier } from '../lib/perfTier'
import { useMediaQuery } from '../hooks/useMediaQuery'

/**
 * Split out, not statically imported: three.js is ~590kB of the bundle and this
 * is one decorative object on one tab. Loading it with the app would triple the
 * cost of the first paint for everyone who never opens ABOUT. The panel only
 * mounts when the tab is selected, so the chunk is fetched exactly then.
 */
const loadAsciiObject = () => import('./AboutAsciiObject')
const AboutAsciiObject = lazy(loadAsciiObject)

/** The width at which the object is mounted at all. Shared with `hasRoom`. */
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
export function preloadAboutObject(): void {
  if (!window.matchMedia(OBJECT_QUERY).matches) return
  void loadAsciiObject()
  // The scene cannot be built until the SVG lands, so warming the module alone
  // would just move the wait. A plain fetch is enough — the loader's own request
  // then answers from cache.
  void fetch(`${import.meta.env.BASE_URL}assets/about-upload-mark.svg`).catch(() => {})
}

export default function AboutPanel({ tier }: { tier: PerfTier }) {
  // Not a CSS hide: at 390px the copy already fills the panel, so the object
  // would render into a box with no room and the page must not scroll to make
  // some. Gating the mount rather than the display also means a phone never
  // fetches the three.js chunk at all.
  const hasRoom = useMediaQuery(OBJECT_QUERY)

  return (
    <div className="panel about-panel" data-with-object={hasRoom ? 'true' : 'false'}>
      <div className="about-copy">
        <div className="panel-block">
          <span className="panel-label">OPERATOR</span>
          <p className="panel-big">SEVEREDARCHIVE</p>
        </div>
        <div className="panel-block">
          <span className="panel-label">FIELD</span>
          <p className="panel-big">MOTION + VISUAL ART</p>
        </div>
        <div className="panel-block">
          <span className="panel-label">BACKSTORY</span>
          <p>
            Blender-built worlds set to music. Chrome, glass, and metal — still frames and
            moving sequences in a neo-2000s register. The archive updates when the renders survive.
          </p>
        </div>
        <div className="panel-block">
          <span className="panel-label">TOOLING</span>
          <p>BLENDER · GEOMETRY NODES · SOUND-SYNCED SEQUENCING</p>
        </div>
      </div>
      {/* No spinner: the object is decorative, so its absence is an empty
          column for a moment rather than something to announce. */}
      {hasRoom && (
        <Suspense fallback={<div className="ascii-object" aria-hidden="true" />}>
          <AboutAsciiObject tier={tier} />
        </Suspense>
      )}
    </div>
  )
}
