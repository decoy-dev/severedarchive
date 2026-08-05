import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
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

export default function BackgroundVideo({
  tier, fileId, hold = false,
}: {
  tier: PerfTier
  fileId: string
  /**
   * Stop advancing, keeping the frame that is on screen.
   *
   * Set when the backdrop cannot meaningfully be seen: a full desktop of windows,
   * or one window filling the browser window. It is the largest surface on the
   * page and the only one that is always moving, so every one of its frames is
   * also a re-blur of `.glass-frame` and of the terminal — two backdrop-filter
   * surfaces at nearly viewport size that only have work to do because the pixels
   * beneath them changed. Holding it makes those static as well, which is worth
   * more than the decode it saves.
   *
   * A pause, NOT the lite-tier poster swap: swapping the element would drop the
   * decode and restart the clip from zero when it came back, and the wrap-around
   * is a cross dissolve that would be visible restarting. This freezes and thaws.
   */
  hold?: boolean
}) {
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
  /**
   * Asked by the settled layer, on its own `timeupdate`, whether it is time to
   * hand over.
   *
   * A callback the layer calls rather than a ref this component attaches: the
   * element belongs to the layer, and the binding rule in `mediaLookup.test.ts`
   * exists so that no component goes looking for a `<video>` by shape. Reaching
   * into the subtree with `querySelectorAll('video')` to pause the backdrop was
   * exactly that, and it is what forced this split.
   */
  const onLoopTick = useCallback((el: HTMLVideoElement) => {
    const due = loopHandoffDue({
      time: el.currentTime,
      duration: el.duration,
      fade: DISSOLVE_S,
      handingOver: fadingKey.current !== null,
    })
    if (!due) return
    setLayers((l) => (l.length > 1 ? l : [...l, { key: nextKey++, fileId: l[0].fileId }]))
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
    <div className="bg-video" aria-hidden="true" data-holding={hold ? 'true' : undefined}>
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
          <BackdropLayer
            key={layer.key}
            fileId={layer.fileId}
            incoming={incoming}
            settled={settled}
            hold={hold}
            reportIncoming={attachIncoming}
            onLoopTick={onLoopTick}
          />
        )
      })}
    </div>
  )
}

/**
 * One backdrop layer, which owns its own `<video>`.
 *
 * Split out for the ownership rule: a component may not find a media element by
 * DOM shape (`mediaLookup.test.ts`), and freezing the backdrop needs a handle on
 * the element. Here the element is this component's own ref, so holding it, wiring
 * its loop tick and reporting it up for the dissolve all happen without anything
 * searching the tree.
 *
 * These `<video>`s are React's, not mediaController's — the backdrop is
 * deliberately unregistered, because nothing about it survives a reparent or needs
 * to. That is why an ordinary ref is legitimate here and would not be in a window.
 */
function BackdropLayer({
  fileId, incoming, settled, hold, reportIncoming, onLoopTick,
}: {
  fileId: string
  /** the layer being dissolved in; its opacity is animated by the parent */
  incoming: boolean
  /** the only layer on screen, i.e. the one that owns the loop handover */
  settled: boolean
  hold: boolean
  reportIncoming: (el: HTMLElement | null) => void
  onLoopTick: (el: HTMLVideoElement) => void
}) {
  const ref = useRef<HTMLVideoElement | null>(null)

  /**
   * Freeze and thaw.
   *
   * Re-asserted on the element's OWN events, not just when `hold` changes. A pause
   * issued from this effect at mount lands before the element has data, and
   * `autoPlay` then starts it anyway when the first frames arrive — measured: a
   * layer mounting into a held backdrop kept playing and advanced 1.25s over a
   * second, with `data-holding` set the whole time. Nothing re-ran to catch it,
   * because `hold` had not changed since.
   *
   * So the rule is enforced whenever the element starts, which is the same
   * judgement `VideoDirector.apply` makes for the windows: trust the element's
   * actual paused state and re-issue, rather than assuming an earlier call stuck.
   * A held video emits no `timeupdate`, so the loop handover stops with it.
   */
  useEffect(() => {
    const v = ref.current
    if (!v) return
    const enforce = () => {
      if (hold) { if (!v.paused) v.pause(); return }
      if (v.paused) { const p = v.play(); if (p) p.catch(() => {}) }
    }
    enforce()
    v.addEventListener('play', enforce)
    v.addEventListener('loadeddata', enforce)
    return () => {
      v.removeEventListener('play', enforce)
      v.removeEventListener('loadeddata', enforce)
    }
  }, [hold])

  // Reported up in a LAYOUT effect: the parent starts the dissolve in an ordinary
  // effect on the same commit, and a child's layout effect runs before it. A plain
  // effect here would be a race the fade loses on its first frame.
  useLayoutEffect(() => {
    if (incoming) reportIncoming(ref.current)
  }, [incoming, reportIncoming])

  useEffect(() => {
    const v = ref.current
    if (!v || !settled || prefersReducedMotion()) return
    const onTime = () => onLoopTick(v)
    v.addEventListener('timeupdate', onTime)
    return () => v.removeEventListener('timeupdate', onTime)
  }, [settled, onLoopTick])

  return (
    <video
      ref={ref}
      src={thumbSrc(fileId)}
      poster={posterSrc(fileId)}
      autoPlay
      muted
      // `loop` stays as the safety net. The dissolve is what should carry the
      // wrap, but if `timeupdate` never arrives — a hidden tab, a stalled decode —
      // this keeps the backdrop moving instead of freezing on a last frame.
      loop
      playsInline
      style={{ position: 'absolute', inset: 0, opacity: incoming ? 0 : 1 }}
    />
  )
}
