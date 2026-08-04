import { signSession, verifyPasscode, verifySession } from './auth'
import { deletionConfirmed, validateEntry, validateEntryEdit } from './entry'
import { dispatchEdit, dispatchIngest, stageRaw, readFile, writeFile, type GitHubConfig } from './github'
import { clientKey, countAttempt, type CounterStore } from './ratelimit'

/**
 * The admin backend: a Cloudflare Worker that authenticates the owner, stages
 * an upload, and asks GitHub Actions to do the rest.
 *
 * It is deliberately the smallest thing that can exist while the passcode stays
 * genuinely private. It holds no media, no database and no site — the store is
 * still the repo and the transcoder is still Actions. What it holds is two
 * secrets that a static page cannot: the passcode hash and a GitHub token.
 *
 * Nothing here ever returns either secret, and no response distinguishes "wrong
 * passcode" from "no passcode": both are 401.
 */
export type Env = {
  /** `pbkdf2$iterations$salt$hash` — see `hashPasscode`. Never the passcode. */
  ADMIN_PASSCODE_HASH: string
  /** HMAC key for session tokens. Rotating it logs the owner out, which is fine. */
  SESSION_SECRET: string
  /** Fine-grained token, contents+actions write on the one repo. */
  GITHUB_TOKEN: string
  GITHUB_OWNER: string
  GITHUB_REPO: string
  /**
   * Origins allowed to call this, comma-separated. Exact matches only — never a
   * wildcard, and never a pattern: `*` with `credentials: include` is refused by
   * browsers anyway, and a pattern is how a lookalike domain gets in.
   */
  ALLOWED_ORIGIN: string
  RATE_LIMIT: CounterStore
}

/** Passcode attempts per IP per hour. Low: there is one person and one passcode. */
const LOGIN_LIMIT = 8
const LOGIN_WINDOW_S = 60 * 60
/** Uploads are expensive downstream (a transcode run each), so they are capped too. */
const UPLOAD_LIMIT = 20
const UPLOAD_WINDOW_S = 60 * 60

const MAX_UPLOAD_BYTES = 512 * 1024 * 1024

const SESSION_COOKIE = 'sa_admin'

/**
 * What an entry id may look like. Anchored and narrow because the id reaches a
 * shell in the edit workflow and names files on disk: no dots, no slashes, so a
 * `../` or a glob cannot be smuggled through as an id.
 */
const ENTRY_ID_RE = /^[a-z0-9][a-z0-9_]{0,40}$/

/** The allow-list, parsed. Empty entries dropped so a trailing comma is harmless. */
const allowedOrigins = (env: Env): string[] =>
  env.ALLOWED_ORIGIN.split(',').map((o) => o.trim()).filter(Boolean)

/**
 * The caller's origin if it is allowed, else the first configured one.
 *
 * Echoing the matching origin is required rather than stylistic: with
 * `credentials: include` a browser rejects `*`, so the header has to name one
 * origin, and with several allowed it has to be the one that asked. A caller
 * from anywhere else gets the header for someone else's origin, which its
 * browser then refuses — the request fails on their side, not ours.
 */
const originFor = (req: Request, env: Env): string => {
  const origin = req.headers.get('origin')
  const allowed = allowedOrigins(env)
  return origin && allowed.includes(origin) ? origin : (allowed[0] ?? '')
}

const json = (body: unknown, status: number, env: Env, extra: HeadersInit = {}, req?: Request): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json',
      'access-control-allow-origin': req ? originFor(req, env) : allowedOrigins(env)[0] ?? '',
      'access-control-allow-credentials': 'true',
      // Nothing this Worker returns should ever be cached anywhere.
      'cache-control': 'no-store',
      ...extra,
    },
  })

const readCookie = (req: Request, name: string): string | null => {
  const header = req.headers.get('cookie')
  if (!header) return null
  for (const part of header.split(';')) {
    const [k, ...v] = part.trim().split('=')
    if (k === name) return v.join('=')
  }
  return null
}

const ghConfig = (env: Env): GitHubConfig => ({
  owner: env.GITHUB_OWNER,
  repo: env.GITHUB_REPO,
  token: env.GITHUB_TOKEN,
})

/** 401 on anything but a valid, unexpired token. */
async function requireSession(req: Request, env: Env): Promise<boolean> {
  const token = readCookie(req, SESSION_COOKIE)
  if (!token) return false
  return (await verifySession(env.SESSION_SECRET, token)) !== null
}

async function handleSession(req: Request, env: Env): Promise<Response> {
  const limit = await countAttempt(env.RATE_LIMIT, `login:${clientKey(req.headers)}`, {
    limit: LOGIN_LIMIT, windowS: LOGIN_WINDOW_S,
  })
  if (!limit.allowed) {
    return json({ error: 'too many attempts' }, 429, env, { 'retry-after': String(limit.retryAfter) }, req)
  }

  const body = (await req.json().catch(() => null)) as { passcode?: unknown } | null
  const passcode = typeof body?.passcode === 'string' ? body.passcode : ''
  // Verified even when empty, so a missing passcode costs the same time as a
  // wrong one and the endpoint does not answer "is this field required?".
  const ok = await verifyPasscode(passcode, env.ADMIN_PASSCODE_HASH)
  if (!ok) return json({ error: 'unauthorized' }, 401, env, {}, req)

  const token = await signSession(env.SESSION_SECRET)
  return json({ ok: true }, 200, env, {
    // httpOnly so no script can read it, SameSite=Strict so no other site can
    // cause it to be sent, Secure so it never crosses plaintext.
    'set-cookie': `${SESSION_COOKIE}=${token}; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=3600`,
  }, req)
}

/**
 * Signing out: clear the cookie.
 *
 * Not authenticated, and it does not need to be — the only thing it can do is
 * unset a cookie on the caller's own browser. Rate-limiting it would mean an
 * attacker could stop the owner from signing out.
 */
function handleSignOut(req: Request, env: Env): Response {
  return json({ ok: true }, 200, env, {
    // Same attributes as when it was set, or the browser treats it as a
    // different cookie and leaves the real one in place.
    'set-cookie': `${SESSION_COOKIE}=; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=0`,
  }, req)
}

/**
 * Stages a supplied thumbnail image, if there is one.
 *
 * Separate from the raw so a thumbnail-only edit stages one small file and no
 * clip — which is what makes changing a poster cheap rather than a re-encode.
 */
async function stageThumb(
  env: Env,
  file: FormDataEntryValue | null | undefined,
  name: string,
): Promise<{ id: number; url: string } | null> {
  if (!(file instanceof File) || file.size === 0) return null
  const staged = await stageRaw(
    ghConfig(env), `${name}.upload`, await file.arrayBuffer(), file.type || 'application/octet-stream',
  )
  return { id: staged.id, url: staged.url }
}

async function handleUpload(req: Request, env: Env): Promise<Response> {
  if (!(await requireSession(req, env))) return json({ error: 'unauthorized' }, 401, env, {}, req)

  const limit = await countAttempt(env.RATE_LIMIT, `upload:${clientKey(req.headers)}`, {
    limit: UPLOAD_LIMIT, windowS: UPLOAD_WINDOW_S,
  })
  if (!limit.allowed) {
    return json({ error: 'too many uploads' }, 429, env, { 'retry-after': String(limit.retryAfter) }, req)
  }

  const form = await req.formData().catch(() => null)
  const file = form?.get('file')
  if (!(file instanceof File)) return json({ error: 'file is required' }, 400, env, {}, req)
  if (file.size > MAX_UPLOAD_BYTES) return json({ error: 'file is too large' }, 413, env, {}, req)

  const fields = validateEntry({
    name: form?.get('name'),
    kind: form?.get('kind'),
    tagline: form?.get('tagline'),
    description: form?.get('description'),
    date: form?.get('date'),
    postUrl: form?.get('postUrl'),
    thumb: form?.get('thumb'),
  }, JSON.parse(String(form?.get('existingNames') ?? '[]')))
  if (!fields.ok) return json({ error: 'invalid entry', details: fields.errors }, 422, env, {}, req)

  // An optional still to use instead of a frame of the clip. Staged the same way
  // as the raw — a release asset, never the git tree — and subject to the same
  // size cap, which is far larger than any still needs.
  const thumbImage = form?.get('thumbImage')
  if (thumbImage instanceof File && thumbImage.size > MAX_UPLOAD_BYTES) {
    return json({ error: 'thumbnail is too large' }, 413, env, {}, req)
  }

  // The raw is staged as a release asset — outside the git tree, so it is never
  // committed and never enters history. The ingest run deletes it.
  const stem = `${Date.now()}-${fields.value.name}`
  const asset = await stageRaw(
    ghConfig(env),
    `${stem}.upload`,
    await file.arrayBuffer(),
    file.type || 'application/octet-stream',
  )

  const thumbAsset = await stageThumb(env, thumbImage, `${stem}-thumb`)

  await dispatchIngest(ghConfig(env), {
    asset: { id: asset.id, url: asset.url },
    thumbAsset,
    entry: fields.value,
  })
  return json({ ok: true, staged: asset.name, entry: fields.value }, 202, env, {}, req)
}

/**
 * Editing an entry that already exists: its fields, and optionally its file.
 *
 * The id is the identity and never changes here. It is what every rendition on
 * disk is named after (`<id>_full.mp4`), so renaming the *display* name is a
 * field edit and renaming the id would be a migration — a replacement file is
 * therefore transcoded to the SAME id and simply overwrites what is there.
 */
async function handleEntryEdit(req: Request, env: Env, id: string): Promise<Response> {
  if (!(await requireSession(req, env))) return json({ error: 'unauthorized' }, 401, env, {}, req)
  if (!ENTRY_ID_RE.test(id)) return json({ error: 'bad id' }, 400, env, {}, req)

  // Rate-limited on the upload counter when it carries a file, because that is
  // the expensive path — an edit with a replacement is an ingest by another name.
  const form = await req.formData().catch(() => null)
  if (!form) return json({ error: 'form data required' }, 400, env, {}, req)

  const file = form.get('file')
  const hasFile = file instanceof File && file.size > 0
  const thumbImage = form.get('thumbImage')
  if (thumbImage instanceof File && thumbImage.size > MAX_UPLOAD_BYTES) {
    return json({ error: 'thumbnail is too large' }, 413, env, {}, req)
  }
  if (hasFile) {
    if (file.size > MAX_UPLOAD_BYTES) return json({ error: 'file is too large' }, 413, env, {}, req)
    const limit = await countAttempt(env.RATE_LIMIT, `upload:${clientKey(req.headers)}`, {
      limit: UPLOAD_LIMIT, windowS: UPLOAD_WINDOW_S,
    })
    if (!limit.allowed) {
      return json({ error: 'too many uploads' }, 429, env, { 'retry-after': String(limit.retryAfter) }, req)
    }
  }

  const fields = validateEntryEdit({
    name: form.get('name'),
    kind: form.get('kind'),
    tagline: form.get('tagline'),
    description: form.get('description'),
    date: form.get('date'),
    postUrl: form.get('postUrl'),
    thumb: form.get('thumb'),
  }, String(form.get('currentName') ?? ''), JSON.parse(String(form.get('existingNames') ?? '[]')))
  if (!fields.ok) return json({ error: 'invalid entry', details: fields.errors }, 422, env, {}, req)

  let asset: { id: number; url: string } | null = null
  if (hasFile) {
    const staged = await stageRaw(
      ghConfig(env),
      `${Date.now()}-${id}-replace.upload`,
      await file.arrayBuffer(),
      file.type || 'application/octet-stream',
    )
    asset = { id: staged.id, url: staged.url }
  }

  const thumbAsset = await stageThumb(env, thumbImage, `${Date.now()}-${id}-thumb`)

  await dispatchEdit(ghConfig(env), { op: 'edit', id, entry: fields.value, asset, thumbAsset })
  // 202 whether or not there is a file: either way the change is committed by a
  // workflow run and is not live when this returns.
  return json({
    ok: true, id, replaced: hasFile, thumbnail: thumbAsset !== null, entry: fields.value,
  }, 202, env, {}, req)
}

/**
 * Removing an entry: the row and its renditions.
 *
 * Guarded twice over. The caller has to type the name back — see
 * `deletionConfirmed` — and the workflow deletes only files matching the id it
 * was given. Nothing here can remove more than one entry per request.
 */
async function handleEntryDelete(req: Request, env: Env, id: string): Promise<Response> {
  if (!(await requireSession(req, env))) return json({ error: 'unauthorized' }, 401, env, {}, req)
  if (!ENTRY_ID_RE.test(id)) return json({ error: 'bad id' }, 400, env, {}, req)

  const body = (await req.json().catch(() => null)) as { confirm?: unknown; name?: unknown } | null
  const name = typeof body?.name === 'string' ? body.name : ''
  if (!name) return json({ error: 'name is required' }, 400, env, {}, req)
  if (!deletionConfirmed(body?.confirm, name)) {
    return json({ error: 'confirmation does not match', details: ['type the name to confirm'] }, 422, env, {}, req)
  }

  await dispatchEdit(ghConfig(env), { op: 'remove', id, entry: { name } })
  return json({ ok: true, id, removed: name }, 202, env, {}, req)
}

/** ABOUT copy and LINKS rows. One committed JSON file, no media, no transcode. */
async function handleContent(req: Request, env: Env): Promise<Response> {
  if (!(await requireSession(req, env))) return json({ error: 'unauthorized' }, 401, env, {}, req)
  const path = 'src/data/content.json'

  if (req.method === 'GET') {
    const file = await readFile(ghConfig(env), path)
    return json({ ok: true, content: file?.content ?? null, sha: file?.sha ?? null }, 200, env, {}, req)
  }

  const body = (await req.json().catch(() => null)) as { content?: unknown; sha?: unknown } | null
  if (typeof body?.content !== 'string') return json({ error: 'content is required' }, 400, env, {}, req)
  try {
    JSON.parse(body.content)
  } catch {
    return json({ error: 'content must be valid JSON' }, 422, env, {}, req)
  }
  // The sha is the one just read. GitHub rejects a stale one, which is what
  // stops two sessions overwriting each other rather than merging silently.
  await writeFile(
    ghConfig(env), path, body.content, 'Update site content from admin',
    typeof body.sha === 'string' ? body.sha : undefined,
  )
  return json({ ok: true }, 200, env, {}, req)
}

export function corsPreflight(env: Env, req: Request): Response {
  return new Response(null, {
    status: 204,
    headers: {
      'access-control-allow-origin': originFor(req, env),
      'access-control-allow-credentials': 'true',
      'access-control-allow-methods': 'GET,POST,DELETE,OPTIONS',
      'access-control-allow-headers': 'content-type',
      'access-control-max-age': '86400',
    },
  })
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url)
    if (req.method === 'OPTIONS') return corsPreflight(env, req)

    // Exact-origin check on everything that mutates. The session cookie is
    // SameSite=Strict, so this is belt and braces — but the braces are cheap.
    if (req.method !== 'GET') {
      const origin = req.headers.get('origin')
      if (origin && !allowedOrigins(env).includes(origin)) {
        return json({ error: 'forbidden' }, 403, env, {}, req)
      }
    }

    try {
      if (url.pathname === '/api/session' && req.method === 'POST') return await handleSession(req, env)
      if (url.pathname === '/api/session' && req.method === 'DELETE') return handleSignOut(req, env)
      if (url.pathname === '/api/upload' && req.method === 'POST') return await handleUpload(req, env)
      if (url.pathname === '/api/content') return await handleContent(req, env)
      // `/api/entry/<id>` — POST edits (with an optional replacement file),
      // DELETE removes. The id is matched, not split off blindly, so a path with
      // extra segments is a 404 rather than an id containing a slash.
      const entry = /^\/api\/entry\/([^/]+)$/.exec(url.pathname)
      if (entry) {
        const id = decodeURIComponent(entry[1])
        if (req.method === 'POST') return await handleEntryEdit(req, env, id)
        if (req.method === 'DELETE') return await handleEntryDelete(req, env, id)
      }
      return json({ error: 'not found' }, 404, env, {}, req)
    } catch (err) {
      // Logged, never returned. The caller gets a bare 502 — an upstream
      // message can echo request content, and a GitHub error can name the repo
      // and the token's scopes — but a Worker with no diagnostic at all is a
      // Worker you debug by guessing, which is how a 502 on the login path went
      // unexplained. `wrangler tail` shows this; the internet does not.
      console.error('handler failed', {
        path: url.pathname,
        name: err instanceof Error ? err.name : typeof err,
        message: err instanceof Error ? err.message : String(err),
        stack: err instanceof Error ? err.stack : undefined,
      })
      return json({ error: 'upstream failure' }, 502, env, {}, req)
    }
  },
}
