/**
 * Passcode verification and session tokens for the admin backend.
 *
 * Platform-free on purpose: it uses WebCrypto and nothing else, so the same
 * module runs in a Cloudflare Worker, a Vercel function and vitest. Nothing
 * here reads an environment variable or touches a request — the caller supplies
 * the stored hash and the signing secret, which keeps the security-critical
 * arithmetic testable without standing up a server.
 *
 * The rule this exists to serve: the passcode hash and the signing secret live
 * ONLY in the function's environment. Neither is ever sent to the browser, in
 * any form, and no code path here returns either of them.
 */

const enc = new TextEncoder()

/** PBKDF2 rounds. Deliberately slow — this guards a single reused passcode. */
export const PBKDF2_ITERATIONS = 210_000

const b64 = (bytes: ArrayBuffer): string =>
  btoa(String.fromCharCode(...new Uint8Array(bytes)))

const unb64 = (s: string): Uint8Array =>
  Uint8Array.from(atob(s), (c) => c.charCodeAt(0))

/**
 * Constant-time comparison.
 *
 * `a === b` on secrets leaks their contents through timing: it returns on the
 * first differing byte, so an attacker can recover a token one character at a
 * time by measuring. This always walks the whole string.
 */
export function timingSafeEqual(a: string, b: string): boolean {
  // The length check is not itself constant-time, and cannot be — but the
  // length of a hash or a token is not the secret. The contents are.
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}

async function pbkdf2(passcode: string, salt: Uint8Array, iterations: number): Promise<string> {
  const key = await crypto.subtle.importKey('raw', enc.encode(passcode), 'PBKDF2', false, ['deriveBits'])
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt: salt as BufferSource, iterations },
    key,
    256,
  )
  return b64(bits)
}

/**
 * `pbkdf2$<iterations>$<salt>$<hash>` — self-describing, so raising the
 * iteration count later does not invalidate an existing passcode record.
 */
export async function hashPasscode(passcode: string, iterations = PBKDF2_ITERATIONS): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16))
  const hash = await pbkdf2(passcode, salt, iterations)
  return `pbkdf2$${iterations}$${b64(salt.buffer)}$${hash}`
}

/**
 * False for a malformed or missing record rather than throwing: a bad env var
 * is not a login, and an UNSET one must not be either. The unset case is not
 * hypothetical — a Worker deploys perfectly well with a secret still missing,
 * and `stored.split` on undefined would throw straight past this check into the
 * handler's catch, which answers 502. A 502 on the login route reads as "the
 * server is broken", not "you are not getting in".
 */
export async function verifyPasscode(passcode: string, stored: string): Promise<boolean> {
  if (typeof stored !== 'string' || stored.length === 0) return false
  const parts = stored.split('$')
  if (parts.length !== 4 || parts[0] !== 'pbkdf2') return false
  const iterations = Number(parts[1])
  if (!Number.isInteger(iterations) || iterations < 1000) return false
  let salt: Uint8Array
  try {
    salt = unb64(parts[2])
  } catch {
    return false
  }
  const hash = await pbkdf2(passcode, salt, iterations)
  return timingSafeEqual(hash, parts[3])
}

export type SessionPayload = {
  /** who — there is one admin, but the field keeps the token self-describing */
  sub: string
  /** issued at, epoch seconds */
  iat: number
  /** expires at, epoch seconds */
  exp: number
}

async function hmac(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'],
  )
  return b64(await crypto.subtle.sign('HMAC', key, enc.encode(message)))
}

/** Default session length. Short: publishing is a deliberate act, not a state to live in. */
export const SESSION_TTL_S = 60 * 60

export async function signSession(
  secret: string,
  { sub = 'owner', now = Math.floor(Date.now() / 1000), ttl = SESSION_TTL_S } = {},
): Promise<string> {
  const payload: SessionPayload = { sub, iat: now, exp: now + ttl }
  const body = b64(enc.encode(JSON.stringify(payload)).buffer as ArrayBuffer)
  return `${body}.${await hmac(secret, body)}`
}

/**
 * The payload, or null. Null covers every failure — bad shape, bad signature,
 * expired — because the caller must not be able to tell them apart, and because
 * there is nothing useful it could do differently.
 *
 * The signature is checked BEFORE the payload is read. Parsing first would mean
 * acting on attacker-controlled JSON, and the expiry inside an unverified
 * token is worth nothing anyway.
 */
export async function verifySession(
  secret: string,
  token: string,
  now = Math.floor(Date.now() / 1000),
): Promise<SessionPayload | null> {
  const dot = token.lastIndexOf('.')
  if (dot <= 0) return null
  const body = token.slice(0, dot)
  const signature = token.slice(dot + 1)
  if (!timingSafeEqual(await hmac(secret, body), signature)) return null

  let payload: SessionPayload
  try {
    payload = JSON.parse(new TextDecoder().decode(unb64(body)))
  } catch {
    return null
  }
  if (typeof payload?.exp !== 'number' || typeof payload?.iat !== 'number') return null
  if (payload.exp <= now) return null
  // A token issued in the future is a clock problem or a forgery attempt with a
  // leaked secret; either way it is not something to honour.
  if (payload.iat > now + 60) return null
  return payload
}
