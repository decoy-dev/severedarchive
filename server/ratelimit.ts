/**
 * A fixed-window attempt counter, over whatever durable store the platform has.
 *
 * This guards the passcode endpoint. `server/auth.ts` makes a single guess
 * expensive (PBKDF2, 210k rounds); this makes a *lot* of guesses impossible,
 * which is the half that matters against someone with a script rather than a
 * hunch.
 *
 * Fixed window, not sliding: a sliding window needs a list of timestamps per
 * key, and this runs on Workers KV where every read and write is a network
 * round trip. A fixed window is one read and one write, and its worst case —
 * twice the limit across a window boundary — is not interesting for a login
 * that allows single digits per hour.
 *
 * The store is an interface so the limiter can be tested without KV, and so
 * swapping to a Durable Object later touches nothing but the binding.
 */
export type CounterStore = {
  get(key: string): Promise<string | null>
  put(key: string, value: string, opts: { expirationTtl: number }): Promise<void>
}

export type RateLimitResult = {
  allowed: boolean
  /** attempts used in this window, after counting the current one */
  used: number
  /** seconds until the window resets */
  retryAfter: number
}

export type RateLimitOptions = {
  limit: number
  windowS: number
  now?: number
}

/**
 * Counts an attempt and says whether it is allowed.
 *
 * The count is incremented for allowed and denied attempts alike. Not counting
 * denied ones would let an attacker who is already over the limit keep the
 * window from advancing... and, more to the point, would mean the limit only
 * ever applies to people who stop.
 */
export async function countAttempt(
  store: CounterStore,
  key: string,
  { limit, windowS, now = Date.now() }: RateLimitOptions,
): Promise<RateLimitResult> {
  const windowStart = Math.floor(now / 1000 / windowS) * windowS
  const windowKey = `rl:${key}:${windowStart}`
  const raw = await store.get(windowKey)
  const parsed = raw === null ? 0 : Number.parseInt(raw, 10)
  const previous = Number.isFinite(parsed) && parsed >= 0 ? parsed : 0
  const used = previous + 1

  const elapsed = now / 1000 - windowStart
  const retryAfter = Math.max(1, Math.ceil(windowS - elapsed))

  // Written before the verdict is returned, so a rejected caller has still been
  // counted. The TTL is the window, so keys clean themselves up.
  await store.put(windowKey, String(used), { expirationTtl: windowS + 60 })

  return { allowed: used <= limit, used, retryAfter }
}

/**
 * The client identity a limit is keyed on. `CF-Connecting-IP` is set by
 * Cloudflare itself and cannot be spoofed by the caller — unlike
 * `X-Forwarded-For`, which is why that one is not consulted. An unknown origin
 * shares one bucket, which is the conservative direction: it throttles harder,
 * not less.
 */
export function clientKey(headers: Headers): string {
  return headers.get('CF-Connecting-IP') ?? 'unknown'
}
