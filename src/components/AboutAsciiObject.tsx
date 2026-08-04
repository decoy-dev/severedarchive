import { useEffect, useRef } from 'react'
import * as THREE from 'three'
import { SVGLoader } from 'three/addons/loaders/SVGLoader.js'
import { AsciiEffect, type AsciiEffectOptions } from 'three/addons/effects/AsciiEffect.js'
import { animate, createScope } from 'animejs'
import { prefersReducedMotion, type PerfTier } from '../lib/perfTier'

/**
 * The About-page upload mark: the traced SVG extruded into a real beveled solid
 * and rendered through an ASCII luminance pass, so turning it exposes visibly
 * different character density on the side faces. That density change is the
 * whole point — it is what makes it read as 3D rather than a CSS-rotated image.
 *
 * Every tuned constant here is carried over verbatim from the browser-verified
 * prototype in `docs/prototypes/about-ascii-3d/`. They are not re-derived, and
 * the two that look arbitrary are not:
 *
 * - `strResolution: 'low'` applies the calibrated negative letter-spacing that
 *   matches Courier's character advance to the sampled canvas. `medium` leaves
 *   the advance wider than the renderer, so the left-anchored raster drifts
 *   right and the object no longer sits in its own box.
 * - `invert: false` is what produces a transparent field with characters only
 *   where the object is lit, instead of a filled rectangle of glyphs.
 *
 * Decorative: the effect DOM is aria-hidden and never enters the tab order.
 */

/**
 * The built solid, cached per tier and shared by every mount.
 *
 * Warming the chunk and the SVG file was not enough to stop the object popping
 * in: with both already cached the tab still took ~390ms to go live, because
 * parsing the SVG and extruding it — with bevels, at `curveSegments: 8` — is
 * real work that was happening after the panel mounted. This moves that work
 * into the site's start-up, where nothing is waiting on it.
 *
 * Cached by tier because `bevelSegments` differs between them, and never
 * disposed: it outlives every mount by design, so the trip to ABOUT and back
 * costs nothing at all the second time.
 */
const geometryCache = new Map<string, Promise<THREE.ExtrudeGeometry>>()

function markGeometry(lite: boolean): Promise<THREE.ExtrudeGeometry> {
  const key = lite ? 'lite' : 'full'
  const cached = geometryCache.get(key)
  if (cached) return cached
  const built = new SVGLoader()
    .loadAsync(`${import.meta.env.BASE_URL}assets/about-upload-mark.svg`)
    .then((data) => {
      const shapes = data.paths.flatMap((path) => path.toShapes())
      const geometry = new THREE.ExtrudeGeometry(shapes, {
        depth: 20,
        steps: 1,
        curveSegments: 8,
        bevelEnabled: true,
        bevelThickness: 3,
        bevelSize: 2.1,
        bevelSegments: lite ? 1 : 3,
      })
      // SVG y points down; flip once, then centre from the ACTUAL bounds.
      // Hand-authored offsets are what let a rotation drift off-axis.
      geometry.scale(1, -1, 1)
      geometry.computeBoundingBox()
      const center = new THREE.Vector3()
      geometry.boundingBox!.getCenter(center)
      geometry.translate(-center.x, -center.y, -center.z)
      geometry.computeBoundingBox()
      geometry.computeVertexNormals()
      return geometry
    })
  geometryCache.set(key, built)
  // A failed build must not be cached as a permanent failure — the component
  // falls back to the flat SVG, and a later mount may well succeed.
  built.catch(() => geometryCache.delete(key))
  return built
}

/**
 * Renderer and ASCII pass, built once and kept.
 *
 * This is where the pop-in actually lived. With the chunk, the file and the
 * geometry all warm, the tab still took ~330ms to show anything, and the gap
 * was between the host mounting (3.7ms) and the effect's DOM appearing
 * (329ms) — i.e. `new THREE.WebGLRenderer`. Creating a WebGL context is that
 * expensive, and it was happening on the click.
 *
 * So the rig is created during start-up and reused for the life of the page.
 * The object is a singleton — one decorative mark on one tab, never two at
 * once — so a single retained context is the same cost the old code paid per
 * visit, minus the wait. It is deliberately never disposed; the component
 * detaches the effect's DOM on unmount and leaves the rig alone.
 */
type Rig = { renderer: THREE.WebGLRenderer; effect: AsciiEffect }
const rigCache = new Map<string, Rig | null>()

function markRig(lite: boolean): Rig | null {
  const key = lite ? 'lite' : 'full'
  if (rigCache.has(key)) return rigCache.get(key) ?? null

  let renderer: THREE.WebGLRenderer
  try {
    renderer = new THREE.WebGLRenderer({ alpha: true, antialias: false, powerPreference: 'low-power' })
  } catch {
    // No WebGL: cached as a null rig so every later mount goes straight to the
    // flat fallback instead of retrying a context that will not come.
    rigCache.set(key, null)
    return null
  }
  renderer.setClearColor(0x000000, 0)
  renderer.outputColorSpace = THREE.SRGBColorSpace
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, lite ? 1 : 1.35))

  const effect = new AsciiEffect(renderer, ' .,:;irsXA253hMHGS#9B&@', {
    resolution: lite ? 0.12 : 0.18,
    scale: 1,
    color: false,
    alpha: true,
    block: false,
    invert: false,
    // `strResolution` is missing from @types/three's AsciiEffectOptions but is
    // read by the runtime (three/examples/jsm/effects/AsciiEffect.js) and
    // documented in its own JSDoc. Stated explicitly rather than left to the
    // default because it is the setting the prototype's alignment depends on.
    strResolution: 'low',
  } as AsciiEffectOptions & { strResolution: 'low' })
  effect.domElement.setAttribute('aria-hidden', 'true')

  const rig = { renderer, effect }
  rigCache.set(key, rig)
  return rig
}

/**
 * Build the solid and the renderer now, from the app's start-up, so the first
 * visit to ABOUT renders on its first frame. Called via `preloadAboutObject`.
 */
export function warmAboutObject(tier: PerfTier): void {
  const lite = tier === 'lite'
  void markGeometry(lite).catch(() => {})
  markRig(lite)
}

export default function AboutAsciiObject({ tier }: { tier: PerfTier }) {
  const hostRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    const host = hostRef.current
    if (!host) return

    const lite = tier === 'lite'
    const reduced = prefersReducedMotion()

    let raf = 0
    let disposed = false
    let ready = false
    let lastRender = -Infinity
    let size = { width: 1, height: 1 }
    let model: THREE.Mesh | null = null
    let geometry: THREE.ExtrudeGeometry | null = null
    let material: THREE.MeshStandardMaterial | null = null
    let sideMaterial: THREE.MeshStandardMaterial | null = null
    const scene = new THREE.Scene()
    const camera = new THREE.PerspectiveCamera(27, 1, 0.1, 5000)

    // Warm if start-up got there first, built here if it did not.
    const rig = markRig(lite)
    if (!rig) {
      showFallback()
      return
    }
    const { renderer, effect } = rig
    host.appendChild(effect.domElement)

    scene.add(new THREE.HemisphereLight(0xf5fff0, 0x111810, 1.15))
    const key = new THREE.DirectionalLight(0xffffff, 3.2)
    key.position.set(-320, 380, 620)
    scene.add(key)
    const rim = new THREE.DirectionalLight(0xb6ff2e, 1.8)
    rim.position.set(430, -180, -360)
    scene.add(rim)

    // Reduced motion gets a single three-quarter pose: the ASCII treatment is
    // the content and survives, only the sway is removed.
    const motion = {
      yaw: reduced ? -0.34 : -0.52,
      pitch: reduced ? 0.11 : -0.14,
      roll: reduced ? -0.03 : -0.065,
      depth: 0,
    }

    const scope = createScope({ root: host })
    if (!reduced) {
      scope.add(() => {
        animate(motion, { yaw: [-0.52, 0.52], duration: 3600, alternate: true, loop: true, ease: 'inOutSine' })
        animate(motion, { pitch: [-0.14, 0.18], duration: 3000, alternate: true, loop: true, ease: 'inOutSine' })
        animate(motion, { roll: [-0.065, 0.065], duration: 4200, alternate: true, loop: true, ease: 'inOutSine' })
        animate(motion, { depth: [-5, 5], duration: 2600, alternate: true, loop: true, ease: 'inOutSine' })
      })
    }

    function fitCamera() {
      camera.aspect = size.width / size.height
      camera.updateProjectionMatrix()
      if (!geometry?.boundingBox) return
      const dimensions = new THREE.Vector3()
      geometry.boundingBox.getSize(dimensions)
      const fov = THREE.MathUtils.degToRad(camera.fov)
      const fitHeight = dimensions.y / (2 * Math.tan(fov / 2))
      const fitWidth = dimensions.x / (2 * Math.tan(fov / 2) * camera.aspect)
      // The margin covers the animated yaw/pitch/roll and the ±5 depth drift —
      // the object must not clip at the extremes of its own motion. 1.18 was
      // far more than that needs and left it reading small in its column: it
      // filled ~85% of the box on the limiting axis. 1.06 measures ~94% and
      // still clears the rotation. Anything tighter starts shaving the mark's
      // corners at full yaw.
      camera.position.set(0, 0, Math.max(fitHeight, fitWidth) * 1.06 + dimensions.z)
      camera.lookAt(0, 0, 0)
    }

    function render(time: number, force = false) {
      if (!ready || disposed || document.hidden || !model) return
      const frameMs = 1000 / (lite ? 12 : 24)
      // AsciiEffect rebuilds DOM text on every pass, which is far more expensive
      // than a canvas draw — hence a redraw cap well under display refresh.
      if (!force && time - lastRender < frameMs) return
      lastRender = time
      model.rotation.set(motion.pitch, motion.yaw, motion.roll)
      model.position.z = motion.depth
      effect.render(scene, camera)
    }

    function tick(time: number) {
      render(time)
      if (!reduced && !disposed) raf = requestAnimationFrame(tick)
    }

    /**
     * Fit the rendered glyph block to the box, and centre it.
     *
     * AsciiEffect chooses its own column count and the result almost never
     * divides the box evenly — measured at 1440px it lays out 561px of columns
     * inside a 551px host. The excess was clipped off the right, which both cut
     * the mark and pushed what remained a few characters left of centre, so the
     * object read as off-centre in a column that is in fact centred exactly
     * between the copy and the panel edge.
     *
     * Scaling by the overflow ratio is the fix that does not fight the effect
     * for control of its own grid: ~2% on a field of text is invisible, and the
     * alternative (hunting for a width that happens to divide evenly) would
     * have to re-run on every resize and could fail to find one.
     */
    function fitEffect() {
      const dom = effect.domElement as HTMLElement
      const table = dom.firstElementChild
      if (!table || !host) return
      // Cleared before measuring, or the second pass measures a block that is
      // already scaled and concludes it fits — which is how this silently did
      // nothing the first time.
      dom.style.transform = ''
      const range = document.createRange()
      range.selectNodeContents(table)
      const ink = range.getBoundingClientRect()
      if (!ink.width || !size.width) return
      const scale = Math.min(1, size.width / ink.width)
      if (scale >= 1) return
      // From the LEFT edge, not the centre. The glyph block starts at the div's
      // left and is wider than it, so scaling about the centre pulls the left
      // edge inward and leaves the same overshoot on the right — measured, it
      // was still 5px out. From the left, the block lands exactly on the box:
      // ink centre 1060 against an ideal 1060.
      dom.style.transformOrigin = 'left center'
      dom.style.transform = `scale(${scale.toFixed(4)})`
    }

    function resize() {
      const rect = host!.getBoundingClientRect()
      size = { width: Math.max(1, Math.round(rect.width)), height: Math.max(1, Math.round(rect.height)) }
      renderer.setSize(size.width, size.height, false)
      effect.setSize(size.width, size.height)
      fitCamera()
      if (ready) {
        render(performance.now(), true)
        fitEffect()
      }
    }

    // ResizeObserver rather than window.resize: the terminal window is its own
    // box and may change size without the viewport doing so.
    const resizeObserver = new ResizeObserver(resize)
    resizeObserver.observe(host)
    resize()

    function showFallback() {
      if (!host) return
      host.dataset.state = 'error'
      const img = document.createElement('img')
      img.src = `${import.meta.env.BASE_URL}assets/about-upload-mark.svg`
      img.alt = ''
      img.className = 'ascii-fallback'
      host.appendChild(img)
    }

    const onVisibility = () => { if (!document.hidden && ready) render(performance.now(), true) }
    document.addEventListener('visibilitychange', onVisibility)

    // Already built if the site warmed it during start-up, which is the point:
    // this resolves in a microtask rather than after a parse and an extrude.
    markGeometry(lite)
      .then((built) => {
        // A build that lands after the tab was left must not make a scene.
        if (disposed) return
        geometry = built

        material = new THREE.MeshStandardMaterial({ color: 0xf4f8f1, roughness: 0.43, metalness: 0.48 })
        sideMaterial = new THREE.MeshStandardMaterial({ color: 0x465044, roughness: 0.58, metalness: 0.36 })

        model = new THREE.Mesh(geometry, [material, sideMaterial])
        scene.add(model)
        fitCamera()
        ready = true
        host.dataset.state = reduced ? 'static' : lite ? 'lite' : 'live'
        render(performance.now(), true)
        fitEffect()
        if (!reduced) raf = requestAnimationFrame(tick)
      })
      .catch(() => { if (!disposed) showFallback() })

    return () => {
      disposed = true
      cancelAnimationFrame(raf)
      scope.revert()
      resizeObserver.disconnect()
      document.removeEventListener('visibilitychange', onVisibility)
      if (model) scene.remove(model)
      // NOT disposed: the geometry is the shared cached build (see
      // `markGeometry`) and outlives this mount on purpose. Disposing it here
      // would hand the next visit a gutted buffer. Materials are per-mount.
      material?.dispose()
      sideMaterial?.dispose()
      // The rig is shared and outlives this mount (see `markRig`) — detach its
      // DOM, but do not dispose the renderer or the context behind it.
      effect.domElement.remove()
      // The panel unmounts on every tab switch, so anything left attached here
      // accumulates one node per visit.
      host.querySelector('.ascii-fallback')?.remove()
      delete host.dataset.state
    }
  }, [tier])

  return <div className="ascii-object" ref={hostRef} aria-hidden="true" />
}
