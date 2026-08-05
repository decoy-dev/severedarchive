import { useEffect, useRef, useState } from 'react'
import { ADMIN_API, useAdminSession } from '../lib/adminSession'
import { Suspense, lazy } from 'react'

/**
 * Code-split: everything behind the passcode — the upload form, the thumbnail
 * editor, the content editor — is for exactly one person, and every other
 * visitor was shipping it in the main bundle. `lazy` is fine HERE, unlike the
 * ABOUT object: that ban exists because Suspense holds its fallback ~300ms on a
 * hot visible path, and this panel opens from a deliberate owner click where a
 * beat of nothing before the form is imperceptible.
 */
const AdminPanel = lazy(() => import('./AdminPanel'))

/**
 * The way in to the admin backend: a passcode, checked by the Worker, and then
 * the panel it unlocks.
 *
 * This part is deliberately small and deliberately dumb. It knows how to ask
 * and how to report; it holds no secret, decides nothing, and cannot tell a
 * wrong passcode from an unconfigured deployment — the Worker answers 401 to
 * both on purpose. Authenticating opens `AdminPanel`, which is where publishing
 * actually happens.
 *
 * `credentials: 'include'` is what makes the session work: the Worker replies
 * with an httpOnly, SameSite=Strict cookie, so nothing here ever handles the
 * token and no script on the page can read it.
 */
type State = 'closed' | 'asking' | 'checking' | 'ok' | 'denied' | 'limited' | 'offline'

const MESSAGE: Record<Exclude<State, 'closed' | 'asking' | 'checking' | 'ok'>, string> = {
  denied: '> REJECTED.',
  limited: '> TOO MANY ATTEMPTS. WAIT OUT THE HOUR.',
  offline: '> BACKEND UNREACHABLE.',
}

export default function AdminLogin() {
  const [state, setState] = useState<State>('closed')
  // Announced upwards, so the file windows can offer their EDIT control. The
  // cookie is still the only thing the backend trusts; this is the interface
  // knowing a login happened.
  const { authed, signIn, signOut } = useAdminSession()
  const [passcode, setPasscode] = useState('')
  const inputRef = useRef<HTMLInputElement | null>(null)

  useEffect(() => {
    if (state === 'asking') inputRef.current?.focus()
  }, [state])

  useEffect(() => {
    if (state !== 'asking' && state !== 'checking') return
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      // Swallowed: the desktop's global Escape closes the focused window, and
      // dismissing this prompt must not also close whatever is behind it.
      e.stopPropagation()
      setState('closed')
      setPasscode('')
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [state])

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setState('checking')
    try {
      const res = await fetch(`${ADMIN_API}/api/session`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ passcode }),
      })
      // The passcode is gone from memory whatever the answer was.
      setPasscode('')
      if (res.ok) { signIn(); setState('ok') }
      else if (res.status === 429) setState('limited')
      else setState('denied')
    } catch {
      // A network failure is not a rejection, and saying so saves someone
      // retyping a passcode that was never the problem.
      setPasscode('')
      setState('offline')
    }
  }

  if (state === 'ok') {
    // Authenticating has to lead somewhere. It used to stop at a message, which
    // is a door that reports being unlocked and then does nothing.
    // Closing the panel does NOT sign out: the admin tools in the window bars
    // are the point of staying signed in, and the passcode should not have to be
    // retyped to edit a second file.
    return <Suspense fallback={null}><AdminPanel onClose={() => setState('closed')} /></Suspense>
  }

  const endSession = () => {
    // Best effort: the cookie is httpOnly, so only the Worker can clear it, and
    // whether that request lands does not change the fact that this tab is
    // signed out. It matters anyway — otherwise the session sits valid for the
    // rest of its hour on a browser whose owner has just said they are done.
    void fetch(`${ADMIN_API}/api/session`, { method: 'DELETE', credentials: 'include' }).catch(() => {})
    signOut()
    setState('closed')
  }

  if (state === 'closed') {
    // Once signed in the footer keeps a way back to the panel and a way out.
    // Reopening must not ask for the passcode again: the session is what the
    // backend checks, and the EDIT controls in the window bars are already live.
    if (authed) {
      return (
        <span className="admin-open-row">
          <button className="admin-open" onClick={() => setState('ok')} aria-label="Open publish panel">
            ◈ PUBLISH
          </button>
          <button className="admin-signout" onClick={endSession}>SIGN OUT</button>
        </span>
      )
    }
    return (
      <button className="admin-open" onClick={() => setState('asking')} aria-label="Admin login">
        ◈ ADMIN LOGIN
      </button>
    )
  }

  if (state === 'asking' || state === 'checking') {
    return (
      <form className="admin-form" onSubmit={submit}>
        <label className="admin-label" htmlFor="admin-passcode">PASSCODE</label>
        <input
          id="admin-passcode"
          ref={inputRef}
          className="admin-input"
          type="password"
          autoComplete="current-password"
          value={passcode}
          disabled={state === 'checking'}
          onChange={(e) => setPasscode(e.target.value)}
        />
        <button className="admin-go" type="submit" disabled={state === 'checking' || !passcode}>
          {state === 'checking' ? '···' : 'ENTER'}
        </button>
      </form>
    )
  }

  return (
    <span className="admin-result" data-result={state} role="status">
      {MESSAGE[state]}
      <button className="admin-again" onClick={() => setState('asking')}>RETRY</button>
    </span>
  )
}
