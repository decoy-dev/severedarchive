import { useEffect, useState } from 'react'

export function compute(w: number): number {
  if (w <= 640) return 3
  if (w <= 1024) return 4
  return 6
}

export function useCardsPerPage(): number {
  const [n, setN] = useState(() => compute(window.innerWidth))
  useEffect(() => {
    const on = () => setN(compute(window.innerWidth))
    window.addEventListener('resize', on)
    return () => window.removeEventListener('resize', on)
  }, [])
  return n
}
