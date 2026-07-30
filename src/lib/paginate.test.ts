import { describe, it, expect } from 'vitest'
import { paginate } from './paginate'

describe('paginate', () => {
  it('splits into pages', () =>
    expect(paginate([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]))
  it('single page when items fit', () =>
    expect(paginate([1, 2], 6)).toEqual([[1, 2]]))
  it('empty input → one empty page', () => expect(paginate([], 4)).toEqual([[]]))
})
