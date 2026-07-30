import { describe, it, expect } from 'vitest'
import { compute } from './useCardsPerPage'

describe('compute (cards per page by viewport width)', () => {
  it('desktop width → 6', () => expect(compute(1440)).toBe(6))
  it('1024 boundary → 4', () => expect(compute(1024)).toBe(4))
  it('tablet width → 4', () => expect(compute(768)).toBe(4))
  it('640 boundary → 3', () => expect(compute(640)).toBe(3))
  it('mobile width → 3', () => expect(compute(390)).toBe(3))
})
