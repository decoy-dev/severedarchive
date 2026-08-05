/**
 * Watches for the deploy that carries an edit, so the admin panels can say
 * "LIVE" when it is actually live instead of leaving the owner to poll the
 * site by hand.
 *
 * The signal is the page's own bundle: Vite hashes it, so `assets/index-*.js`
 * in the served HTML changes on every deploy and only on a deploy. Polling our
 * own origin costs no rate limit and needs no token — the alternative (the
 * GitHub Actions API) is unauthenticated at 60 requests an hour per IP, which
 * a 15-second poll exhausts in minutes.
 *
 * This is FEEDBACK, not optimism: nothing in the interface pretends the edit
 * has landed until the deploy that contains it is being served. That is the
 * same rule the upload flow follows by answering "TRANSCODE RUNNING" to a 202.
 */

/** The build marker in a served index.html, or null when there isn't one. */
export const bundleMarker = (html: string): string | null =>
  /assets\/index-[A-Za-z0-9_-]+\.js/.exec(html)?.[0] ?? null

/** Deploys take ~1–3 minutes end to end; past this something is wrong. */
export const WATCH_TIMEOUT_MS = 8 * 60 * 1000
export const WATCH_INTERVAL_MS = 15 * 1000

/**
 * Calls `onLive` once, when the served bundle differs from the one captured at
 * start; `onTimeout` if that never happens inside the window. Returns a cancel.
 *
 * The baseline is fetched, not read from the DOM: the page a long admin
 * session is running in may already be one deploy behind the CDN, and diffing
 * against a stale baseline would announce someone else's deploy as this
 * edit's. Fetching both ends of the comparison from the same place makes the
 * comparison mean one thing: "the site changed after the save".
 *
 * In dev there is no hashed bundle in the HTML (`bundleMarker` returns null)
 * and the watch quietly never fires — the deploy it would be watching for does
 * not exist there either.
 */
export function watchForDeploy(opts: {
  onLive: () => void
  onTimeout?: () => void
  fetchImpl?: typeof fetch
  intervalMs?: number
  timeoutMs?: number
  /** Defaults to the page's own path; injectable for tests. */
  url?: string
}): () => void {
  const f = opts.fetchImpl ?? fetch
  const intervalMs = opts.intervalMs ?? WATCH_INTERVAL_MS
  const timeoutMs = opts.timeoutMs ?? WATCH_TIMEOUT_MS

  let cancelled = false
  let baseline: string | null | undefined
  let timer: ReturnType<typeof setTimeout> | undefined
  const started = Date.now()
  const url = opts.url ?? (typeof window === 'undefined' ? '/' : window.location.pathname)

  // `cache: 'no-store'` plus the changing query: GitHub Pages keys its CDN
  // cache on the full URL, so this reads what a fresh visitor would be served
  // rather than the copy this browser is holding under max-age=600.
  const read = async (): Promise<string | null> => {
    const res = await f(`${url}?deploy-watch=${Date.now()}`, { cache: 'no-store' })
    return bundleMarker(await res.text())
  }

  const tick = async () => {
    if (cancelled) return
    try {
      const marker = await read()
      if (cancelled) return
      if (baseline === undefined) {
        baseline = marker
      } else if (marker !== null && baseline !== null && marker !== baseline) {
        cancelled = true
        opts.onLive()
        return
      }
      // No marker means dev, where there is nothing to watch.
      if (baseline === null) { cancelled = true; return }
    } catch {
      /* one failed poll is a poll, not an outcome */
    }
    if (Date.now() - started >= timeoutMs) {
      cancelled = true
      opts.onTimeout?.()
      return
    }
    timer = setTimeout(tick, intervalMs)
  }
  void tick()

  return () => {
    cancelled = true
    clearTimeout(timer)
  }
}
