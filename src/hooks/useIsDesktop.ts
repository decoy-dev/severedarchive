import { useSyncExternalStore } from 'react'
import { DESKTOP_MIN_WIDTH } from '../lib/activation'

/**
 * The one desktop/mobile split, read from the same constant the activation
 * policy resolves against — so "windows open here" and "the mobile row renders
 * here" can never drift apart into two different breakpoints.
 *
 * A width query, deliberately not a pointer-capability query (binding ruling 3):
 * a tablet in landscape is a desktop, the same tablet in portrait is not.
 */
const QUERY = `(min-width: ${DESKTOP_MIN_WIDTH}px)`

const subscribe = (cb: () => void) => {
  const mq = window.matchMedia(QUERY)
  mq.addEventListener('change', cb)
  return () => mq.removeEventListener('change', cb)
}

export function useIsDesktop(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia(QUERY).matches,
    () => true,
  )
}
