import { describe, it, expect } from 'vitest'
import {
  hashPasscode, verifyPasscode, signSession, verifySession, timingSafeEqual,
  SESSION_TTL_S, PBKDF2_ITERATIONS, WORKERS_MAX_PBKDF2_ITERATIONS,
} from './auth'

// Low rounds so the suite stays fast. Production uses PBKDF2_ITERATIONS.
const FAST = 1000
const SECRET = 'test-signing-secret-not-the-real-one'

describe('timingSafeEqual', () => {
  it('compares by content', () => {
    expect(timingSafeEqual('abc', 'abc')).toBe(true)
    expect(timingSafeEqual('abc', 'abd')).toBe(false)
    expect(timingSafeEqual('abc', 'abcd')).toBe(false)
    expect(timingSafeEqual('', '')).toBe(true)
  })

  it('walks the whole string rather than returning on the first difference', () => {
    // The property that matters cannot be asserted by timing here without being
    // flaky, so this asserts the observable half: a first-character mismatch
    // and a last-character mismatch are indistinguishable in result.
    expect(timingSafeEqual('xbc', 'abc')).toBe(false)
    expect(timingSafeEqual('abx', 'abc')).toBe(false)
  })
})

describe('passcode', () => {
  it('respects the platform ceiling, and works at the real iteration count', async () => {
    // The regression this exists for: 210_000 rounds is unremarkable in Node
    // and throws NotSupportedError on Workers, so every correct passcode became
    // a 502 while every wrong one stayed a 401 — a deployment that looked
    // misconfigured rather than broken. Every other test here runs at 1_000
    // rounds for speed, so none of them would ever have noticed.
    expect(PBKDF2_ITERATIONS).toBeLessThanOrEqual(WORKERS_MAX_PBKDF2_ITERATIONS)
    const stored = await hashPasscode('a real passcode here')
    expect(Number(stored.split('$')[1])).toBe(PBKDF2_ITERATIONS)
    expect(await verifyPasscode('a real passcode here', stored)).toBe(true)
  })

  it('refuses a record demanding more rounds than the platform allows', async () => {
    // Such a record cannot be checked at all — deriveBits throws rather than
    // answering — so it must fail closed instead of becoming a 502.
    const tooMany = `pbkdf2$${WORKERS_MAX_PBKDF2_ITERATIONS + 1}$c2FsdHNhbHRzYWx0c2E=$aGFzaA==`
    expect(await verifyPasscode('anything', tooMany)).toBe(false)
  })

  it('accepts the right passcode and rejects the wrong one', async () => {
    const stored = await hashPasscode('correct horse battery staple', FAST)
    expect(await verifyPasscode('correct horse battery staple', stored)).toBe(true)
    expect(await verifyPasscode('correct horse battery stapl', stored)).toBe(false)
    expect(await verifyPasscode('', stored)).toBe(false)
  })

  it('never stores the passcode itself', async () => {
    const stored = await hashPasscode('hunter2', FAST)
    expect(stored).not.toContain('hunter2')
  })

  it('salts, so the same passcode hashes differently every time', async () => {
    const a = await hashPasscode('same', FAST)
    const b = await hashPasscode('same', FAST)
    expect(a).not.toBe(b)
    // and both still verify
    expect(await verifyPasscode('same', a)).toBe(true)
    expect(await verifyPasscode('same', b)).toBe(true)
  })

  it('tolerates the whitespace a piped or pasted secret arrives with', async () => {
    // `node hash-passcode.mjs | wrangler secret put` sends the trailing newline
    // too. Failing on that looks exactly like a wrong passcode.
    const stored = await hashPasscode('correct horse battery staple', FAST)
    for (const wrapped of [`${stored}\n`, `\n${stored}`, ` ${stored} `, `${stored}\r\n`]) {
      expect(await verifyPasscode('correct horse battery staple', wrapped)).toBe(true)
    }
  })

  it('carries its own iteration count, so the cost can be raised later', async () => {
    const stored = await hashPasscode('x', 2000)
    expect(stored.split('$')[1]).toBe('2000')
    expect(await verifyPasscode('x', stored)).toBe(true)
  })

  it('refuses a malformed record instead of throwing', async () => {
    // A misconfigured environment variable must read as "no", not as a crash
    // and not as a pass.
    expect(await verifyPasscode('x', '')).toBe(false)
    // A Worker deploys fine with a secret still unset; that must read as "no",
    // not as a 502 from a thrown TypeError.
    expect(await verifyPasscode('x', undefined as unknown as string)).toBe(false)
    expect(await verifyPasscode('x', null as unknown as string)).toBe(false)
    expect(await verifyPasscode('x', 'plaintext')).toBe(false)
    expect(await verifyPasscode('x', 'pbkdf2$notanumber$c2FsdA==$aGFzaA==')).toBe(false)
    expect(await verifyPasscode('x', 'pbkdf2$10$c2FsdA==$aGFzaA==')).toBe(false) // too few rounds
    expect(await verifyPasscode('x', 'bcrypt$1000$c2FsdA==$aGFzaA==')).toBe(false)
  })
})

describe('session tokens', () => {
  it('round-trips a signed token', async () => {
    const now = 1_800_000_000
    const token = await signSession(SECRET, { now })
    const payload = await verifySession(SECRET, token, now + 10)
    expect(payload?.sub).toBe('owner')
    expect(payload?.exp).toBe(now + SESSION_TTL_S)
  })

  it('rejects a token signed with a different secret', async () => {
    const token = await signSession(SECRET)
    expect(await verifySession('some-other-secret', token)).toBeNull()
  })

  it('rejects a tampered payload', async () => {
    const now = 1_800_000_000
    const token = await signSession(SECRET, { now })
    const [body, sig] = token.split('.')
    // Re-encode the payload with a far-future expiry, keeping the old signature.
    const forged = btoa(JSON.stringify({ sub: 'owner', iat: now, exp: now + 999_999 }))
    expect(await verifySession(SECRET, `${forged}.${sig}`, now + 10)).toBeNull()
    // and a flipped signature over the real body
    expect(await verifySession(SECRET, `${body}.${sig.slice(0, -2)}AA`, now + 10)).toBeNull()
  })

  it('expires', async () => {
    const now = 1_800_000_000
    const token = await signSession(SECRET, { now, ttl: 60 })
    expect(await verifySession(SECRET, token, now + 59)).not.toBeNull()
    expect(await verifySession(SECRET, token, now + 61)).toBeNull()
  })

  it('refuses a token issued in the future', async () => {
    const now = 1_800_000_000
    const token = await signSession(SECRET, { now: now + 3600 })
    expect(await verifySession(SECRET, token, now)).toBeNull()
  })

  it('returns null for junk rather than throwing', async () => {
    for (const junk of ['', '.', 'nodot', 'a.b', '..', 'ñ.ñ']) {
      expect(await verifySession(SECRET, junk)).toBeNull()
    }
  })
})
