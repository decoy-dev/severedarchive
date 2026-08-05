/** `play()` returns a promise on a real HTMLVideoElement; the fakes return void. */
export type Playable = { play(): void | Promise<void>; pause(): void; readonly paused: boolean }

export class VideoDirector {
  private order: string[] = []
  private els = new Map<string, Playable>()
  private focus: string | null = null
  private background: string[] | null = null
  private maxPlaying: number

  constructor(maxPlaying = 4) {
    this.maxPlaying = maxPlaying
  }

  /**
   * Change how many may play at once, mid-session.
   *
   * The cap exists to bound decode work, and how much work is affordable is not
   * constant: with a window filling the browser window, the other two windows and
   * the explorer preview are behind an opaque picture and a blurred scrim, and
   * every frame they decode is spent on pixels nobody can see.
   *
   * Lowering the cap PAUSES the surplus — it does not release it. That distinction
   * is the whole reason this is the right lever: a released file drops its `src`
   * and its playhead (see `releaseFile`), so coming back means a black body and a
   * restart from zero, while a paused one holds its frame and resumes where it
   * was. Nothing about the layout or the placement changes.
   */
  setMaxPlaying(maxPlaying: number) {
    const next = Math.max(1, Math.floor(maxPlaying))
    if (next === this.maxPlaying) return
    this.maxPlaying = next
    this.apply()
  }

  register(id: string, el: Playable) {
    if (!this.els.has(id)) this.order.push(id)
    this.els.set(id, el)
    this.apply()
  }
  unregister(id: string) {
    const el = this.els.get(id)
    if (el && !el.paused) el.pause()
    this.els.delete(id)
    this.order = this.order.filter((x) => x !== id)
    // Deliberately do not clear `this.focus` here even if it equals `id`: FileCard
    // re-registers (unregister immediately followed by register of the same id)
    // whenever `focused` changes, including the moment a card *becomes* focused —
    // clearing focus here would erase the focus that was just set. apply() already
    // guards a dangling focus reference via `this.els.has(this.focus)`, so a
    // focus id with no matching element is always safely a no-op.
    this.apply()
  }
  setFocus(id: string | null) {
    this.focus = id
    this.apply()
  }
  /**
   * The ranked list of ids that should play *behind* the focus — unfocused
   * windows and the explorer preview, in the order they should survive the cap.
   * `null` means "no policy stated", and the director falls back to registration
   * order; that is what the unit tests exercise and what a surface that never
   * calls this gets. `mediaController.reconcile` states it on every pass.
   */
  setBackground(ids: readonly string[] | null) {
    this.background = ids ? [...ids] : null
    this.apply()
  }
  playingIds(): string[] {
    return this.order.filter((id) => {
      const el = this.els.get(id)
      return !!el && !el.paused
    })
  }
  private apply() {
    const desired = new Set<string>()
    if (this.focus && this.els.has(this.focus)) desired.add(this.focus)
    for (const id of this.background ?? this.order) {
      if (desired.size >= this.maxPlaying) break
      if (!this.els.has(id)) continue
      desired.add(id)
    }
    // Judge against the element's actual paused state, not a shadow "is playing"
    // ledger — a src swap (thumb <-> full) resets the element to paused underneath
    // us, and a stale ledger would never notice and never reissue play().
    for (const [id, el] of this.els) {
      const should = desired.has(id)
      if (should && el.paused) {
        // A real element rejects play() when it is not allowed to start yet
        // (no data, autoplay policy). That is an ordinary outcome here, not an
        // error: the loadeddata resync re-issues it.
        const p = el.play()
        if (p && typeof p.catch === 'function') p.catch(() => {})
      } else if (!should && !el.paused) el.pause()
    }
  }
}
