import { useCallback, useEffect, useRef, useState } from 'react'

/**
 * The Turnstile widget, rendered explicitly.
 *
 * Explicitly and not by dropping a `.cf-turnstile` div on the page, because a
 * token is redeemed EXACTLY ONCE at siteverify and this form stays mounted after
 * a failed submit. Implicit rendering gives no handle to reset, so the second
 * press would send a token the server has already spent, and the visitor would
 * watch a form fail twice for reasons it could not explain. Explicit rendering
 * hands back a widget id, and the id is what `reset` needs.
 *
 * The script is loaded once per page rather than per mount: the panel can be
 * opened, closed and opened again, and re-adding the tag each time leaks both
 * script elements and Turnstile's own listeners.
 */

/** Only the parts of Turnstile's global that this uses. */
type TurnstileApi = {
  render: (el: HTMLElement, opts: {
    sitekey: string
    action?: string
    theme?: 'auto' | 'light' | 'dark'
    size?: 'normal' | 'flexible' | 'compact'
    callback?: (token: string) => void
    'error-callback'?: () => void
    'expired-callback'?: () => void
  }) => string | undefined
  reset: (id?: string) => void
  remove: (id?: string) => void
}

declare global {
  interface Window { turnstile?: TurnstileApi }
}

const SRC = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit'

/** Long enough for a slow connection, short enough not to strand the visitor. */
const LOAD_TIMEOUT_MS = 12_000

let loader: Promise<TurnstileApi> | null = null

function loadTurnstile(): Promise<TurnstileApi> {
  if (loader) return loader
  loader = new Promise<TurnstileApi>((resolve, reject) => {
    if (window.turnstile) { resolve(window.turnstile); return }

    const existing = document.querySelector<HTMLScriptElement>(`script[src="${SRC}"]`)
    const tag = existing ?? document.createElement('script')
    // Poll rather than trust `onload`: the script defines `window.turnstile`
    // asynchronously after its own load event in some builds, and reading it on
    // load has been observed undefined.
    const started = Date.now()
    const settle = window.setInterval(() => {
      if (window.turnstile) {
        window.clearInterval(settle)
        resolve(window.turnstile)
      } else if (Date.now() - started > LOAD_TIMEOUT_MS) {
        window.clearInterval(settle)
        // Cleared so a later open can try again — a blocker may have been
        // switched off, or the network may have come back.
        loader = null
        reject(new Error('turnstile did not load'))
      }
    }, 60)

    if (!existing) {
      tag.src = SRC
      tag.async = true
      tag.defer = true
      document.head.appendChild(tag)
    }
  })
  return loader
}

/**
 * `unavailable` is the honest state for a blocked or failed script, and the form
 * shows a way to make contact by hand instead. It never means "submit anyway":
 * the Worker fails closed regardless, so a form that pretended otherwise would
 * only be collecting enquiries it cannot deliver.
 */
export type TurnstileState = 'loading' | 'ready' | 'unavailable'

export function useTurnstile(siteKey: string, action: string): {
  state: TurnstileState
  token: string | null
  /** Mount point for the widget. */
  ref: (el: HTMLDivElement | null) => void
  /** Spend the current token and ask for another. Call after every attempt. */
  reset: () => void
} {
  const [state, setState] = useState<TurnstileState>('loading')
  const [token, setToken] = useState<string | null>(null)
  const widgetId = useRef<string | null>(null)
  const host = useRef<HTMLDivElement | null>(null)
  const rendered = useRef(false)

  const ref = useCallback((el: HTMLDivElement | null) => { host.current = el }, [])

  useEffect(() => {
    let live = true

    /**
     * The guarantee that this never sits in `loading`.
     *
     * The loader has its own deadline, and relying on it alone was wrong: with
     * the script served 200 but `window.turnstile` never appearing — an
     * extension that neuters the script rather than blocking the request, which
     * is what most of them do — the form waited indefinitely and told the
     * visitor to "give it a moment" forever. A watchdog on the STATE is the only
     * thing that cannot be defeated by the loader misbehaving, because it does
     * not depend on the loader at all.
     *
     * Observed while verifying: 21 seconds in headless Chrome, script 200,
     * global still undefined, state still `loading`, SUBMIT permanently inert.
     */
    const watchdog = window.setTimeout(() => {
      if (live) setState((s) => (s === 'loading' ? 'unavailable' : s))
    }, LOAD_TIMEOUT_MS + 1_000)

    loadTurnstile().then((api) => {
      // `rendered` guards StrictMode's double mount, which would otherwise draw
      // two widgets into the same container.
      if (!live || !host.current || rendered.current) return
      rendered.current = true
      widgetId.current = api.render(host.current, {
        sitekey: siteKey,
        action,
        theme: 'dark',
        size: 'flexible',
        callback: (t) => { if (live) { setToken(t); setState('ready') } },
        // A token that expires while the visitor is still typing is not an
        // error: clear it and let the widget mint another.
        'expired-callback': () => { if (live) setToken(null) },
        'error-callback': () => { if (live) { setToken(null); setState('unavailable') } },
      }) ?? null
      // Rendered, but no token yet — the challenge runs next and the callback is
      // what says `ready`. Staying in `loading` here is correct.
    }).catch(() => { if (live) setState('unavailable') })

    return () => {
      live = false
      window.clearTimeout(watchdog)
      // Removed on unmount so closing and reopening the panel does not leave the
      // old widget's timers running behind a detached node.
      if (widgetId.current && window.turnstile) {
        window.turnstile.remove(widgetId.current)
        widgetId.current = null
        rendered.current = false
      }
    }
  }, [siteKey, action])

  const reset = useCallback(() => {
    setToken(null)
    if (widgetId.current && window.turnstile) window.turnstile.reset(widgetId.current)
  }, [])

  return { state, token, ref, reset }
}
