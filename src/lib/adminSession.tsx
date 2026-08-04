import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react'

/**
 * Whether this tab is signed in as the owner.
 *
 * Not the session itself — that is an httpOnly cookie the Worker sets, which no
 * script here can read, and which remains the only thing the backend trusts.
 * This is the interface's knowledge that a login succeeded, so chrome elsewhere
 * can offer the tools that come with it.
 *
 * It lives above `Desktop` for the same reason the window registry does: a file
 * window must not reach down into the login form, and the login form must not
 * know what windows exist. Both talk to this.
 *
 * Deliberately NOT persisted. Reloading the page forgets it, and the EDIT
 * controls disappear until the passcode is entered again — which is correct
 * whichever way the cookie went: if it expired the tools would 401 anyway, and
 * if it did not, one form submission gets them back. Persisting this in storage
 * would mean a stale flag showing controls that cannot work, and a flag on the
 * page saying "an admin uses this browser" for anyone who looks.
 */
type AdminSession = {
  authed: boolean
  signIn: () => void
  signOut: () => void
}

const AdminSessionContext = createContext<AdminSession>({
  authed: false,
  signIn: () => {},
  signOut: () => {},
})

export function AdminSessionProvider({ children }: { children: ReactNode }) {
  const [authed, setAuthed] = useState(false)
  const signIn = useCallback(() => setAuthed(true), [])
  const signOut = useCallback(() => setAuthed(false), [])
  const value = useMemo(() => ({ authed, signIn, signOut }), [authed, signIn, signOut])
  return <AdminSessionContext.Provider value={value}>{children}</AdminSessionContext.Provider>
}

export const useAdminSession = (): AdminSession => useContext(AdminSessionContext)

/**
 * The one place the admin API's base URL is decided.
 *
 * It was written out in two components and about to be written out in a third,
 * which is how a deployment ends up with one of them pointing at a Worker that
 * no longer exists.
 */
export const ADMIN_API: string =
  import.meta.env.VITE_ADMIN_API ?? 'https://severedarchive-admin.chris-216.workers.dev'
