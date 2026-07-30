# severedarchive

A single-page portfolio site styled as a retro terminal window: a boot sequence, a windowed OS chrome with tabs, an archive grid of video files, and a focus stage that plays the selected clip full-res.

Live: https://decoy-dev.github.io/severedarchive/

## Development

```
npm install
npm run dev
```

Other scripts:

- `npm run build`: type-check and build to `dist/`
- `npm run preview`: serve the production build locally
- `npm run lint`: lint the source (oxlint)
- `npm test`: unit tests (vitest)
- `npm run e2e`: end-to-end tests (playwright)

## Swapping in real videos

The archive ships with stock/placeholder clips. To replace them:

1. Drop source `.mp4` files into `raw/`: one background loop as `raw/bg.mp4`, and one clip per archive entry as `raw/file01.mp4`, `raw/file02.mp4`, etc.
2. Edit `src/data/archive.ts` to update titles, taglines, durations, and years (add or remove entries as needed; each entry's `id` must match its `raw/` filename).
3. Run `scripts/process-media.sh` to re-encode everything into the size/quality tiers the site expects (thumb, full, poster) and write them to `public/media/`.

`raw/` is gitignored; only the processed output in `public/media/` is committed.

## Deployment

Pushing to `main` runs `.github/workflows/deploy.yml`, which builds the site and publishes `dist/` to GitHub Pages.
