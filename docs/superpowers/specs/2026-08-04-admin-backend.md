# Admin backend — upload, edit, publish

Owner decisions, 2026-08-04: **GitHub stays the store**, auth must be **genuinely
private** (a passcode a visitor cannot read), and **only renditions are
committed — raws stay out, including uploads**. Transcode happens server-side.

## The tension, and how it resolves

Those three together rule out a purely static solution. A passcode checked in
the browser is readable by anyone who opens devtools; "genuinely private" means
the secret lives somewhere the visitor cannot reach. That is a server — but it
does **not** have to be the store, and it does not have to run ffmpeg.

So the shape is:

- **A small function** (Cloudflare Worker or Vercel/Netlify function) holds the
  passcode hash and a GitHub token. It is an auth and dispatch shim, nothing
  else — no database, no media, no site.
- **GitHub remains the store.** Renditions and metadata are committed to the
  repo; the site stays a static build on Pages.
- **GitHub Actions is the transcoder.** `ffmpeg` runs there, which is what makes
  "server-side transcode with no server to maintain" true.

## The raw-file problem

Raws must never enter the repo, but the Action needs the raw to transcode it.
The staging area is a **GitHub Release asset**, not a commit: release assets
live outside the git tree, so nothing enters history. The Action downloads the
asset, transcodes, commits only the renditions, and deletes the asset. If the
run fails the asset is still deleted — the retry re-uploads.

## Flow

1. `POST /api/session` — passcode in, HMAC-signed short-lived token out, set as
   an httpOnly cookie. Rate-limited; the passcode itself never leaves the
   function's memory and its hash never leaves the environment.
2. `POST /api/upload` — token required. The function uploads the raw to the
   staging release and fires `repository_dispatch` with the entry's fields.
3. **Action `ingest.yml`** — downloads the raw, runs the existing
   `process-media.sh` ladder (`_thumb` 240p, `_full` 720p, `_poster.jpg`),
   probes with ffprobe, writes the entry and the generated media metadata,
   commits **renditions only**, deletes the staging asset, and dispatches
   `deploy.yml`.
4. `POST /api/content` — same auth, no media: edits the ABOUT copy and the LINKS
   rows. Commits a JSON file directly and deploys. No transcode step.

Publishing is therefore not instant — upload, transcode, commit, deploy is
minutes, not seconds. That is the cost of keeping GitHub as the store, and it
was accepted knowingly.

## Data model

The archive moves out of `src/data/archive.ts` and into a committed JSON file
the Action writes and the app imports. Hand-authored fields stay hand-authored;
everything measurable still comes from ffprobe.

New per-entry fields, all owner-supplied at upload:

- `description` — long text, shown by the `(i)` control in the viewer and on the
  dashboard card.
- `date` — ISO date. **Pre-filled with the uploading device's date**, editable,
  and the list sorts by it, newest first. Backdating an entry therefore places
  it correctly rather than at the top.
- `postUrl` — the Instagram permalink, currently the profile for all twelve.

`kind` already exists (`video` | `photo`); a photo upload skips the transcode
ladder and stores a poster only.

## Order of work

1. **Auth core** — passcode hashing, verification, session tokens. Pure and
   tested, no platform. ← *first slice, in progress*
2. Function endpoints around it, plus rate limiting.
3. `ingest.yml` and the data-file migration.
4. Admin UI: upload form, ABOUT and LINKS editors.
5. `(i)` popover, date sorting, photo support in the explorer.

## Invariants

- The passcode hash and the GitHub token exist **only** in the function's
  environment. Neither is ever sent to the browser, in any form.
- Nothing under `raw/` is ever committed. The Action commits renditions and
  metadata, nothing else.
- A failed ingest leaves no staged asset behind.
- The site keeps working with the function offline: it is a static build, and
  publishing is the only thing that stops.
