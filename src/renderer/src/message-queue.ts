import { create } from 'zustand'

export interface QueuedMessage {
  id: string
  key: string
  label: string
  run: () => Promise<void>
}
interface QueueState {
  messages: QueuedMessage[]
  paused: Record<string, boolean>
  add: (message: Omit<QueuedMessage, 'id'>) => void
  remove: (id: string) => void
  pause: (key: string, paused: boolean) => void
  clear: (key: string) => void
}
/** Session-scoped, in-memory drafts: never follow the active project. */
const generations = new Map<string, number>()
const cancellations = new Map<string, number>()
export const messageCancellationVersion = (key: string): number => cancellations.get(key) ?? 0
export const useMessageQueue = create<QueueState>((set) => ({
  messages: [],
  paused: {},
  add: (message) =>
    set((s) => ({ messages: [...s.messages, { ...message, id: crypto.randomUUID() }] })),
  remove: (id) => set((s) => ({ messages: s.messages.filter((m) => m.id !== id) })),
  pause: (key, paused) => {
    if (paused) cancellations.set(key, messageCancellationVersion(key) + 1)
    set((s) => ({ paused: { ...s.paused, [key]: paused } }))
  },
  clear: (key) =>
    set((s) => {
      generations.set(key, (generations.get(key) ?? 0) + 1)
      cancellations.set(key, messageCancellationVersion(key) + 1)
      const paused = { ...s.paused }
      delete paused[key]
      return { messages: s.messages.filter((m) => m.key !== key), paused }
    })
}))

const dispatching = new Set<string>()
export function drainMessages(
  states: Record<string, { isRunning: boolean; isolation: string }>
): void {
  const queue = useMessageQueue.getState()
  for (const message of queue.messages) {
    const state = states[message.key]
    if (
      !state ||
      state.isRunning ||
      state.isolation === 'parked' ||
      queue.paused[message.key] ||
      dispatching.has(message.key)
    )
      continue
    const generation = generations.get(message.key) ?? 0
    dispatching.add(message.key)
    queue.remove(message.id)
    void message
      .run()
      .catch(() => {
        if ((generations.get(message.key) ?? 0) !== generation) return
        useMessageQueue.setState((s) => ({
          messages: [message, ...s.messages],
          paused: { ...s.paused, [message.key]: true }
        }))
      })
      .finally(() => {
        dispatching.delete(message.key)
        // A fast provider can finish before the send acknowledgement arrives.
        useMessageQueue.setState((s) => ({ messages: [...s.messages] }))
      })
  }
}
