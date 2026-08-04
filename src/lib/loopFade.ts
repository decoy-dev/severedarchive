/**
 * When a looping clip should hand over to a fresh copy of itself.
 *
 * A `<video loop>` wraps on a frame boundary, so the end cuts straight to the
 * start. The fix is a cross dissolve: shortly before the tail runs out, a second
 * element starts the same clip from zero and fades in over the first, which is
 * still playing its last second. Both frames are on screen together, so the
 * transition is a dissolve rather than a dip — nothing ever darkens.
 *
 * An earlier version faded the single element down and back up around the wrap.
 * It is cheaper (one decoder) and it is wrong: fading one layer with nothing
 * behind it is a fade to black, which is exactly what a loop should not do.
 * The second decoder is transient — it exists for the length of the dissolve —
 * and the backdrop already pays for one during a file change.
 *
 * Pure, and it takes the clock rather than reading one, because the interesting
 * cases are all about *when*: a clip too short to dissolve, a duration that has
 * not landed yet, a `timeupdate` that arrives after the handover has begun.
 */
export type LoopHandoff = { due: boolean }

export type LoopHandoffInput = {
  /** `video.currentTime`, seconds */
  time: number
  /** `video.duration`, seconds — may be NaN or Infinity before metadata lands */
  duration: number
  /** the dissolve length, seconds */
  fade: number
  /** true once the incoming layer exists, so the tail cannot fire twice */
  handingOver: boolean
}

/**
 * Below this a dissolve would cover most of the clip, and the two copies would
 * be visibly out of step with each other for most of its life.
 */
const MIN_CLIP_RATIO = 3

export function loopHandoffDue({ time, duration, fade, handingOver }: LoopHandoffInput): boolean {
  if (handingOver) return false
  if (!Number.isFinite(duration) || duration <= 0) return false
  if (duration < fade * MIN_CLIP_RATIO) return false
  // `time` can exceed duration by a frame at the very end; a negative remainder
  // is still the tail, not a reason to stop.
  return duration - time <= fade
}
