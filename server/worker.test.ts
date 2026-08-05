import { describe, it, expect, beforeEach, vi } from 'vitest'
import worker, { type Env } from './worker'
import { hashPasscode } from './auth'
import type { CounterStore } from './ratelimit'

const ORIGIN = 'https://decoy-dev.github.io'
const PASSCODE = 'open sesame please'

function store(): CounterStore {
  const map = new Map<string, string>()
  return {
    async get(k) { return map.get(k) ?? null },
    async put(k, v) { map.set(k, v) },
  }
}

async function makeEnv(): Promise<Env> {
  return {
    ADMIN_PASSCODE_HASH: await hashPasscode(PASSCODE, 1000),
    SESSION_SECRET: 'session-secret',
    GITHUB_TOKEN: 'ghp_secret_token_value',
    GITHUB_OWNER: 'decoy-dev',
    GITHUB_REPO: 'severedarchive',
    ALLOWED_ORIGIN: `${ORIGIN},http://localhost:5173`,
    RATE_LIMIT: store(),
  }
}

const post = (path: string, body: unknown, init: RequestInit = {}) =>
  new Request(`https://api.example${path}`, {
    method: 'POST',
    headers: { origin: ORIGIN, 'content-type': 'application/json', ...init.headers },
    body: JSON.stringify(body),
    ...init,
  })

const cookieFrom = (res: Response): string => {
  const set = res.headers.get('set-cookie') ?? ''
  return set.split(';')[0]
}

describe('POST /api/session', () => {
  let env: Env
  beforeEach(async () => { env = await makeEnv() })

  it('issues an httpOnly, Secure, SameSite=None cookie for the right passcode', async () => {
    const res = await worker.fetch(post('/api/session', { passcode: PASSCODE }), env)
    expect(res.status).toBe(200)
    const set = res.headers.get('set-cookie')!
    expect(set).toMatch(/HttpOnly/)
    expect(set).toMatch(/Secure/)
    // None, not Strict: the site and the Worker are different SITES (github.io
    // vs workers.dev), and a Strict cookie is never sent cross-site — with it,
    // login succeeded and every authed call 401'd. CSRF is carried by the
    // exact-origin check on mutating routes instead.
    expect(set).toMatch(/SameSite=None/)
  })

  it('rejects the wrong passcode, and says nothing else', async () => {
    const res = await worker.fetch(post('/api/session', { passcode: 'wrong' }), env)
    expect(res.status).toBe(401)
    expect(res.headers.get('set-cookie')).toBeNull()
    expect(await res.json()).toEqual({ error: 'unauthorized' })
  })

  it('answers a missing passcode exactly as it answers a wrong one', async () => {
    // Otherwise the endpoint tells an attacker which half they got right.
    const missing = await worker.fetch(post('/api/session', {}), env)
    const wrong = await worker.fetch(post('/api/session', { passcode: 'nope' }), env)
    expect(missing.status).toBe(wrong.status)
    expect(await missing.json()).toEqual(await wrong.json())
  })

  it('never returns a secret in any response', async () => {
    for (const body of [{ passcode: PASSCODE }, { passcode: 'wrong' }, {}]) {
      const res = await worker.fetch(post('/api/session', body), env)
      const text = await res.text() + (res.headers.get('set-cookie') ?? '')
      expect(text).not.toContain(env.GITHUB_TOKEN)
      expect(text).not.toContain(env.ADMIN_PASSCODE_HASH)
      expect(text).not.toContain(env.SESSION_SECRET)
      expect(text).not.toContain(PASSCODE)
    }
  })

  it('rate limits brute force', async () => {
    for (let i = 0; i < 8; i++) await worker.fetch(post('/api/session', { passcode: 'wrong' }), env)
    const res = await worker.fetch(post('/api/session', { passcode: 'wrong' }), env)
    expect(res.status).toBe(429)
    expect(res.headers.get('retry-after')).toBeTruthy()
  })

  it('counts a correct passcode against the limit too, so the cap is real', async () => {
    for (let i = 0; i < 9; i++) await worker.fetch(post('/api/session', { passcode: 'wrong' }), env)
    const res = await worker.fetch(post('/api/session', { passcode: PASSCODE }), env)
    expect(res.status).toBe(429)
  })
})

describe('authorisation', () => {
  let env: Env
  beforeEach(async () => { env = await makeEnv() })

  it('refuses upload and content without a session', async () => {
    const upload = await worker.fetch(new Request('https://api.example/api/upload', {
      method: 'POST', headers: { origin: ORIGIN },
    }), env)
    expect(upload.status).toBe(401)
    const content = await worker.fetch(new Request('https://api.example/api/content'), env)
    expect(content.status).toBe(401)
  })

  it('refuses a forged session cookie', async () => {
    const res = await worker.fetch(new Request('https://api.example/api/content', {
      headers: { cookie: 'sa_admin=eyJzdWIiOiJvd25lciJ9.deadbeef' },
    }), env)
    expect(res.status).toBe(401)
  })

  it('allows every configured origin, and echoes the one that asked', async () => {
    // `credentials: include` makes a browser refuse `*`, so the header has to
    // name one origin — and with several allowed, it has to be the caller's.
    for (const origin of [ORIGIN, 'http://localhost:5173']) {
      const res = await worker.fetch(post('/api/session', { passcode: 'wrong' }, { headers: { origin } }), env)
      expect(res.status).toBe(401)
      expect(res.headers.get('access-control-allow-origin')).toBe(origin)
    }
  })

  it('refuses a cross-origin mutation', async () => {
    const login = await worker.fetch(post('/api/session', { passcode: PASSCODE }), env)
    const res = await worker.fetch(post('/api/content', { content: '{}' }, {
      headers: { origin: 'https://evil.example', cookie: cookieFrom(login) },
    }), env)
    expect(res.status).toBe(403)
  })
})

describe('POST /api/upload', () => {
  let env: Env
  let cookie: string

  beforeEach(async () => {
    env = await makeEnv()
    const login = await worker.fetch(post('/api/session', { passcode: PASSCODE }), env)
    cookie = cookieFrom(login)
  })

  const upload = (fields: Record<string, string>, file?: File) => {
    const form = new FormData()
    for (const [k, v] of Object.entries(fields)) form.set(k, v)
    if (file) form.set('file', file)
    return new Request('https://api.example/api/upload', {
      method: 'POST', headers: { origin: ORIGIN, cookie }, body: form,
    })
  }

  const validFields = {
    name: 'NEW_RENDER', kind: 'video', tagline: 'chrome study',
    description: 'note', date: '2026-08-04', postUrl: 'https://instagram.com/p/x',
  }

  it('requires a file', async () => {
    const res = await worker.fetch(upload(validFields), env)
    expect(res.status).toBe(400)
  })

  it('rejects an invalid entry before touching GitHub', async () => {
    const spy = vi.spyOn(globalThis, 'fetch')
    const res = await worker.fetch(
      upload({ ...validFields, date: 'yesterday' }, new File(['x'], 'a.mp4')), env,
    )
    expect(res.status).toBe(422)
    expect(spy).not.toHaveBeenCalled()
    spy.mockRestore()
  })

  it('does not leak an upstream failure', async () => {
    // A GitHub error can name the repo and the token's scopes.
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('token ghp_secret_token_value lacks scope', { status: 403, statusText: 'Forbidden' }),
    )
    const res = await worker.fetch(upload(validFields, new File(['x'], 'a.mp4')), env)
    expect(res.status).toBe(502)
    expect(await res.text()).not.toContain('ghp_secret')
    vi.restoreAllMocks()
  })
})

describe('/api/entry/:id', () => {
  let env: Env
  let cookie: string

  beforeEach(async () => {
    env = await makeEnv()
    const login = await worker.fetch(post('/api/session', { passcode: PASSCODE }), env)
    cookie = cookieFrom(login)
  })

  const validFields = {
    name: 'GLASS_RITE', kind: 'video', tagline: 'refraction pass',
    description: 'note', date: '2025-06-01', postUrl: 'https://instagram.com/p/x',
    currentName: 'GLASS_RITE',
    existingNames: JSON.stringify(['GLASS_RITE', 'CHROME_SEQ']),
  }

  const edit = (id: string, fields: Record<string, string>, file?: File, init: RequestInit = {}) => {
    const form = new FormData()
    for (const [k, v] of Object.entries(fields)) form.set(k, v)
    if (file) form.set('file', file)
    return new Request(`https://api.example/api/entry/${id}`, {
      method: 'POST', headers: { origin: ORIGIN, cookie, ...init.headers }, body: form,
    })
  }

  const del = (id: string, body: unknown, init: RequestInit = {}) =>
    new Request(`https://api.example/api/entry/${id}`, {
      method: 'DELETE',
      headers: { origin: ORIGIN, cookie, 'content-type': 'application/json', ...init.headers },
      body: JSON.stringify(body),
    })

  it('refuses an edit with no session', async () => {
    const res = await worker.fetch(edit('file03', validFields, undefined, { headers: { cookie: '' } }), env)
    expect(res.status).toBe(401)
  })

  it('refuses a removal with no session', async () => {
    const res = await worker.fetch(
      del('file03', { name: 'GLASS_RITE', confirm: 'GLASS_RITE' }, { headers: { cookie: '' } }), env,
    )
    expect(res.status).toBe(401)
  })

  it('accepts an edit that keeps the entry its own name', async () => {
    // The uniqueness rule must not reject an entry for colliding with itself —
    // otherwise no entry can ever have its tagline changed.
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('{}', { status: 200 }))
    const res = await worker.fetch(edit('file03', validFields), env)
    expect(res.status).toBe(202)
    expect(await res.json()).toMatchObject({ id: 'file03', replaced: false })
    vi.restoreAllMocks()
  })

  it('rejects a rename onto another entry', async () => {
    const spy = vi.spyOn(globalThis, 'fetch')
    const res = await worker.fetch(edit('file03', { ...validFields, name: 'CHROME_SEQ' }), env)
    expect(res.status).toBe(422)
    expect(spy).not.toHaveBeenCalled()
    spy.mockRestore()
  })

  it('rejects an id that could escape a path', async () => {
    for (const id of ['..', '.%2E', 'file03.mp4', 'FILE03']) {
      const res = await worker.fetch(edit(encodeURIComponent(id), validFields), env)
      expect([400, 404], `id ${id}`).toContain(res.status)
    }
  })

  it('will not remove without the name typed back', async () => {
    const spy = vi.spyOn(globalThis, 'fetch')
    const res = await worker.fetch(del('file03', { name: 'GLASS_RITE', confirm: 'GLASS RITE!' }), env)
    expect(res.status).toBe(422)
    expect(spy).not.toHaveBeenCalled()
    spy.mockRestore()
  })

  it('will not remove with no confirmation at all', async () => {
    const res = await worker.fetch(del('file03', { name: 'GLASS_RITE' }), env)
    expect(res.status).toBe(422)
  })

  it('removes when the name matches', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('{}', { status: 200 }))
    const res = await worker.fetch(del('file03', { name: 'GLASS_RITE', confirm: 'glass_rite' }), env)
    expect(res.status).toBe(202)
    vi.restoreAllMocks()
  })

  it('does not leak an upstream failure on an edit', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('token ghp_secret_token_value lacks scope', { status: 403, statusText: 'Forbidden' }),
    )
    const res = await worker.fetch(edit('file03', validFields), env)
    expect(res.status).toBe(502)
    expect(await res.text()).not.toContain('ghp_secret')
    vi.restoreAllMocks()
  })
})

describe('DELETE /api/session', () => {
  it('clears the cookie with the attributes it was set with', async () => {
    const env = await makeEnv()
    const res = await worker.fetch(new Request('https://api.example/api/session', {
      method: 'DELETE', headers: { origin: ORIGIN },
    }), env)
    expect(res.status).toBe(200)
    const set = res.headers.get('set-cookie') ?? ''
    expect(set).toContain('Max-Age=0')
    // A cookie cleared with different attributes is a different cookie, and the
    // real session would survive.
    expect(set).toContain('HttpOnly')
    expect(set).toContain('SameSite=None')
    expect(set).toContain('Path=/')
  })
})
