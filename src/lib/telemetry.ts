/**
 * The dashboard's live readout, as formatting over a sample.
 *
 * The sampling itself is a DOM read (a window's rect, its `<video>`'s clock and
 * playback quality) and lives in the component; everything about *what a number
 * means* is here, so the shape of the readout is testable without a browser.
 *
 * Every field is something that actually moves. Static facts about a file — its
 * frame size, its year — belong on the card too, but not here: this is the part
 * that is re-read every frame, and a value that never changes would be a write
 * per frame for nothing.
 */
export type WindowSample = {
  /** live rect, so it tracks a drag rather than the last committed position */
  x: number
  y: number
  w: number
  h: number
  /** `video.currentTime` / `video.duration`, seconds */
  time: number
  duration: number
  /** `getVideoPlaybackQuality()`, where the engine has it */
  frames: number | null
  dropped: number | null
  /** end of the first buffered range, seconds */
  buffered: number
  /** `video.readyState`, 0–4 */
  readyState: number
  volume: number
  muted: boolean
  source: 'full' | 'thumb' | 'none'
}

export type TelemetryRow = { key: string; label: string; value: string }

/** The keys, in display order. The component renders one cell per key. */
export const TELEMETRY_KEYS = [
  'pos', 'size', 'time', 'frame', 'drop', 'buf', 'ready', 'src', 'vol', 'audio',
] as const

export type TelemetryKey = (typeof TELEMETRY_KEYS)[number]

export const TELEMETRY_LABELS: Record<TelemetryKey, string> = {
  pos: 'POS', size: 'SIZE', time: 'TIME', frame: 'FRAMES', drop: 'DROP',
  buf: 'BUF', ready: 'RDY', src: 'SRC', vol: 'VOL', audio: 'AUDIO',
}

/** `readyState` as the four-letter states, because "4" tells nobody anything. */
const READY_STATES = ['NONE', 'META', 'CURR', 'NEXT', 'FULL']

const pad = (n: number, width: number) => String(n).padStart(width, '0')

/** mm:ss.cc — centiseconds, so the field visibly ticks without being a blur. */
export function clock(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '--:--.--'
  const whole = Math.floor(seconds)
  const cs = Math.floor((seconds - whole) * 100)
  return `${pad(Math.floor(whole / 60), 2)}:${pad(whole % 60, 2)}.${pad(cs, 2)}`
}

/**
 * Frames presented since the element started — an odometer, climbing across
 * every loop, which is exactly what `getVideoPlaybackQuality` reports.
 *
 * It is deliberately NOT converted into a position-in-clip frame index. That
 * needs a frame rate, and the only rate available here is `frames / time`,
 * which is right on the first pass and wrong on every one after it: the clip
 * loops, `time` resets to zero, `frames` does not, and the derived rate climbs
 * without bound. Real fps would have to come from the build-time probe
 * (`gen:media-meta`) — until it does, TIME is the honest position field and
 * this is the honest count. Engines without the quality API get dashes rather
 * than a guess.
 */
export function frameCount(frames: number | null): string {
  if (frames === null || !Number.isFinite(frames) || frames < 0) return '------'
  return pad(Math.floor(frames), 6).slice(-6)
}

export function telemetryValue(key: TelemetryKey, s: WindowSample): string {
  switch (key) {
    case 'pos':
      return `${Math.round(s.x)}, ${Math.round(s.y)}`
    case 'size':
      return `${Math.round(s.w)}×${Math.round(s.h)}`
    case 'time':
      return `${clock(s.time)} / ${clock(s.duration)}`
    case 'frame':
      return frameCount(s.frames)
    case 'drop':
      return s.dropped === null ? '---' : pad(s.dropped, 3)
    case 'buf': {
      if (!Number.isFinite(s.duration) || s.duration <= 0) return '---%'
      const pct = Math.max(0, Math.min(100, Math.round((s.buffered / s.duration) * 100)))
      return `${pad(pct, 3)}%`
    }
    case 'ready':
      return READY_STATES[s.readyState] ?? 'NONE'
    case 'src':
      return s.source === 'none' ? '----' : `_${s.source}`
    case 'vol':
      return pad(Math.round(s.volume * 100), 3)
    case 'audio':
      return s.muted || s.volume === 0 ? 'MUTED' : 'LIVE'
  }
}

export function telemetryRows(s: WindowSample): TelemetryRow[] {
  return TELEMETRY_KEYS.map((key) => ({
    key,
    label: TELEMETRY_LABELS[key],
    value: telemetryValue(key, s),
  }))
}
