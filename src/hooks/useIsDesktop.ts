import { DESKTOP_MIN_WIDTH } from '../lib/activation'
import { useMediaQuery } from './useMediaQuery'

/**
 * The one desktop/mobile split, read from the same constant the activation
 * policy resolves against — so "windows open here" and "the mobile row renders
 * here" can never drift apart into two different breakpoints.
 *
 * A width query, deliberately not a pointer-capability query (binding ruling 3):
 * a tablet in landscape is a desktop, the same tablet in portrait is not.
 */
export function useIsDesktop(): boolean {
  return useMediaQuery(`(min-width: ${DESKTOP_MIN_WIDTH}px)`)
}
