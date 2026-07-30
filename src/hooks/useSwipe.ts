import { useRef } from 'react'
import type { PointerEvent } from 'react'

export function useSwipe(onLeft: () => void, onRight: () => void, threshold = 48) {
  const start = useRef<{ x: number; y: number } | null>(null)
  return {
    onPointerDown: (e: PointerEvent) => {
      if (e.pointerType === 'mouse') return
      start.current = { x: e.clientX, y: e.clientY }
    },
    onPointerUp: (e: PointerEvent) => {
      if (!start.current) return
      const dx = e.clientX - start.current.x
      const dy = e.clientY - start.current.y
      start.current = null
      if (Math.abs(dx) > threshold && Math.abs(dx) > Math.abs(dy)) (dx < 0 ? onLeft : onRight)()
    },
  }
}
