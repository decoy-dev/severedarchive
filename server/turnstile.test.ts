import { describe, it, expect, afterEach, vi } from 'vitest'
import { verifyTurnstile } from './turnstile'
import { COMMISSION_ACTION } from '../src/lib/commissionFields'

const env = {
  TURNSTILE_SECRET: 'sec',
  TURNSTILE_HOSTNAMES: 'severedarchive.com,www.severedarchive.com',
}

/** Stand in for siteverify, returning whatever body a test needs. */
const siteverify = (body: Record<string, unknown>, ok = true) =>
  vi.spyOn(globalThis, 'fetch').mockResolvedValue(
    new Response(JSON.stringify(body), { status: ok ? 200 : 500 }),
  )

const passing = { success: true, action: COMMISSION_ACTION, hostname: 'severedarchive.com' }

describe('verifyTurnstile', () => {
  afterEach(() => { vi.restoreAllMocks() })

  it('passes a good token', async () => {
    siteverify(passing)
    expect(await verifyTurnstile(env, 'tok', '1.2.3.4')).toEqual({ ok: true })
  })

  it('sends the secret, the token and the caller address', async () => {
    const spy = siteverify(passing)
    await verifyTurnstile(env, 'tok', '1.2.3.4')
    const body = String((spy.mock.calls[0][1] as RequestInit).body)
    expect(body).toContain('secret=sec')
    expect(body).toContain('response=tok')
    // Passed so Turnstile can weigh where the request came from. CF-Connecting-IP
    // is set by Cloudflare, so it is not attacker-controlled.
    expect(body).toContain('remoteip=1.2.3.4')
  })

  it('refuses when the secret is not configured, and does not call out', async () => {
    // Fails CLOSED. A misconfigured deployment must not become the open endpoint
    // this check exists to close.
    const spy = siteverify(passing)
    expect(await verifyTurnstile({ TURNSTILE_HOSTNAMES: 'x.com' }, 'tok', null))
      .toMatchObject({ ok: false, status: 503 })
    expect(spy).not.toHaveBeenCalled()
  })

  it('refuses when no hostname is allowed', async () => {
    // An empty allowlist would otherwise accept a token from any hostname.
    const spy = siteverify(passing)
    expect(await verifyTurnstile({ TURNSTILE_SECRET: 'sec' }, 'tok', null))
      .toMatchObject({ ok: false, status: 503 })
    expect(spy).not.toHaveBeenCalled()
  })

  it('refuses a missing token without calling siteverify', async () => {
    const spy = siteverify(passing)
    expect(await verifyTurnstile(env, null, null)).toMatchObject({ ok: false, status: 403 })
    expect(spy).not.toHaveBeenCalled()
  })

  it('refuses an absurdly long token without calling siteverify', async () => {
    const spy = siteverify(passing)
    expect(await verifyTurnstile(env, 'x'.repeat(2049), null)).toMatchObject({ ok: false, status: 403 })
    expect(spy).not.toHaveBeenCalled()
  })

  it('refuses when siteverify says the token failed', async () => {
    siteverify({ success: false, 'error-codes': ['timeout-or-duplicate'] })
    expect(await verifyTurnstile(env, 'tok', null)).toMatchObject({ ok: false, status: 403 })
  })

  it('refuses a token minted for a different action', async () => {
    // A valid token from another widget on the same account is still valid. The
    // action is what ties one to this form.
    siteverify({ ...passing, action: 'newsletter' })
    expect(await verifyTurnstile(env, 'tok', null)).toMatchObject({ ok: false, status: 403 })
  })

  it('refuses a token minted on a hostname this deployment does not serve', async () => {
    // The localhost case specifically: the widget allows it so the form can be
    // developed, and production must not.
    siteverify({ ...passing, hostname: 'localhost' })
    expect(await verifyTurnstile(env, 'tok', null)).toMatchObject({ ok: false, status: 403 })
  })

  it('accepts any hostname that is on the list, not just the first', async () => {
    siteverify({ ...passing, hostname: 'www.severedarchive.com' })
    expect(await verifyTurnstile(env, 'tok', null)).toEqual({ ok: true })
  })

  it('refuses when siteverify is unreachable', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('ECONNREFUSED'))
    expect(await verifyTurnstile(env, 'tok', null)).toMatchObject({ ok: false, status: 403 })
  })

  it('refuses when siteverify answers non-2xx', async () => {
    siteverify(passing, false)
    expect(await verifyTurnstile(env, 'tok', null)).toMatchObject({ ok: false, status: 403 })
  })

  it('refuses when siteverify answers something that is not JSON', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('<html>502</html>'))
    expect(await verifyTurnstile(env, 'tok', null)).toMatchObject({ ok: false, status: 403 })
  })

  it('never returns the upstream error codes to the caller', async () => {
    siteverify({ success: false, 'error-codes': ['invalid-input-secret'] })
    const out = await verifyTurnstile(env, 'tok', null)
    // `invalid-input-secret` tells an attacker the deployment is misconfigured.
    if (!out.ok) expect(out.error).not.toContain('invalid-input-secret')
  })

  it('tolerates a truthy-but-not-true success field', async () => {
    // `success: "true"` is not `true`. Strict comparison, so this fails closed.
    siteverify({ ...passing, success: 'true' })
    expect(await verifyTurnstile(env, 'tok', null)).toMatchObject({ ok: false, status: 403 })
  })
})
