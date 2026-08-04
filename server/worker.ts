import { signSession, verifyPasscode, verifySession } from './auth'
import { validateEntry } from './entry'
import { dispatchIngest, stageRaw, readFile, writeFile, type GitHubConfig } from './github'
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
  /** Origin allowed to call this. Exact match — no wildcards. */
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

const json = (body: unknown, status: number, env: Env, extra: HeadersInit = {}): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json',
      'access-control-allow-origin': env.ALLOWED_ORIGIN,
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
    return json({ error: 'too many attempts' }, 429, env, { 'retry-after': String(limit.retryAfter) })
  }

  const body = (await req.json().catch(() => null)) as { passcode?: unknown } | null
  const passcode = typeof body?.passcode === 'string' ? body.passcode : ''
  // Verified even when empty, so a missing passcode costs the same time as a
  // wrong one and the endpoint does not answer "is this field required?".
  const ok = await verifyPasscode(passcode, env.ADMIN_PASSCODE_HASH)
  if (!ok) return json({ error: 'unauthorized' }, 401, env)

  const token = await signSession(env.SESSION_SECRET)
  return json({ ok: true }, 200, env, {
    // httpOnly so no script can read it, SameSite=Strict so no other site can
    // cause it to be sent, Secure so it never crosses plaintext.
    'set-cookie': `${SESSION_COOKIE}=${token}; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=3600`,
  })
}

async function handleUpload(req: Request, env: Env): Promise<Response> {
  if (!(await requireSession(req, env))) return json({ error: 'unauthorized' }, 401, env)

  const limit = await countAttempt(env.RATE_LIMIT, `upload:${clientKey(req.headers)}`, {
    limit: UPLOAD_LIMIT, windowS: UPLOAD_WINDOW_S,
  })
  if (!limit.allowed) {
    return json({ error: 'too many uploads' }, 429, env, { 'retry-after': String(limit.retryAfter) })
  }

  const form = await req.formData().catch(() => null)
  const file = form?.get('file')
  if (!(file instanceof File)) return json({ error: 'file is required' }, 400, env)
  if (file.size > MAX_UPLOAD_BYTES) return json({ error: 'file is too large' }, 413, env)

  const fields = validateEntry({
    name: form?.get('name'),
    kind: form?.get('kind'),
    tagline: form?.get('tagline'),
    description: form?.get('description'),
    date: form?.get('date'),
    postUrl: form?.get('postUrl'),
  }, JSON.parse(String(form?.get('existingNames') ?? '[]')))
  if (!fields.ok) return json({ error: 'invalid entry', details: fields.errors }, 422, env)

  // The raw is staged as a release asset — outside the git tree, so it is never
  // committed and never enters history. The ingest run deletes it.
  const stem = `${Date.now()}-${fields.value.name}`
  const asset = await stageRaw(
    ghConfig(env),
    `${stem}.upload`,
    await file.arrayBuffer(),
    file.type || 'application/octet-stream',
  )

  await dispatchIngest(ghConfig(env), { asset: { id: asset.id, url: asset.url }, entry: fields.value })
  return json({ ok: true, staged: asset.name, entry: fields.value }, 202, env)
}

/** ABOUT copy and LINKS rows. One committed JSON file, no media, no transcode. */
async function handleContent(req: Request, env: Env): Promise<Response> {
  if (!(await requireSession(req, env))) return json({ error: 'unauthorized' }, 401, env)
  const path = 'src/data/content.json'

  if (req.method === 'GET') {
    const file = await readFile(ghConfig(env), path)
    return json({ ok: true, content: file?.content ?? null, sha: file?.sha ?? null }, 200, env)
  }

  const body = (await req.json().catch(() => null)) as { content?: unknown; sha?: unknown } | null
  if (typeof body?.content !== 'string') return json({ error: 'content is required' }, 400, env)
  try {
    JSON.parse(body.content)
  } catch {
    return json({ error: 'content must be valid JSON' }, 422, env)
  }
  // The sha is the one just read. GitHub rejects a stale one, which is what
  // stops two sessions overwriting each other rather than merging silently.
  await writeFile(
    ghConfig(env), path, body.content, 'Update site content from admin',
    typeof body.sha === 'string' ? body.sha : undefined,
  )
  return json({ ok: true }, 200, env)
}

export function corsPreflight(env: Env): Response {
  return new Response(null, {
    status: 204,
    headers: {
      'access-control-allow-origin': env.ALLOWED_ORIGIN,
      'access-control-allow-credentials': 'true',
      'access-control-allow-methods': 'GET,POST,OPTIONS',
      'access-control-allow-headers': 'content-type',
      'access-control-max-age': '86400',
    },
  })
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url)
    if (req.method === 'OPTIONS') return corsPreflight(env)

    // Exact-origin check on everything that mutates. The session cookie is
    // SameSite=Strict, so this is belt and braces — but the braces are cheap.
    if (req.method !== 'GET') {
      const origin = req.headers.get('origin')
      if (origin && origin !== env.ALLOWED_ORIGIN) return json({ error: 'forbidden' }, 403, env)
    }

    try {
      if (url.pathname === '/api/session' && req.method === 'POST') return await handleSession(req, env)
      if (url.pathname === '/api/upload' && req.method === 'POST') return await handleUpload(req, env)
      if (url.pathname === '/api/content') return await handleContent(req, env)
      return json({ error: 'not found' }, 404, env)
    } catch {
      // Never surface an upstream message: it can echo request content, and a
      // GitHub error can name the repo and the token's scopes.
      return json({ error: 'upstream failure' }, 502, env)
    }
  },
}
