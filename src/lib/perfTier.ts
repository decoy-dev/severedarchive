export type PerfTier = 'full' | 'lite'

export function detectPerfTier(env: {
  reducedMotion: boolean
  deviceMemory?: number
  width: number
}): PerfTier {
  if (env.reducedMotion) return 'lite'
  if (env.deviceMemory !== undefined && env.deviceMemory <= 4) return 'lite'
  if (env.width < 480) return 'lite'
  return 'full'
}

export function readPerfTier(): PerfTier {
  return detectPerfTier({
    reducedMotion: prefersReducedMotion(),
    deviceMemory: (navigator as Navigator & { deviceMemory?: number }).deviceMemory,
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
