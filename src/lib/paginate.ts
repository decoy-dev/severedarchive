export function paginate<T>(items: T[], perPage: number): T[][] {
  if (items.length === 0) return [[]]
  const pages: T[][] = []
  for (let i = 0; i < items.length; i += perPage) pages.push(items.slice(i, i + perPage))
  return pages
}
