// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest'
import { useSwipe } from './useSwipe'
import { renderHook } from '@testing-library/react'

const ev = (type: 'touch' | 'mouse', x: number, y: number) =>
  ({ pointerType: type, clientX: x, clientY: y }) as unknown as React.PointerEvent

describe('useSwipe', () => {
  it('fires onLeft for a leftward swipe past threshold', () => {
    const left = vi.fn(), right = vi.fn()
    const { result } = renderHook(() => useSwipe(left, right, 48))
    result.current.onPointerDown(ev('touch', 200, 100))
    result.current.onPointerUp(ev('touch', 100, 110))
    expect(left).toHaveBeenCalledOnce()
    expect(right).not.toHaveBeenCalled()
  })
  it('fires onRight for a rightward swipe', () => {
    const left = vi.fn(), right = vi.fn()
    const { result } = renderHook(() => useSwipe(left, right, 48))
    result.current.onPointerDown(ev('touch', 100, 100))
    result.current.onPointerUp(ev('touch', 220, 100))
    expect(right).toHaveBeenCalledOnce()
  })
  it('ignores sub-threshold moves, vertical drags, and mouse pointers', () => {
    const left = vi.fn(), right = vi.fn()
    const { result } = renderHook(() => useSwipe(left, right, 48))
    result.current.onPointerDown(ev('touch', 100, 100))
    result.current.onPointerUp(ev('touch', 130, 100))            // below threshold
    result.current.onPointerDown(ev('touch', 100, 100))
    result.current.onPointerUp(ev('touch', 40, 300))             // vertical dominates
    result.current.onPointerDown(ev('mouse', 200, 100))
    result.current.onPointerUp(ev('mouse', 100, 100))            // mouse ignored
    expect(left).not.toHaveBeenCalled()
    expect(right).not.toHaveBeenCalled()
  })
})
