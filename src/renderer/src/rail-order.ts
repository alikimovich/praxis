import { create } from 'zustand'
import { moveId, orderedIds } from './lib/rail-order'

const KEY = 'praxis.rail-order.v1'
type Orders = Record<string, string[]>
function read(): Orders {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(KEY) ?? '{}')
    if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
    return Object.fromEntries(
      Object.entries(value)
        .filter(
          ([group, ids]) =>
            group.length < 2048 && Array.isArray(ids) && ids.every((id) => typeof id === 'string')
        )
        .slice(0, 1000)
        .map(([group, ids]) => [group, [...new Set(ids as string[])].slice(0, 5000)])
    )
  } catch {
    return {}
  }
}

export const useRailOrder = create<{
  orders: Orders
  move: (
    group: string,
    current: string[],
    source: string,
    target: string,
    after: boolean,
    newFirst?: boolean
  ) => void
}>((set) => ({
  orders: read(),
  move: (group, current, source, target, after, newFirst = false) =>
    set((state) => {
      const ids = orderedIds(current, state.orders[group], newFirst)
      const next = moveId(ids, source, target, after)
      if (next === ids || next.every((id, i) => id === ids[i])) return state
      const orders = { ...state.orders, [group]: next }
      try {
        localStorage.setItem(KEY, JSON.stringify(orders))
      } catch {
        /* keep session order */
      }
      return { orders }
    })
}))
