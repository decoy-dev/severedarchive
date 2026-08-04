import { useEffect, useRef, useState } from 'react'
import { animate, stagger } from 'animejs'
import { aspectRatio, fileById, formatDuration, formatResolution } from '../data/archive'
import { prefersReducedMotion } from '../lib/perfTier'
import {
  TELEMETRY_KEYS, TELEMETRY_LABELS, telemetryValue, type WindowSample,
} from '../lib/telemetry'
import { MAX_WINDOWS } from '../lib/windowManager'
import InfoPopover from './InfoPopover'
import MediaKindIcon from './MediaKindIcon'
import { useMediaController } from './MediaLayer'
import type { OpenWindowInfo } from '../lib/windowRegistry'

/** The panel brings itself up the first time it is ever needed. ~2.4s. */
const INIT_LINES = [
  '> WINDOW MANAGER ONLINE',
  '> ALLOCATING BUFFER ............ OK',
  '> BINDING MEDIA NODES .......... OK',
  '> READING WINDOW TELEMETRY ..... OK',
  '> DASHBOARD READY',
]
const INIT_STEP_MS = 420
/** The beat between the last line and the cards, so READY is legible as a state. */
const INIT_SETTLE_MS = 320

/**
 * And the way back down, when the last window closes. Shorter than the
 * bring-up on purpose: this one runs after the user has already got what they
 * asked for, so it is a thing to watch rather than a thing to wait through.
 */
const DOWN_LINES = [
  '> RELEASING MEDIA NODES ..... OK',
  '> FLUSHING BUFFER ........... OK',
  '> DASHBOARD OFFLINE',
]
const DOWN_STEP_MS = 300
const DOWN_SETTLE_MS = 320

/**
 * Module scope on purpose: "the first time" means the first time this page load,
 * and this component unmounts every time the last window closes and again on
 * every trip to ABOUT. A `useState` here would replay the sequence on each of
 * those, which is the opposite of what it is for.
 */
let hasInitialized = false

/** `SLOT`/`VOL`-style label plus value, the unit the card is built from. */
function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="dash-stat">
      <span className="dash-stat-label tw-dim">{label}</span>
      <span className="dash-stat-value">{value}</span>
    </div>
  )
}

/**
 * What the explorer's box becomes once anything is open: a readout of the
 * windows on the desktop, filling the box, replacing the standby prompt.
 *
 * It is a readout, not a second window manager. Raising and closing are the
 * only verbs, and both delegate to the same `focusWindow`/`close` that the
 * window chrome itself calls — this surface holds no window state of its own.
 * Like the rest of the explorer it renders NO media: the cards are text, and the
 * window bodies remain the only place a file decodes.
 *
 * The cards divide the box between them, so one window gets a tall card and
 * three get a third each. Everything on a card is a fact about the WINDOW or
 * about the file in it — nothing is padding, because the point of filling the
 * box was to say more, not to look full.
 */
export default function WindowDashboard({
  windows,
  onFocus,
  onClose,
  windowNode,
  onShutdownComplete,
}: {
  windows: readonly OpenWindowInfo[]
  onFocus: (id: string) => void
  onClose: (id: string) => void
  /** Read-only accessor for a window's node — see `WindowView.node`. */
  windowNode: (id: string) => HTMLElement | null
  /**
   * Fired when the shut-down sequence has finished and the box should go back
   * to the standby prompt. The explorer keeps this component mounted with an
   * empty window list until then — otherwise the panel would vanish on the same
   * frame as the last window and there would be nothing left to power down.
   */
  onShutdownComplete: () => void
}) {
  const media = useMediaController()
  // Reduced motion skips the sequence rather than shortening it: the whole
  // content of the beat is motion, and the readout underneath is the point.
  const [phase, setPhase] = useState<'init' | 'ready' | 'down'>(
    () => (hasInitialized || prefersReducedMotion() ? 'ready' : 'init'),
  )
  const [revealed, setRevealed] = useState(0)
  const listRef = useRef<HTMLUListElement | null>(null)
  /** `${windowId}:${telemetryKey}` → the span that shows it. */
  const cells = useRef(new Map<string, HTMLElement>())
  const lastWritten = useRef(new Map<string, string>())

  // The live half of the readout, driven straight to the DOM.
  //
  // Not React state: this samples every animation frame, and re-rendering three
  // cards 60 times a second to move a clock would cost far more than the app
  // has to spare next to five video decodes. The cards themselves are React's;
  // only the text inside these spans is written here.
  //
  // Reads are batched before writes. Interleaving `getBoundingClientRect` with
  // `textContent` forces a layout per card per frame, which is exactly the
  // thrash this readout would otherwise be famous for.
  const ids = windows.map((w) => w.id).join(',')
  useEffect(() => {
    if (phase !== 'ready' || !windows.length || !media) return
    let raf = 0
    const tick = () => {
      const samples: Array<[string, WindowSample]> = []
      for (const id of ids.split(',')) {
        // Both lookups are by fileId through the owner — the window's node from
        // Desktop, the element from the controller. Nothing here finds media by
        // DOM shape; `mediaLookup.test.ts` is the rule this obeys.
        const root = windowNode(id)
        if (!root) continue
        const rect = root.getBoundingClientRect()
        const v = media.videoFor(id)
        const quality = v?.getVideoPlaybackQuality?.()
        samples.push([id, {
          x: rect.x, y: rect.y, w: rect.width, h: rect.height,
          time: v?.currentTime ?? 0,
          duration: v?.duration ?? NaN,
          frames: quality ? quality.totalVideoFrames : null,
          dropped: quality ? quality.droppedVideoFrames : null,
          buffered: v && v.buffered.length ? v.buffered.end(v.buffered.length - 1) : 0,
          readyState: v?.readyState ?? 0,
          volume: v?.volume ?? 0,
          muted: v?.muted ?? true,
          source: !v?.src ? 'none' : v.src.includes('_full') ? 'full' : 'thumb',
        }])
      }
      for (const [id, sample] of samples) {
        for (const key of TELEMETRY_KEYS) {
          const cell = cells.current.get(`${id}:${key}`)
          if (!cell) continue
          const next = telemetryValue(key, sample)
          // Writing an identical string still dirties the node, so the compare
          // is what keeps a still desktop at zero layout work per frame.
          if (lastWritten.current.get(`${id}:${key}`) === next) continue
          lastWritten.current.set(`${id}:${key}`, next)
          cell.textContent = next
        }
      }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => { cancelAnimationFrame(raf); lastWritten.current.clear() }
  }, [phase, ids, windows.length, media, windowNode])

  // Down when the last window goes, and back up if one is opened again while
  // the sequence is still running — a reopen is a cancel, not a queue.
  const empty = windows.length === 0
  useEffect(() => {
    if (empty && phase === 'ready') setPhase('down')
    else if (!empty && phase === 'down') setPhase('ready')
  }, [empty, phase])

  useEffect(() => {
    if (phase !== 'down') return
    if (prefersReducedMotion()) { onShutdownComplete(); return }
    let settle: number | undefined
    let step = 0
    setRevealed(0)
    const tick = window.setInterval(() => {
      step += 1
      setRevealed(step)
      if (step >= DOWN_LINES.length) {
        window.clearInterval(tick)
        settle = window.setTimeout(onShutdownComplete, DOWN_SETTLE_MS)
      }
    }, DOWN_STEP_MS)
    return () => { window.clearInterval(tick); window.clearTimeout(settle) }
  }, [phase, onShutdownComplete])

  useEffect(() => {
    if (phase === 'down') return
    if (phase === 'ready') { hasInitialized = true; return }
    let settle: number | undefined
    let step = 0
    const tick = window.setInterval(() => {
      step += 1
      setRevealed(step)
      if (step >= INIT_LINES.length) {
        window.clearInterval(tick)
        settle = window.setTimeout(() => setPhase('ready'), INIT_SETTLE_MS)
      }
    }, INIT_STEP_MS)
    // Both timers, because the window can be closed mid-sequence — that unmounts
    // this panel with a pending `setPhase` that would land on nothing.
    return () => { window.clearInterval(tick); window.clearTimeout(settle) }
  }, [phase])

  // The cards arriving is the last beat of the sequence, not a separate effect:
  // it only runs on the transition into `ready`, so windows opened later just
  // appear rather than replaying an intro every time.
  const introRef = useRef(false)
  useEffect(() => {
    if (phase !== 'ready' || introRef.current || !listRef.current) return
    introRef.current = true
    if (hasInitialized && prefersReducedMotion()) return
    const cards = listRef.current.querySelectorAll('.dash-row')
    if (!cards.length) return
    animate(cards, {
      opacity: [0, 1],
      translateY: [10, 0],
      duration: 320,
      delay: stagger(90),
      ease: 'outQuad',
    })
  }, [phase])

  if (phase === 'init' || phase === 'down') {
    const down = phase === 'down'
    const lines = down ? DOWN_LINES : INIT_LINES
    return (
      <div className="window-dash is-init" data-window-dash data-dash-phase={phase}>
        <p className="dash-head">
          &gt; {down ? 'CLOSING WINDOW DASHBOARD' : 'INITIALIZING WINDOW DASHBOARD'}
        </p>
        <div className="dash-boot" role="status" aria-live="polite">
          {lines.slice(0, revealed).map((line, i) => (
            <div key={line} className="dash-boot-line">
              {line}
              {i === revealed - 1 && <span className="standby-caret" aria-hidden="true" />}
            </div>
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="window-dash" data-window-dash data-dash-phase="ready">
      <p className="dash-head">
        &gt; BUFFER {windows.length} / {MAX_WINDOWS} ACTIVE.
        <span className="tw-dim"> SELECT A CARD TO RAISE. ESC CLOSES THE TOP WINDOW.</span>
      </p>

      <ul className="dash-list" ref={listRef}>
        {windows.map((w) => {
          const file = fileById(w.id)
          if (!file) return null
          return (
            <li key={w.id} className={w.focused ? 'dash-row is-focused' : 'dash-row'} data-dash-row={w.id}>
              {/* Both controls lead the card rather than trailing it, and that
                  is geometry rather than style: the cascade starts at x 240 and
                  this box starts at x 104, so the card's left edge is the one
                  column that is never under a window. A trailing ✕ sat at
                  x ~985, inside every window's span, and could not be clicked
                  for the two cards that most need it.
                  
                  They are siblings of the card, never children: the card is
                  itself a button, and a button inside a button is invalid
                  markup that React reports at runtime. */}
              <span className="dash-controls">
                <button
                  className="dash-close"
                  onClick={() => onClose(w.id)}
                  aria-label={`Close ${file.name}.${file.ext}`}
                >
                  ✕
                </button>
                <InfoPopover file={file} align="start" />
              </span>
              <button
                className="dash-row-main"
                onClick={() => onFocus(w.id)}
                aria-label={`Raise ${file.name}.${file.ext}`}
              >
                <span className="dash-row-top">
                  <span className="dash-rank">{w.focused ? 'TOP' : `${w.z + 1}`}</span>
                  <span className="dash-row-kind"><MediaKindIcon kind={file.kind} /></span>
                  <span className="dash-name">
                    {file.name}<span className="tw-dim">.{file.ext}</span>
                  </span>
                  <span className="dash-tagline tw-dim">{file.tagline.toUpperCase()}</span>
                </span>

                {/* Two grids, split by how often they change. The first is the
                    file and its slot — read once per render. The second is
                    telemetry, re-read every animation frame and written
                    straight to the DOM (see the ticker above): position tracks
                    a drag as it happens, the clock and the frame odometer tick,
                    buffering and ready state move as the media does. */}
                <span className="dash-grid">
                  <Stat label="SLOT" value={String(w.slot + 1)} />
                  <Stat label="Z" value={String(w.z + 1)} />
                  <Stat label="RUN" value={formatDuration(file.durationSec)} />
                  <Stat label="FRAME" value={formatResolution(file)} />
                  <Stat label="RATIO" value={aspectRatio(file).toFixed(2)} />
                  <Stat label="YEAR" value={file.year} />
                </span>
                <span className="dash-grid is-live">
                  {TELEMETRY_KEYS.map((key) => (
                    <span className="dash-stat" key={key}>
                      <span className="dash-stat-label tw-dim">{TELEMETRY_LABELS[key]}</span>
                      <span
                        className="dash-stat-value"
                        ref={(el) => {
                          const mapKey = `${w.id}:${key}`
                          if (el) cells.current.set(mapKey, el)
                          else cells.current.delete(mapKey)
                        }}
                      >
                        {'—'}
                      </span>
                    </span>
                  ))}
                </span>
              </button>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
