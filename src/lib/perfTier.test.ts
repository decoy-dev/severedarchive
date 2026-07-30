import { describe, it, expect } from 'vitest'
import { detectPerfTier } from './perfTier'

describe('detectPerfTier', () => {
  it('full on a capable desktop', () =>
    expect(detectPerfTier({ reducedMotion: false, deviceMemory: 8, width: 1440 })).toBe('full'))
  it('lite when reduced motion requested', () =>
    expect(detectPerfTier({ reducedMotion: true, deviceMemory: 8, width: 1440 })).toBe('lite'))
  it('lite on low memory', () =>
    expect(detectPerfTier({ reducedMotion: false, deviceMemory: 4, width: 1440 })).toBe('lite'))
  it('lite on very small screens', () =>
    expect(detectPerfTier({ reducedMotion: false, deviceMemory: 8, width: 375 })).toBe('lite'))
  it('full when deviceMemory is unavailable (Safari/Firefox)', () =>
    expect(detectPerfTier({ reducedMotion: false, width: 1024 })).toBe('full'))
})
