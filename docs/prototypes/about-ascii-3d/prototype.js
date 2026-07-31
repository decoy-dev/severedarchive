import * as THREE from 'three'
import { SVGLoader } from 'three/addons/loaders/SVGLoader.js'
import { AsciiEffect } from 'three/addons/effects/AsciiEffect.js'
import { animate, createScope } from './vendor/anime.esm.min.js'

const host = document.querySelector('#ascii-object')
const params = new URLSearchParams(window.location.search)
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches || params.has('reduce')
const lite = params.has('lite')

let raf = 0
let disposed = false
let ready = false
let lastRender = -Infinity
let size = { width: 1, height: 1 }
let model = null
let geometry = null
let material = null
let sideMaterial = null

const scene = new THREE.Scene()
const camera = new THREE.PerspectiveCamera(27, 1, 0.1, 5000)
const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: false, powerPreference: 'low-power' })
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
  // `medium` leaves Courier's character advance wider than the sampled canvas,
  // so the left-anchored ASCII raster drifts right. `low` applies the calibrated
  // negative letter-spacing and keeps the glyph grid aligned to the renderer.
  strResolution: 'low',
})
effect.domElement.setAttribute('aria-hidden', 'true')
host.appendChild(effect.domElement)

scene.add(new THREE.HemisphereLight(0xf5fff0, 0x111810, 1.15))

const key = new THREE.DirectionalLight(0xffffff, 3.2)
key.position.set(-320, 380, 620)
scene.add(key)

const rim = new THREE.DirectionalLight(0xb6ff2e, 1.8)
rim.position.set(430, -180, -360)
scene.add(rim)

const motion = {
  yaw: reducedMotion ? -0.34 : -0.52,
  pitch: reducedMotion ? 0.11 : -0.14,
  roll: reducedMotion ? -0.03 : -0.065,
  depth: 0,
}

const scope = createScope({ root: host })

if (!reducedMotion) {
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
  if (!geometry) return

  const box = geometry.boundingBox
  const dimensions = new THREE.Vector3()
  box.getSize(dimensions)
  const fov = THREE.MathUtils.degToRad(camera.fov)
  const fitHeight = dimensions.y / (2 * Math.tan(fov / 2))
  const fitWidth = dimensions.x / (2 * Math.tan(fov / 2) * camera.aspect)
  camera.position.set(0, 0, Math.max(fitHeight, fitWidth) * 1.18 + dimensions.z)
  camera.lookAt(0, 0, 0)
}

function resize() {
  const rect = host.getBoundingClientRect()
  size = { width: Math.max(1, Math.round(rect.width)), height: Math.max(1, Math.round(rect.height)) }
  renderer.setSize(size.width, size.height, false)
  effect.setSize(size.width, size.height)
  fitCamera()
  if (ready) render(performance.now(), true)
}

const resizeObserver = new ResizeObserver(resize)
resizeObserver.observe(host)
resize()

function render(time, force = false) {
  if (!ready || disposed || document.hidden) return
  const frameMs = 1000 / (lite ? 12 : 24)
  if (!force && time - lastRender < frameMs) return
  lastRender = time

  model.rotation.set(motion.pitch, motion.yaw, motion.roll)
  model.position.z = motion.depth
  effect.render(scene, camera)
}

function tick(time) {
  render(time)
  if (!reducedMotion && !disposed) raf = requestAnimationFrame(tick)
}

async function loadModel() {
  try {
    const data = await new SVGLoader().loadAsync('./assets/about-upload-mark.svg')
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
    geometry.scale(1, -1, 1)
    geometry.computeBoundingBox()

    const center = new THREE.Vector3()
    geometry.boundingBox.getCenter(center)
    geometry.translate(-center.x, -center.y, -center.z)
    geometry.computeBoundingBox()
    geometry.computeVertexNormals()

    material = new THREE.MeshStandardMaterial({
      color: 0xf4f8f1,
      roughness: 0.43,
      metalness: 0.48,
    })
    sideMaterial = new THREE.MeshStandardMaterial({
      color: 0x465044,
      roughness: 0.58,
      metalness: 0.36,
    })

    model = new THREE.Mesh(geometry, [material, sideMaterial])
    scene.add(model)
    fitCamera()
    ready = true
    host.dataset.state = reducedMotion ? 'static' : lite ? 'lite' : 'live'
    render(performance.now(), true)
    if (!reducedMotion) raf = requestAnimationFrame(tick)
  } catch (error) {
    console.error(error)
    host.dataset.state = 'error'
    host.classList.add('has-error')
    const fallback = document.createElement('img')
    fallback.src = './assets/about-upload-mark.svg'
    fallback.alt = ''
    fallback.className = 'static-fallback'
    host.appendChild(fallback)
  }
}

function dispose() {
  disposed = true
  cancelAnimationFrame(raf)
  scope.revert()
  resizeObserver.disconnect()
  geometry?.dispose()
  material?.dispose()
  sideMaterial?.dispose()
  renderer.dispose()
  effect.domElement.remove()
}

window.addEventListener('pagehide', dispose, { once: true })
document.addEventListener('visibilitychange', () => {
  if (!document.hidden && ready) render(performance.now(), true)
})

loadModel()
