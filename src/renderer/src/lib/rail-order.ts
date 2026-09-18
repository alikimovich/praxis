/** Presentation-only ordering: never reorder provider sessionKeys or recency. */
export function orderedIds(ids: string[], saved: unknown, newFirst = false): string[] {
  const current = [...new Set(ids)]
  if (!Array.isArray(saved)) return current
  const available = new Set(current)
  const ranked = [...new Set(saved.filter((id): id is string => typeof id === 'string'))].filter(
    (id) => available.has(id)
  )
  const known = new Set(ranked)
  const added = current.filter((id) => !known.has(id))
  return newFirst ? [...added, ...ranked] : [...ranked, ...added]
}

export function moveId(ids: string[], source: string, target: string, after: boolean): string[] {
  if (source === target || !ids.includes(source) || !ids.includes(target)) return ids
  const next = ids.filter((id) => id !== source)
  next.splice(next.indexOf(target) + Number(after), 0, source)
  return next
}

export const railGroup = (kind: 'projects' | 'live' | 'history', project = ''): string =>
  JSON.stringify([kind, project])

export function orderedItems<T>(
  items: T[],
  key: (item: T) => string,
  saved: unknown,
  newFirst = false
): T[] {
  const rank = new Map(orderedIds(items.map(key), saved, newFirst).map((id, i) => [id, i]))
  return [...items].sort((a, b) => (rank.get(key(a)) ?? 0) - (rank.get(key(b)) ?? 0))
}
