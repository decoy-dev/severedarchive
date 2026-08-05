import { describe, it, expect, vi } from 'vitest'
import { bundleMarker, watchForDeploy, WATCH_TIMEOUT_MS } from './deployWatch'

const page = (bundle: string) =>
  `<!doctype html><html><head><script type="module" crossorigin src="/severedarchive/assets/${bundle}"></script></head></html>`

describe('bundleMarker', () => {
  it('reads the hashed bundle out of served HTML', () => {
    expect(bundleMarker(page('index-DRrqnauh.js'))).toBe('assets/index-DRrqnauh.js')
  })

  it('is null in dev, where nothing is hashed and nothing deploys', () => {
    expect(bundleMarker('<script type="module" src="/src/main.tsx"></script>')).toBeNull()
  })

  it('ignores the other chunks — only the entry names the deploy', () => {
    expect(bundleMarker(page('AboutAsciiObject-Csq3T0U2.js'))).toBeNull()
  })
})

const respond = (html: string) => Promise.resolve(new Response(html))

describe('watchForDeploy', () => {
  it('fires onLive once the served bundle changes, and only then', async () => {
    vi.useFakeTimers()
    const bundles = ['index-AAA.js', 'index-AAA.js', 'index-BBB.js', 'index-CCC.js']
    let call = 0
    const f = vi.fn(() => respond(page(bundles[Math.min(call++, bundles.length - 1)])))
    const onLive = vi.fn()
    watchForDeploy({ onLive, fetchImpl: f as unknown as typeof fetch, intervalMs: 1000 })

    await vi.advanceTimersByTimeAsync(1500)
    expect(onLive).not.toHaveBeenCalled()   // same bundle: not live yet
    await vi.advanceTimersByTimeAsync(1000)
    expect(onLive).toHaveBeenCalledTimes(1) // changed: live
    await vi.advanceTimersByTimeAsync(5000)
    expect(onLive).toHaveBeenCalledTimes(1) // and it does not keep firing
    vi.useRealTimers()
  })

  it('never fires in dev, where the HTML has no hashed bundle', async () => {
    vi.useFakeTimers()
    const f = vi.fn(() => respond('<script src="/src/main.tsx"></script>'))
    const onLive = vi.fn()
    watchForDeploy({ onLive, fetchImpl: f as unknown as typeof fetch, intervalMs: 1000 })
    await vi.advanceTimersByTimeAsync(10_000)
    expect(onLive).not.toHaveBeenCalled()
    expect(f).toHaveBeenCalledTimes(1)      // it also stops asking
    vi.useRealTimers()
  })

  it('gives up after the window and says so', async () => {
    vi.useFakeTimers()
    const f = vi.fn(() => respond(page('index-AAA.js')))
    const onLive = vi.fn()
    const onTimeout = vi.fn()
    watchForDeploy({ onLive, onTimeout, fetchImpl: f as unknown as typeof fetch, intervalMs: 60_000 })
    await vi.advanceTimersByTimeAsync(WATCH_TIMEOUT_MS + 60_000)
    expect(onLive).not.toHaveBeenCalled()
    expect(onTimeout).toHaveBeenCalledTimes(1)
    vi.useRealTimers()
  })

  it('cancel stops everything', async () => {
    vi.useFakeTimers()
    const bundles = ['index-AAA.js', 'index-BBB.js']
    let call = 0
    const f = vi.fn(() => respond(page(bundles[Math.min(call++, 1)])))
    const onLive = vi.fn()
    const cancel = watchForDeploy({ onLive, fetchImpl: f as unknown as typeof fetch, intervalMs: 1000 })
    await vi.advanceTimersByTimeAsync(500)
    cancel()
    await vi.advanceTimersByTimeAsync(10_000)
    expect(onLive).not.toHaveBeenCalled()
    vi.useRealTimers()
  })

  it('a failed poll is a poll, not an outcome', async () => {
    vi.useFakeTimers()
    let call = 0
    const f = vi.fn(() => {
      call++
      if (call === 2) return Promise.reject(new Error('offline'))
      return respond(page(call >= 3 ? 'index-BBB.js' : 'index-AAA.js'))
    })
    const onLive = vi.fn()
    watchForDeploy({ onLive, fetchImpl: f as unknown as typeof fetch, intervalMs: 1000 })
    await vi.advanceTimersByTimeAsync(3500)
    expect(onLive).toHaveBeenCalledTimes(1)
    vi.useRealTimers()
  })
})
