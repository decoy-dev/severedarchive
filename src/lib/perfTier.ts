export type PerfTier = 'full' | 'lite'

export function detectPerfTier(env: {
  reducedMotion: boolean
  deviceMemory?: number
  /** navigator.hardwareConcurrency — logical cores, present in every engine */
  cores?: number
  width: number
}): PerfTier {
  if (env.reducedMotion) return 'lite'
  if (env.deviceMemory !== undefined && env.deviceMemory <= 4) return 'lite'
  // deviceMemory is Chromium-only, so an old machine on Firefox or Safari sailed
  // straight into the full tier. Core count exists everywhere; two logical cores
  // is old or budget hardware in any year this site will be up, and the full
  // tier's five decodes under viewport-sized blurs are exactly what it cannot do.
  // Deliberately ≤2 and not ≤4 — plenty of adequate machines report 4.
  if (env.cores !== undefined && env.cores <= 2) return 'lite'
  if (env.width < 480) return 'lite'
  return 'full'
}

export function readPerfTier(): PerfTier {
  return detectPerfTier({
    reducedMotion: prefersReducedMotion(),
    deviceMemory: (navigator as Navigator & { deviceMemory?: number }).deviceMemory,
    cores: navigator.hardwareConcurrency,
    width: window.innerWidth,
  })
}

// Distinct from PerfTier: tier governs video load/playback cost, this governs
// whether decorative UI motion (boot timeline, FLIP zoom, entrances, tab
// transitions) runs at all. A small/low-memory device can be full-motion-eligible
// UI-wise while still being 'lite' tier for video, and vice versa.
export function prefersReducedMotion(): boolean {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

// Chromium is currently the only engine that resolves an SVG filter reference
// inside backdrop-filter; other engines either ignore the whole declaration or
// throw on CSS.supports. Gate the refraction effect on that support probe so
// non-Chromium browsers fall back to the plain .glass look.
export function supportsLiquidRefraction(): boolean {
  try {
    return CSS.supports('backdrop-filter', 'url(#liquid-refraction)')
  } catch {
    return false
  }
}
