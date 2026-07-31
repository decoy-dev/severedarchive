# Finished ASCII-3D reference

This is the executed visual reference for the severedarchive About-page object. It is self-contained and does not depend on the main application bundle.

From the repository root:

```bash
python3 -m http.server 4179
```

Open:

- `http://127.0.0.1:4179/docs/prototypes/about-ascii-3d/`
- lite tier: `http://127.0.0.1:4179/docs/prototypes/about-ascii-3d/?lite`
- deterministic reduced-motion preview: `http://127.0.0.1:4179/docs/prototypes/about-ascii-3d/?reduce`

The prototype contains only the requested effect: finished extrusion, material, lighting, ASCII density, faster centered sway, reduced-motion behavior, and fallback on a neutral stage. It deliberately contains no destination-page UI. Claude should port `prototype.js` into a React effect with the lifecycle described in `../../ABOUT-ASCII-3D-HANDOFF.md`; it should not redesign the visual.

Vendored libraries are included only so the reference runs unchanged:

- Three.js 0.185.0 (MIT)
- anime.js 4.5.0 (MIT)
