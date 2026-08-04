import { useCallback, useEffect, useRef, useState } from 'react'
import { animate } from 'animejs'
import { isStill, thumbSrc, posterSrc } from '../data/archive'
import { prefersReducedMotion, type PerfTier } from '../lib/perfTier'
import { loopHandoffDue } from '../lib/loopFade'

/** Seconds. The dissolve at a file change and at a loop are the same beat. */
const DISSOLVE_S = 0.9
const DISSOLVE_MS = DISSOLVE_S * 1000

/**
 * A layer is a mounted `<video>`. Two can exist at once, and only ever for the
 * length of a dissolve. The key is not the file id: a loop hands a clip over to
 * a second copy of ITSELF, so both layers can name the same file and React
 * still has to treat them as two elements.
 */
type Layer = { key: number; fileId: string }

let nextKey = 1

export default function BackgroundVideo({ tier, fileId }: { tier: PerfTier; fileId: string }) {
  const [layers, setLayers] = useState<Layer[]>(() => [{ key: nextKey++, fileId }])
  /** the layer key currently being dissolved in, so a fade is never restarted */
  const fadingKey = useRef<number | null>(null)
  // Widened to any element: the incoming layer may be an <img> when the entry is
  // a still. The dissolve only ever animates its opacity, so it does not care
  // which — but a ref typed to <video> would force a second copy of the fade.
  const incomingRef = useRef<HTMLElement | null>(null)
  /**
   * Assigns the incoming layer whatever element it is.
   *
   * A callback ref rather than the object ref directly: the incoming layer is a
   * `<video>` for a clip and an `<img>` for a still, and React types an object
   * ref to one element type. The dissolve only reads `opacity`, so widening here
   * is honest — the alternative is a second copy of the fade for images.
   */
  const attachIncoming = useCallback((el: HTMLElement | null) => { incomingRef.current = el }, [])

  const top = layers[layers.length - 1]

  // A file change: hand over to the new file. Same mechanism as the loop below,
  // which is the point — there is one transition in this component, not two.
  useEffect(() => {
    if (top.fileId === fileId) return
    if (tier === 'lite' || prefersReducedMotion()) {
      setLayers([{ key: nextKey++, fileId }])
      return
    }
    setLayers((l) => [...l.slice(-1), { key: nextKey++, fileId }])
  }, [fileId, tier, top.fileId])

  // A loop: hand the clip over to a fresh copy of itself before the tail runs
  // out, so the head and the tail are on screen together and the wrap is a
  // dissolve instead of a cut. Attached only while a single layer is on screen —
  // during a dissolve there is already an incoming layer, and `loopHandoffDue`
  // refuses to start a second one anyway.
  const settled = layers.length === 1
  const attachLoopHandoff = useCallback((el: HTMLVideoElement | null) => {
    if (!el || prefersReducedMotion()) return
    const onTime = () => {
      const due = loopHandoffDue({
        time: el.currentTime,
        duration: el.duration,
        fade: DISSOLVE_S,
        handingOver: fadingKey.current !== null,
      })
      if (!due) return
      setLayers((l) => (l.length > 1 ? l : [...l, { key: nextKey++, fileId: l[0].fileId }]))
    }
    el.addEventListener('timeupdate', onTime)
    return () => el.removeEventListener('timeupdate', onTime)
  }, [])

  // One dissolve, whatever caused it. Keyed on the incoming layer rather than a
  // boolean: a file change landing mid-dissolve replaces the incoming layer, and
  // a plain "already fading" guard would leave that replacement stuck at zero
  // opacity for the rest of its life.
  useEffect(() => {
    const incoming = layers.length > 1 ? layers[layers.length - 1] : null
    if (!incoming || !incomingRef.current || fadingKey.current === incoming.key) return
    fadingKey.current = incoming.key
    animate(incomingRef.current, {
      opacity: [0, 1],
      duration: DISSOLVE_MS,
      ease: 'linear',
      onComplete: () => {
        fadingKey.current = null
        // Collapse to the layer that just arrived — but only if it is still the
        // top one, or a file change that landed during the dissolve would be
        // thrown away.
        setLayers((l) => (l[l.length - 1].key === incoming.key ? l.slice(-1) : l))
      },
    })
  }, [layers])

  if (tier === 'lite') {
    return (
      <div className="bg-video" aria-hidden="true">
        <img src={posterSrc(fileId)} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
      </div>
    )
  }
  return (
    <div className="bg-video" aria-hidden="true">
      {layers.map((layer, i) => {
        const incoming = i === layers.length - 1 && layers.length > 1
        // A still has no clip to loop, so it is its own backdrop. It still takes
        // part in the cross dissolve — the layer stack and the fade are about
        // moving between entries, not about playback — so switching to or from a
        // photo dissolves exactly like switching between two clips.
        if (isStill(layer.fileId)) {
          return (
            <img
              key={layer.key}
              ref={incoming ? attachIncoming : undefined}
              src={posterSrc(layer.fileId)}
              alt=""
              style={{
                position: 'absolute', inset: 0, opacity: incoming ? 0 : 1,
                width: '100%', height: '100%', objectFit: 'cover',
              }}
            />
          )
        }
        return (
          <video
            key={layer.key}
            ref={incoming ? attachIncoming : settled ? attachLoopHandoff : undefined}
            src={thumbSrc(layer.fileId)}
            poster={posterSrc(layer.fileId)}
            autoPlay
            muted
            // `loop` stays as the safety net. The dissolve is what should carry
            // the wrap, but if `timeupdate` never arrives — a hidden tab, a
            // stalled decode — this keeps the backdrop moving instead of
            // freezing on a last frame.
            loop
            playsInline
            style={{ position: 'absolute', inset: 0, opacity: incoming ? 0 : 1 }}
          />
        )
      })}
    </div>
  )
}
