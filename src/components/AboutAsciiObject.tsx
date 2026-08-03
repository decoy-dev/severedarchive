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
    let renderer: THREE.WebGLRenderer
    let effect: AsciiEffect

    const scene = new THREE.Scene()
    const camera = new THREE.PerspectiveCamera(27, 1, 0.1, 5000)

    try {
      renderer = new THREE.WebGLRenderer({ alpha: true, antialias: false, powerPreference: 'low-power' })
    } catch {
      showFallback()
      return
    }
    renderer.setClearColor(0x000000, 0)
    renderer.outputColorSpace = THREE.SRGBColorSpace
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, lite ? 1 : 1.35))

    effect = new AsciiEffect(renderer, ' .,:;irsXA253hMHGS#9B&@', {
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
      camera.position.set(0, 0, Math.max(fitHeight, fitWidth) * 1.18 + dimensions.z)
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

    function resize() {
      const rect = host!.getBoundingClientRect()
      size = { width: Math.max(1, Math.round(rect.width)), height: Math.max(1, Math.round(rect.height)) }
      renderer.setSize(size.width, size.height, false)
      effect.setSize(size.width, size.height)
      fitCamera()
      if (ready) render(performance.now(), true)
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

    new SVGLoader()
      .loadAsync(`${import.meta.env.BASE_URL}assets/about-upload-mark.svg`)
      .then((data) => {
        // A load that lands after the tab was left must not build a scene.
        if (disposed) return
        const shapes = data.paths.flatMap((path) => path.toShapes())
        geometry = new THREE.ExtrudeGeometry(shapes, {
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

        material = new THREE.MeshStandardMaterial({ color: 0xf4f8f1, roughness: 0.43, metalness: 0.48 })
        sideMaterial = new THREE.MeshStandardMaterial({ color: 0x465044, roughness: 0.58, metalness: 0.36 })

        model = new THREE.Mesh(geometry, [material, sideMaterial])
        scene.add(model)
        fitCamera()
        ready = true
        host.dataset.state = reduced ? 'static' : lite ? 'lite' : 'live'
        render(performance.now(), true)
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
      geometry?.dispose()
      material?.dispose()
      sideMaterial?.dispose()
      renderer.dispose()
      effect.domElement.remove()
      // The panel unmounts on every tab switch, so anything left attached here
      // accumulates one node per visit.
      host.querySelector('.ascii-fallback')?.remove()
      delete host.dataset.state
    }
  }, [tier])

  return <div className="ascii-object" ref={hostRef} aria-hidden="true" />
}
