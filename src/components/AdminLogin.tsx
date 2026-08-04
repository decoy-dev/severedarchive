import { useEffect, useRef, useState } from 'react'

/**
 * The way in to the admin backend: a passcode, checked by the Worker.
 *
 * Deliberately small and deliberately dumb. It knows how to ask and how to
 * report; it holds no secret, decides nothing, and cannot tell a wrong passcode
 * from an unconfigured deployment — the Worker answers 401 to both on purpose.
 * The upload form and the ABOUT/LINKS editors are the next slice; this is the
 * door they will sit behind.
 *
 * `credentials: 'include'` is what makes the session work: the Worker replies
 * with an httpOnly, SameSite=Strict cookie, so nothing here ever handles the
 * token and no script on the page can read it.
 */
const API = import.meta.env.VITE_ADMIN_API ?? 'https://severedarchive-admin.chris-216.workers.dev'

type State = 'closed' | 'asking' | 'checking' | 'ok' | 'denied' | 'limited' | 'offline'

const MESSAGE: Record<Exclude<State, 'closed' | 'asking' | 'checking'>, string> = {
  ok: '> SESSION AUTHENTICATED.',
  denied: '> REJECTED.',
  limited: '> TOO MANY ATTEMPTS. WAIT OUT THE HOUR.',
  offline: '> BACKEND UNREACHABLE.',
}

export default function AdminLogin() {
  const [state, setState] = useState<State>('closed')
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
      const res = await fetch(`${API}/api/session`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ passcode }),
      })
      // The passcode is gone from memory whatever the answer was.
      setPasscode('')
      if (res.ok) setState('ok')
      else if (res.status === 429) setState('limited')
      else setState('denied')
    } catch {
      // A network failure is not a rejection, and saying so saves someone
      // retyping a passcode that was never the problem.
      setPasscode('')
      setState('offline')
    }
  }

  if (state === 'closed') {
    return (
      <button className="admin-open" onClick={() => setState('asking')} aria-label="Admin login">
        ◈ LOGIN
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
      <button className="admin-again" onClick={() => setState(state === 'ok' ? 'closed' : 'asking')}>
        {state === 'ok' ? 'CLOSE' : 'RETRY'}
      </button>
    </span>
  )
}
