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
    reducedMotion: window.matchMedia('(prefers-reduced-motion: reduce)').matches,
    deviceMemory: (navigator as Navigator & { deviceMemory?: number }).deviceMemory,
    width: window.innerWidth,
  })
}
