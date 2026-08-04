import { describe, it, expect } from 'vitest'
import { clock, frameCount, telemetryRows, telemetryValue, TELEMETRY_KEYS, type WindowSample } from './telemetry'

const sample: WindowSample = {
  x: 240.4, y: 151.6, w: 720, h: 446,
  time: 4.5, duration: 12,
  frames: 108, dropped: 0,
  buffered: 6, readyState: 4,
  volume: 0.6, muted: false,
  source: 'full',
}

describe('clock', () => {
  it('is mm:ss.cc so the field visibly ticks', () => {
    expect(clock(4.5)).toBe('00:04.50')
    expect(clock(61.07)).toBe('01:01.07')
    expect(clock(0)).toBe('00:00.00')
  })

  it('says nothing rather than NaN before metadata lands', () => {
    expect(clock(NaN)).toBe('--:--.--')
    expect(clock(Infinity)).toBe('--:--.--')
    expect(clock(-1)).toBe('--:--.--')
  })
})

describe('frameCount', () => {
  it('is a fixed-width odometer of presented frames', () => {
    expect(frameCount(108)).toBe('000108')
    expect(frameCount(0)).toBe('000000')
  })

  it('keeps climbing across a loop, because that is what the engine counts', () => {
    // This is the reason it is a count and not a position: after the wrap,
    // currentTime resets and this does not. Deriving fps from frames/time would
    // be right on the first pass and increasingly wrong on every one after.
    expect(frameCount(288)).toBe('000288')
  })

  it('stays six wide rather than growing the cell on a long session', () => {
    expect(frameCount(1234567)).toHaveLength(6)
  })

  it('shows dashes where the engine has no quality API', () => {
    expect(frameCount(null)).toBe('------')
    expect(frameCount(NaN)).toBe('------')
  })
})

describe('telemetryValue', () => {
  it('rounds position so a drag reads as whole pixels', () => {
    expect(telemetryValue('pos', sample)).toBe('240, 152')
  })

  it('formats the fields that have units', () => {
    expect(telemetryValue('size', sample)).toBe('720×446')
    expect(telemetryValue('time', sample)).toBe('00:04.50 / 00:12.00')
    expect(telemetryValue('buf', sample)).toBe('050%')
    expect(telemetryValue('vol', sample)).toBe('060')
    expect(telemetryValue('src', sample)).toBe('_full')
  })

  it('names the ready state instead of printing its number', () => {
    expect(telemetryValue('ready', sample)).toBe('FULL')
    expect(telemetryValue('ready', { ...sample, readyState: 1 })).toBe('META')
    expect(telemetryValue('ready', { ...sample, readyState: 9 })).toBe('NONE')
  })

  it('calls silence silence, whether it came from mute or from the level', () => {
    expect(telemetryValue('audio', { ...sample, muted: true })).toBe('MUTED')
    expect(telemetryValue('audio', { ...sample, volume: 0 })).toBe('MUTED')
    expect(telemetryValue('audio', sample)).toBe('LIVE')
  })

  it('clamps buffered rather than reporting more than a whole clip', () => {
    expect(telemetryValue('buf', { ...sample, buffered: 99 })).toBe('100%')
    expect(telemetryValue('buf', { ...sample, duration: 0 })).toBe('---%')
  })

  it('holds a fixed width per field, so the grid does not jitter', () => {
    // Every value is either padded or has a stable shape; the cells must not
    // resize on every frame as digits come and go.
    expect(telemetryValue('vol', { ...sample, volume: 0.05 })).toHaveLength(3)
    expect(telemetryValue('drop', { ...sample, dropped: 7 })).toHaveLength(3)
    expect(telemetryValue('frame', sample)).toHaveLength(6)
  })
})

describe('telemetryRows', () => {
  it('returns one row per key, in display order', () => {
    const rows = telemetryRows(sample)
    expect(rows.map((r) => r.key)).toEqual([...TELEMETRY_KEYS])
    expect(rows[0]).toEqual({ key: 'pos', label: 'POS', value: '240, 152' })
  })
})
