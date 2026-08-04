/**
 * When a looping clip should dip and when it should come back.
 *
 * A `<video loop>` wraps on a frame boundary, so the end cuts straight to the
 * start. This is the policy that softens it: fade the layer down across the
 * tail, and back up once the wrap has happened. It is a dip through the
 * backdrop rather than a true crossfade — a crossfade needs the head and the
 * tail on screen at once, which means a second decoder for the same file, and
 * the decode budget (`MAX_PLAYING`) is already the tightest resource here.
 *
 * Pure, and it takes the clock rather than reading one, because the interesting
 * cases are all about *when* — a clip too short to fade, a wrap seen a frame
 * late, a `timeupdate` that lands mid-fade and must not restart it.
 */
export type LoopFadePhase = 'in' | 'out'

export type LoopFadeAction =
  | { kind: 'none' }
  | { kind: 'fade'; to: LoopFadePhase; ms: number }

export type LoopFadeInput = {
  /** `video.currentTime`, seconds */
  time: number
  /** the previous `time` this ran with */
  last: number
  /** `video.duration`, seconds — may be NaN or Infinity before metadata lands */
  duration: number
  /** the fade length, seconds */
  fade: number
  /** what the layer is already doing, so a fade is not restarted every tick */
  phase: LoopFadePhase
}

/**
 * A wrap has to be inferred: `loop` fires no event of its own, and `seeked`
 * does not fire for the implicit wrap in every engine. Time going backwards by
 * more than a tick is the signal, and 0.1s is comfortably longer than a frame
 * at any rate in the archive and far shorter than any real seek backwards.
 */
const WRAP_EPSILON = 0.1

/** Below this a fade would eat the clip, so the cut stays. */
const MIN_CLIP_RATIO = 3

export function loopFadeAction({ time, last, duration, fade, phase }: LoopFadeInput): LoopFadeAction {
  if (!Number.isFinite(duration) || duration <= 0) return { kind: 'none' }
  if (duration < fade * MIN_CLIP_RATIO) return { kind: 'none' }

  // Wrapped: come back up. Checked before the tail test, because the first tick
  // after a wrap is also within `fade` of the *new* start, not the end.
  if (time < last - WRAP_EPSILON) {
    return phase === 'in' ? { kind: 'none' } : { kind: 'fade', to: 'in', ms: fade * 1000 }
  }

  const remaining = duration - time
  if (remaining <= fade) {
    // Already dipping — let it finish. Restarting on every `timeupdate` would
    // reset the fade to full opacity four times a second and never darken.
    if (phase === 'out') return { kind: 'none' }
    // Match the fade to the time actually left, or the wrap lands mid-dip and
    // the cut is still visible. The floor keeps a very late tick from being an
    // instant blackout.
    return { kind: 'fade', to: 'out', ms: Math.max(80, remaining * 1000) }
  }

  return { kind: 'none' }
}
