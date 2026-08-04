import { describe, it, expect } from 'vitest'
import { clientKey, countAttempt, type CounterStore } from './ratelimit'

function memoryStore(): CounterStore & { map: Map<string, string> } {
  const map = new Map<string, string>()
  return {
    map,
    async get(key) { return map.get(key) ?? null },
    async put(key, value) { map.set(key, value) },
  }
}

const opts = { limit: 3, windowS: 3600 }

describe('countAttempt', () => {
  it('allows up to the limit and refuses after it', async () => {
    const store = memoryStore()
    const now = 1_800_000_000_000
    for (let i = 1; i <= 3; i++) {
      const r = await countAttempt(store, 'ip', { ...opts, now })
      expect(r.allowed, `attempt ${i}`).toBe(true)
      expect(r.used).toBe(i)
    }
    const over = await countAttempt(store, 'ip', { ...opts, now })
    expect(over.allowed).toBe(false)
    expect(over.used).toBe(4)
  })

  it('counts refused attempts too', async () => {
    // Otherwise the limit only applies to callers who stop when told.
    const store = memoryStore()
    const now = 1_800_000_000_000
    for (let i = 0; i < 6; i++) await countAttempt(store, 'ip', { ...opts, now })
    const r = await countAttempt(store, 'ip', { ...opts, now })
    expect(r.used).toBe(7)
    expect(r.allowed).toBe(false)
  })

  it('keeps separate buckets per key', async () => {
    const store = memoryStore()
    const now = 1_800_000_000_000
    for (let i = 0; i < 3; i++) await countAttempt(store, 'a', { ...opts, now })
    const other = await countAttempt(store, 'b', { ...opts, now })
    expect(other.allowed).toBe(true)
    expect(other.used).toBe(1)
  })

  it('resets in the next window', async () => {
    const store = memoryStore()
    const now = 1_800_000_000_000
    for (let i = 0; i < 4; i++) await countAttempt(store, 'ip', { ...opts, now })
    const later = await countAttempt(store, 'ip', { ...opts, now: now + 3600_000 })
    expect(later.allowed).toBe(true)
    expect(later.used).toBe(1)
  })

  it('reports the seconds until that reset', async () => {
    const store = memoryStore()
    // 100s into the window, so 3500 remain.
    const now = Math.floor(1_800_000_000 / 3600) * 3600 * 1000 + 100_000
    const r = await countAttempt(store, 'ip', { ...opts, now })
    expect(r.retryAfter).toBeGreaterThan(3400)
    expect(r.retryAfter).toBeLessThanOrEqual(3600)
  })

  it('treats a corrupted counter as zero rather than crashing the login', async () => {
    const store = memoryStore()
    const now = 1_800_000_000_000
    await countAttempt(store, 'ip', { ...opts, now })
    for (const [k] of store.map) store.map.set(k, 'not-a-number')
    const r = await countAttempt(store, 'ip', { ...opts, now })
    expect(r.used).toBe(1)
    expect(r.allowed).toBe(true)
  })

  it('sets a TTL so the keys clean themselves up', async () => {
    const seen: { key: string; ttl: number }[] = []
    const store: CounterStore = {
      async get() { return null },
      async put(key, _v, o) { seen.push({ key, ttl: o.expirationTtl }) },
    }
    await countAttempt(store, 'ip', opts)
    expect(seen[0].ttl).toBeGreaterThanOrEqual(3600)
  })
})

describe('clientKey', () => {
  it('uses the header Cloudflare sets, not one the caller controls', async () => {
    // X-Forwarded-For is caller-supplied: keying on it would let an attacker
    // mint a fresh bucket per request and defeat the limit entirely.
    const spoofed = new Headers({ 'x-forwarded-for': '1.2.3.4' })
    expect(clientKey(spoofed)).toBe('unknown')
    const real = new Headers({ 'CF-Connecting-IP': '5.6.7.8', 'x-forwarded-for': '1.2.3.4' })
    expect(clientKey(real)).toBe('5.6.7.8')
  })
})
