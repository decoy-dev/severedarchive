export type StackPos = { depth: number; sliverX: number; scale: number; z: number }

export function stackLayout(count: number, frontIndex: number, sliverW: number): StackPos[] {
  const out: StackPos[] = []
  for (let i = 0; i < count; i++) {
    const depth = (i - frontIndex + count) % count
    out.push({
      depth,
      sliverX: depth === 0 ? 0 : (depth - 1) * sliverW,
      scale: depth === 0 ? 1 : Math.max(0.9, 1 - 0.02 * depth),
      z: count - depth,
    })
  }
  return out
}
