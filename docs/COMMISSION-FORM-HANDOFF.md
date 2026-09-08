# Handoff — commission form, Turnstile, and the panel motion

**Date:** 2026-08-24
**Status:** Live and working. Two follow-ups open (below), neither blocking.
**Live commits:** `522ff45` (the form), `aac6f3c` (the recede on close)
**Worker version:** `fcfa7c0a` — `severedarchive-admin`
**Turnstile sitekey:** `0x4AAAAAAEapxSlL6JpoKZky` (public; managed mode)

## What changed

The COMMISSIONS link used to be a redirect to a Tally form. It is now a panel on
this site: it opens out of the card, posts to the admin Worker, and arrives in the
client's inbox with the moodboard attached. Turnstile guards it.

Four smaller things came with it, all surfaced by the same content edit that
prompted the work (the client renamed `TOOLING` to `SERVICES` and gave it a
six-item list, which made the ABOUT copy taller than the panel).

## Where things live

| Concern | File |
|---|---|
| The ten questions, validation, size caps, Turnstile action | `src/lib/commissionFields.ts` |
| The browser's post (+ re-exports the above, + sitekey) | `src/lib/commission.ts` |
| The panel | `src/components/CommissionPanel.tsx` |
| The widget lifecycle | `src/hooks/useTurnstile.ts` |
| Enquiry parse, email composition, Resend send | `server/commission.ts` |
| Siteverify | `server/turnstile.ts` |
| Route, rate limit, ordering | `server/worker.ts` → `handleCommission` |
| "Opens out of what you clicked" | `src/lib/openFrom.ts` |
| Admin commit messages | `server/contentMessage.ts` |

`server/` imports `src/lib/commissionFields.ts`. That is the only server→src import
in the repo and it earns it: the notification email is a list of question/answer
pairs, so a second copy of the questions in `server/` would be a second copy to
keep in step. That module is deliberately free of React and of `import.meta.env`
so it imports cleanly on both sides.

## Configuration

Secrets on the Worker (`npx wrangler secret list` — note `npx`, wrangler is a
devDependency and not on PATH):

- `RESEND_API_KEY` — delivery
- `TURNSTILE_SECRET` — siteverify
- plus the three that predate this work

Vars in `wrangler.toml`:

- `COMMISSION_TO` = `chris@severedarchive.com`
- `COMMISSION_FROM` = `Severed Archive <commissions@severedarchive.com>` — **must**
  be on a domain verified in Resend, or every send 502s and it looks like a code bug
- `TURNSTILE_HOSTNAMES` = `severedarchive.com,www.severedarchive.com,decoy-dev.github.io`

Secrets survive `worker:deploy`; `[vars]` do **not** — they are declared in the
file, so a deploy overwrites whatever the dashboard says. Change those in the file.

## Decisions worth not relitigating

**Resend, not Cloudflare Email Sending.** `severedarchive.com`'s zone is in a
different Cloudflare account than the one this Worker deploys to
(`chris@hvddox.com`, `92162a0f…`), so the `send_email` binding has no verified
sender available. An API key crosses that account boundary; a binding cannot.
Turnstile is *not* subject to this — widgets are account-scoped and hostnames are
free strings, so the widget lives in the personal account regardless.

**The Turnstile token travels in a header, not a form field.** One deviation from
Turnstile's documented shape, and the reason is ordering: `formData()` is where the
10MB upload gets read, so a form field would mean parsing a bot's megabytes to
discover it was a bot. Verification is first and cheap, the rate limit second. The
cost is a CORS preflight, which `corsPreflight` advertises.

**`TURNSTILE_HOSTNAMES` omits localhost even though the widget allows it.**
Production honouring a token minted on localhost would defeat the check — anyone
can serve a page on their own localhost. Local work overrides it on the command
line; `wrangler.toml` documents how.

**Cloudflare's Turnstile testing keys do not work here.** The always-passes secret
returns `hostname: "example.com"` and **no `action` field**, so the strict
action+hostname check correctly rejects them. Local green-path testing needs the
real widget with `TURNSTILE_HOSTNAMES=localhost` in a gitignored `.dev.vars`.

**A fourth tab was tried and rejected.** The form was briefly a top-level tab; it
is a panel now, because a form nobody browses to does not belong in the site's
primary navigation.

## Bugs found while building this

Recorded because several were invisible until measured, and two would have shipped.

- **`body` shadowing in the verifier.** The params were built into `form` but the
  fetch init said `body`, which resolved to the hoisted `let body` declared *below*
  — undefined. Siteverify received an empty body, so **every check would have
  failed closed for the wrong reason.** Caught by the test asserting the secret is
  sent.
- **A clobbered import.** An edit deleted `import … from './github'`, leaving
  `readFile` and `dispatchEdit` undefined. Caught by four pre-existing tests.
- **`tsc -b` reported clean while that import was missing.** Incremental build info
  was stale. `npm run build` uses plain `tsc -b`, so **a green build is not proof on
  its own** — use `npx tsc -b --force` when it matters.
- **The form could hang in "STILL VERIFYING" forever.** With `api.js` served 200 but
  `window.turnstile` never defined — what an extension that neuters the script
  rather than blocking the request produces — the state machine never left
  `loading` and SUBMIT was permanently inert. Measured 21s, still stuck. Fixed with
  a watchdog on the *state*, which cannot be defeated by the loader misbehaving.
- **Reopening the panel mid-recede came back broken.** React reused the element, the
  entrance effect had already run, and it returned wearing the interrupted
  animation: `scale(0.968)` under a `2.6px` blur. Fixed by keying the panel per
  opening.
- **`max-height: 100%` did not cap the panel.** A percentage max-height against an
  auto-sized grid track resolves to none — the track depends on the content, the
  content on the track. It measured **1456px tall in a 775px window**, overflowing
  both ends with no way to reach either. Fixed with explicit `minmax(0, 1fr)` tracks.
- **StrictMode broke the open animation's origin.** Mount effects run twice in dev
  and the second pass measured an element anime had already scaled to 0.88 —
  `getBoundingClientRect` reports the *scaled* box, so the origin came out ~90px
  adrift. Guarded with an `entered` ref, the idiom `TerminalWindow` already uses.
- **Arrow keys shifted the tab behind the open panel.** Legitimate when it was a
  tab; as an overlay it silently rearranged what was underneath. Held back on
  Desktop's own `isInteractiveTarget` terms, so arrows still move the caret.
- **Vite watched `.wrangler/`.** Miniflare's KV write-ahead log changes on every KV
  write, so running `wrangler dev` beside `vite dev` full-reloaded the page
  mid-keystroke. Ignored in `vite.config.ts` and gitignored.

## The layout fixes that came with the copy change

- **ABOUT** centres its blocks with auto margins (which absorb positive free space
  and resolve to zero when it is negative, so it centres while it fits and
  top-aligns when it does not — plain `align-items: center` would have clipped
  OPERATOR off the *top*). Block chrome tightens below 820px tall. Below ~700px the
  column scrolls, because the stack is 431px and there was no honest padding left
  to take. Was: 32px above against 27px below at 1512×775, and cut off entirely
  under 700px.
- **LINKS** cards divide the row evenly. `max-height` was capping their height on
  any window under ~860px and the 4:5 ratio pulled the *width* down with it, so
  370px cards sat at the left of their 424px columns — the row read as left-shifted
  with the gaps blown out to 70px from the 16px set. `width: 100%` beats the ratio.
- **Tab content and the panel** both open out of what you clicked, sharing
  `openFrom`. Scale 0.96 for the body against 0.88 for the panel: the panel opens
  once, a tab is pressed twenty times a session, and at the panel's depth the whole
  terminal appears to jump.
- **The panel recedes on close**, reusing `src/lib/recede.ts` and the two-beat
  parent close from `Desktop.requestClose`. `transform-origin` resets to centre
  first — the entrance leaves it on the launching card, and receding toward that
  reads as sliding sideways rather than withdrawing.

## Admin commit messages

`server/contentMessage.ts` derives a commit subject from the actual diff. The
history had 28 commits called `Update site content from admin` to change four
lines. Now: `Admin: edit LORE, SERVICES, COMMISSIONS` with field-level
before/after in the body. Rows are matched by position, not label, so a rename
reports as a rename. Derived in the Worker, never supplied by the browser.

The earlier diagnosis of "a commit per keystroke" was **wrong** — the commits are
deliberate saves 1–9 minutes apart, and none were empty.

## Verification status

Proven: 390 tests, forced full typecheck, build, lint. Live endpoint rejects a
missing and a garbage token (403), rejects a disallowed origin (403), 404s on GET.
Rate limit refuses the 6th enquiry in an hour. One real submission reached the
client's inbox with the attachment (`{"ok":true}` — the Worker returns 200 only
after Resend accepts). Layout measured at 1512×775, mobile 390×844, and short
windows to 620px.

**Not proven:**

- A real Turnstile token being accepted end to end, *by me*. Turnstile exists to
  defeat automated browsers, so headless Chrome could not complete the challenge.
  The user confirmed it works in Firefox; that is the evidence for that path.
- A full-size 10MB upload. The live test used 12KB. The chunked base64 encoder is
  unit-tested at 600KB and Resend's ceiling is 40MB.
- Smoothness of the recede on production. The curve is verified locally; the
  production close plays and completes, but frame sampling was too coarse to
  characterise it, and a file window could not be opened headlessly for a
  side-by-side. Suspect `filter: blur()` on a `.glass` surface if it ever looks
  heavy — the honest fix would be dropping `.glass` during the recede rather than
  weakening the shared curve.

## Open items

- No DMARC record on the apex. SPF and DKIM are in place. This is the main
  remaining deliverability lever if enquiries start landing in spam.
- No captcha metrics reviewed yet. If the rate limit or Turnstile ever actually
  bites a real enquirer, `wrangler tail` logs the rejection with action, hostname
  and error codes.
- Turnstile fails closed on misconfiguration, which is correct — but it means
  losing `TURNSTILE_SECRET` silently takes the form offline with
  `THE FORM IS NOT AVAILABLE RIGHT NOW.` and a loud log. Worth knowing before
  rotating anything.
