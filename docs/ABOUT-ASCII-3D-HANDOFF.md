# Claude handoff — About-page ASCII 3D upload object

**Date:** 2026-07-31  
**Status:** Asset prepared; implementation not started  
**Target:** `ABOUT` tab in severedarchive  
**Source asset:** `public/assets/about-upload-mark.svg`  
**Regeneration script:** `scripts/trace-about-symbol.py`

## Request

Add the supplied hands/floppy/upload mark to the About page as a genuinely three-dimensional, beveled object rendered through an ASCII filter. It should rotate and sway slowly around its own center, with its centroid held on the camera's z-axis—no orbital drift around the panel.

The effect should feel like a recovered terminal artifact, not a generic spinning-logo demo: acid-green monochrome characters, visible changes in face/edge density as the object turns, slow irregular sway, and no mouse-controlled orbit.

## Prepared geometry source

`public/assets/about-upload-mark.svg` is a clean compound-path trace of the supplied 1080px JPEG:

- 9 contour regions
- 231 points
- 4.8KB
- holes preserved with even-odd fill
- accessible title/description embedded
- whitespace cropped while retaining a small extrusion-safe margin

Do not use the original JPEG as a texture. Load this SVG, turn each loaded shape into `ExtrudeGeometry`, and center the finished group from its computed bounding box. This creates actual side faces and bevels that the ASCII luminance pass can reveal during rotation.

The trace can be regenerated with:

```bash
python3 scripts/trace-about-symbol.py \
  /Users/chrishaddox/Downloads/472509268_1670588143855780_5406164983555320578_n.jpg \
  public/assets/about-upload-mark.svg
```

## Intended visual result

- The About copy remains readable and primary.
- On desktop/tablet, the ASCII object occupies roughly the right 42–48% of the panel and is vertically centered.
- On narrow mobile, it becomes a large, low-opacity background watermark behind the copy; it must not add page height or create scroll.
- Characters use Share Tech Mono and the existing `--acid` color. Do not introduce another font or a new gradient.
- The object should show a bright front face, darker side faces, and a narrow specular band when it sways. The ASCII pass translates that lighting into character density.
- Keep the surrounding background transparent so the existing glass/video environment remains visible. There must not be a rectangular black canvas.

## Implementation shape

Create `src/components/AboutAsciiObject.tsx` and mount it from `AboutPanel`. Add `three` as the only new runtime dependency. Use Three's official addon imports:

```ts
import * as THREE from 'three'
import { SVGLoader } from 'three/addons/loaders/SVGLoader.js'
import { AsciiEffect } from 'three/addons/effects/AsciiEffect.js'
```

Use the current `ShapePath.toShapes()` API rather than deprecated `SVGLoader.createShapes()`:

```ts
const data = await new SVGLoader().loadAsync(
  `${import.meta.env.BASE_URL}assets/about-upload-mark.svg`,
)
const shapes = data.paths.flatMap((path) => path.toShapes())
const geometry = new THREE.ExtrudeGeometry(shapes, {
  depth: 18,
  steps: 1,
  curveSegments: 8,
  bevelEnabled: true,
  bevelThickness: 2.4,
  bevelSize: 1.8,
  bevelSegments: 3,
})
```

Those extrusion numbers are starting values, not arbitrary requirements. Tune by eye so the side faces remain readable through the ASCII filter without making the mark look inflated.

SVG coordinates point downward. Flip y once, compute the bounding box, translate the geometry so its center is `(0, 0, 0)`, then scale the parent group to fit the camera. Do not visually center it with hand-authored x/y offsets; centering from actual bounds is what keeps rotation pinned to the z-axis.

### ASCII effect

Create the renderer with an alpha channel, then use `AsciiEffect.domElement` instead of the raw renderer canvas:

```ts
const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: false })
renderer.setClearColor(0x000000, 0)

const effect = new AsciiEffect(renderer, ' .:-=+*#%@', {
  resolution: 0.17,
  scale: 1,
  color: false,
  alpha: true,
  block: false,
  invert: true,
  strResolution: 'medium',
})
```

The exact `invert` value must be judged in the browser. The acceptance criterion is a blank/transparent field with dense characters only where the object is lit—not a full rectangle of background characters.

Style `effect.domElement` through a class, not inline one-off colors:

- `position: absolute; inset: 0`
- `overflow: hidden`
- `pointer-events: none`
- `color: var(--acid)`
- `background: transparent`
- `font-family: var(--mono)` / Share Tech Mono
- tight line height, tuned so the silhouette has no horizontal banding
- `contain: strict`

### Material and light

Use a neutral light material because ASCII density, not literal surface color, should carry the form. A restrained setup is enough:

- `MeshStandardMaterial`, light gray front/side response, roughness around `0.45`, metalness around `0.55`
- low ambient/hemisphere fill
- one key light above/front-left
- one weaker rim light behind/right
- perspective camera in the 24–30° range

Avoid bloom, postprocessing, particles, orbit controls, drop shadows, or another noise overlay. The ASCII conversion is the treatment.

## Motion

Use the project's anime.js v4, scoped to the component, to animate a small motion-state object or the group rotation. The renderer reads that state each frame.

Motion should be slow, asymmetric, and centered:

| Channel | Range | Suggested duration |
|---|---:|---:|
| yaw / `rotation.y` | `-0.32` to `0.32` rad | 6.4s alternate |
| pitch / `rotation.x` | `-0.08` to `0.11` rad | 5.1s alternate |
| roll / `rotation.z` | `-0.035` to `0.035` rad | 7.3s alternate |
| depth / `position.z` | `-5` to `5` local units | 4.8s alternate |

Use `inOutSine` or an equivalent smooth periodic ease. Keep `position.x` and `position.y` at zero. Do not perform a full perpetual 360° product spin—the slow face-to-edge sway will preserve recognition and make the extrusion legible.

Cap ASCII redraws to roughly 24fps even if the animation loop runs at display refresh. `AsciiEffect` rebuilds DOM text and is much more expensive than a normal canvas render.

## React lifecycle and performance

The About panel only mounts while its tab is selected, so initialize lazily on mount and tear down completely on unmount.

Required cleanup:

- cancel the animation frame;
- revert the anime.js scope/animations;
- disconnect `ResizeObserver`;
- remove the effect DOM node;
- dispose geometry, materials, and renderer;
- ignore a late SVG load after unmount;
- pause redraws when `document.hidden` is true.

Use `ResizeObserver` on the host element and call both renderer/effect sizing and camera projection updates from the measured box. Do not listen only to `window.resize`; the terminal window itself is draggable and may later become resizable.

Pass the performance tier into `AboutPanel` and then into `AboutAsciiObject` rather than querying the DOM:

```tsx
{tab === 'about' && <AboutPanel tier={tier} />}
```

Suggested tiers:

- normal: resolution `0.17`, capped near 24fps;
- lite: resolution `0.11–0.13`, capped near 12fps, simpler material and no bevel increase;
- failed WebGL/load: show the prepared SVG as a static, low-opacity fallback.

For `prefers-reduced-motion`, render a single three-quarter pose and stop the animation loop after the first successful render. The ASCII treatment remains; only the sway is removed.

## Layout

Reshape `.about-panel` into a two-layer composition without introducing scrolling:

```text
┌────────────────────────────────────────────┐
│ OPERATOR / FIELD / BACKSTORY / TOOLING     │
│ copy column                    ASCII OBJ   │
│                                 centered   │
└────────────────────────────────────────────┘
```

- Keep copy within approximately 52–58% width on desktop.
- The object host is absolute or occupies the second grid column with `min-height: 0` and `overflow: hidden`.
- At widths where the copy needs the full panel, place the object behind it, reduce opacity, and add a subtle solid/gradient-free scrim using the existing panel color only if contrast needs help.
- Confirm the terminal body and document remain zero-scroll at 1440, 768, and 390 widths.

The object is decorative. The effect DOM should be `aria-hidden="true"`; keep a concise accessible description on the containing figure or provide visually hidden text. It must never enter the tab order.

## Tests and acceptance criteria

Automated checks:

1. About tab mounts one ASCII host and unmounts it when leaving the tab.
2. No extra canvas/effect nodes accumulate after repeated ABOUT ↔ LINKS switches.
3. Reduced-motion mode does not schedule continuous frames.
4. The static SVG fallback appears when WebGL initialization or asset loading fails.
5. No vertical document scroll at 1440, 768, or 390.

Manual visual checks:

1. The hands, floppy disk, center hole, and upload arrow remain recognizable throughout the sway.
2. Turning exposes visibly different side-face character density, proving it is 3D rather than a CSS-rotated flat image.
3. Rotation stays centered; the object does not orbit or wobble laterally.
4. The ASCII field has no visible rectangular background.
5. Copy contrast remains comfortable on every frame of the background video.
6. Repeated tab switching leaves no CPU/GPU activity from an unmounted About object.

## Sequencing note

Treat this as its own coherent task. Do not fold it into the explorer/media-lifecycle work in Tasks 10–14. The safest placement is after the existing cleanup/context tasks and before final deployment verification, unless Chris explicitly wants it pulled forward.

## Primary references

- Three.js `AsciiEffect`: https://threejs.org/docs/pages/AsciiEffect.html
- Three.js `SVGLoader`: https://threejs.org/docs/pages/SVGLoader.html
- Three.js `ExtrudeGeometry`: https://threejs.org/docs/pages/ExtrudeGeometry.html
- Three.js migration note: `SVGLoader.createShapes()` is deprecated in favor of `ShapePath.toShapes()` as of r185: https://github.com/mrdoob/three.js/wiki/Migration-Guide#184--185

