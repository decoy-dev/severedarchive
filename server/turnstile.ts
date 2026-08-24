import { COMMISSION_ACTION } from '../src/lib/commissionFields'

/**
 * Turnstile verification for the public commission form.
 *
 * The form is the one unauthenticated write on this Worker: a stranger, a 10MB
 * upload, and an email to the client at the end of it. The rate limit bounds one
 * address to five an hour, which stops a single machine and does nothing at all
 * about a thousand of them sending one each.
 *
 * FAILS CLOSED, everywhere. An unset secret, a siteverify call that will not
 * complete, a token for the wrong action, a token minted on a hostname this
 * deployment does not serve — all of them refuse. A bot-protection check that
 * waves traffic through when it cannot make up its mind is not a check.
 */

export type TurnstileEnv = {
  /** From `wrangler secret put TURNSTILE_SECRET`. Absent means no submissions. */
  TURNSTILE_SECRET?: string
  /**
   * Hostnames whose tokens this deployment will accept, comma-separated.
   *
   * Deployment-specific and deliberately NOT the widget's own domain list. The
   * widget carries `localhost` so the form can be worked on locally; production
   * accepting a token minted on localhost would defeat the whole check, because
   * anyone can serve a page on their own localhost.
   */
  TURNSTILE_HOSTNAMES?: string
}

const SITEVERIFY = 'https://challenges.cloudflare.com/turnstile/v0/siteverify'

/** Long enough for a real token, short enough that a megabyte of junk is not parsed. */
const MAX_TOKEN_CHARS = 2048

export type VerifyOutcome = { ok: true } | { ok: false; status: 403 | 503; error: string }

type SiteverifyBody = {
  success?: unknown
  action?: unknown
  hostname?: unknown
  'error-codes'?: unknown
}

/**
 * Check a Turnstile token.
 *
 * `remoteip` is the caller's real address from `CF-Connecting-IP`, which
 * Cloudflare sets and the caller cannot forge. Passing it lets Turnstile factor
 * the origin of the request into its own scoring.
 */
export async function verifyTurnstile(
  env: TurnstileEnv,
  token: string | null,
  remoteip: string | null,
): Promise<VerifyOutcome> {
  const hostnames = (env.TURNSTILE_HOSTNAMES ?? '')
    .split(',').map((h) => h.trim()).filter(Boolean)

  // Misconfiguration is refused rather than skipped, and says so in the log: a
  // deployment missing either half would otherwise silently become the open
  // endpoint this exists to close.
  if (!env.TURNSTILE_SECRET || hostnames.length === 0) {
    console.error('turnstile not configured', {
      secret: Boolean(env.TURNSTILE_SECRET), hostnames: hostnames.length,
    })
    return { ok: false, status: 503, error: 'THE FORM IS NOT AVAILABLE RIGHT NOW.' }
  }

  if (!token || token.length > MAX_TOKEN_CHARS) {
    return { ok: false, status: 403, error: 'VERIFICATION FAILED. RELOAD THE PAGE AND TRY AGAIN.' }
  }

  const form = new URLSearchParams({ secret: env.TURNSTILE_SECRET, response: token })
  if (remoteip) form.set('remoteip', remoteip)

  // Named `verdict`, not `body`: it used to be `body`, which the fetch init's
  // shorthand `body,` then picked up instead of the form — hoisted and still
  // undefined, so siteverify received no parameters at all and every check
  // failed closed for the wrong reason. The test that sends the secret is what
  // caught it.
  let verdict: SiteverifyBody
  try {
    const res = await fetch(SITEVERIFY, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      // Bounded: without it a hung siteverify holds the request until the
      // platform kills it, and the visitor watches a spinner for the duration.
      signal: AbortSignal.timeout(10_000),
      body: form,
    })
    if (!res.ok) throw new Error(`siteverify ${res.status}`)
    verdict = await res.json() as SiteverifyBody
  } catch {
    // Network failure, non-2xx, or a body that is not JSON. Closed.
    return { ok: false, status: 403, error: 'COULD NOT VERIFY. RELOAD THE PAGE AND TRY AGAIN.' }
  }

  // All three, not just `success`. A valid token from another form on another
  // one of this account's widgets is still a valid token; the action and the
  // hostname are what tie it to THIS form on THIS site.
  const passed = verdict.success === true
    && verdict.action === COMMISSION_ACTION
    && typeof verdict.hostname === 'string'
    && hostnames.includes(verdict.hostname)

  if (!passed) {
    console.error('turnstile rejected', {
      success: verdict.success,
      action: typeof verdict.action === 'string' ? verdict.action : null,
      hostname: typeof verdict.hostname === 'string' ? verdict.hostname : null,
      codes: Array.isArray(verdict['error-codes']) ? verdict['error-codes'] : null,
    })
    return { ok: false, status: 403, error: 'VERIFICATION FAILED. RELOAD THE PAGE AND TRY AGAIN.' }
  }
  return { ok: true }
}
