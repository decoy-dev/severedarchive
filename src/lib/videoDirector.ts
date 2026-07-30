export type Playable = { play(): void; pause(): void; readonly paused: boolean }

export class VideoDirector {
  private order: string[] = []
  private els = new Map<string, Playable>()
  private focus: string | null = null
  private maxPlaying: number

  constructor(maxPlaying = 4) {
    this.maxPlaying = maxPlaying
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
  playingIds(): string[] {
    return this.order.filter((id) => {
      const el = this.els.get(id)
      return !!el && !el.paused
    })
  }
  private apply() {
    const desired = new Set<string>()
    if (this.focus && this.els.has(this.focus)) desired.add(this.focus)
    for (const id of this.order) {
      if (desired.size >= this.maxPlaying) break
      desired.add(id)
    }
    // Judge against the element's actual paused state, not a shadow "is playing"
    // ledger — a src swap (thumb <-> full) resets the element to paused underneath
    // us, and a stale ledger would never notice and never reissue play().
    for (const [id, el] of this.els) {
      const should = desired.has(id)
      if (should && el.paused) el.play()
      else if (!should && !el.paused) el.pause()
    }
  }
}
