import { useSyncExternalStore } from 'react'

/**
 * One media query, read reactively. `useIsDesktop` is the named case that owns
 * the desktop/mobile split; anything else asking a width question should say
 * which question it is asking rather than borrowing that one.
 */
export function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    (cb) => {
      const mq = window.matchMedia(query)
      mq.addEventListener('change', cb)
      return () => mq.removeEventListener('change', cb)
    },
    () => window.matchMedia(query).matches,
    () => true,
  )
}
