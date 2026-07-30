export type Playable = { play(): void; pause(): void }

export class VideoDirector {
  private order: string[] = []
  private els = new Map<string, Playable>()
  private focus: string | null = null
  private playing = new Set<string>()
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
    this.els.delete(id)
    this.order = this.order.filter((x) => x !== id)
    this.playing.delete(id)
    if (this.focus === id) this.focus = null
    this.apply()
  }
  setFocus(id: string | null) {
    this.focus = id
    this.apply()
  }
  playingIds(): string[] {
    return this.order.filter((id) => this.playing.has(id))
  }
  private apply() {
    const desired = new Set<string>()
    if (this.focus && this.els.has(this.focus)) desired.add(this.focus)
    for (const id of this.order) {
      if (desired.size >= this.maxPlaying) break
      desired.add(id)
    }
    for (const [id, el] of this.els) {
      const should = desired.has(id)
      const is = this.playing.has(id)
      if (should && !is) { el.play(); this.playing.add(id) }
      if (!should && is) { el.pause(); this.playing.delete(id) }
      if (!should && !is) el.pause()
    }
  }
}
