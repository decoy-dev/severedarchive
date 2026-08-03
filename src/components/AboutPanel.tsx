import { Suspense, lazy } from 'react'
import type { PerfTier } from '../lib/perfTier'
import { useMediaQuery } from '../hooks/useMediaQuery'

/**
 * Split out, not statically imported: three.js is ~590kB of the bundle and this
 * is one decorative object on one tab. Loading it with the app would triple the
 * cost of the first paint for everyone who never opens ABOUT. The panel only
 * mounts when the tab is selected, so the chunk is fetched exactly then.
 */
const AboutAsciiObject = lazy(() => import('./AboutAsciiObject'))

export default function AboutPanel({ tier }: { tier: PerfTier }) {
  // Not a CSS hide: at 390px the copy already fills the panel, so the object
  // would render into a box with no room and the page must not scroll to make
  // some. Gating the mount rather than the display also means a phone never
  // fetches the three.js chunk at all.
  const hasRoom = useMediaQuery('(min-width: 641px)')

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
