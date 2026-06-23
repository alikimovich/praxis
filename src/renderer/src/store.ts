import { create } from 'zustand'

export interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  text: string
  /** Tool-use status lines surfaced during the turn (assistant messages). */
  statuses: string[]
}

interface ChatState {
  messages: ChatMessage[]
  isRunning: boolean
  appendUser: (text: string) => void
  startAssistant: () => string
  appendDelta: (id: string, text: string) => void
  appendStatus: (id: string, text: string) => void
  finish: () => void
}

let counter = 0
const nextId = (): string => `m${++counter}`

/**
 * Plain message store for the skeleton. This is the seam the assistant-ui
 * ExternalStoreRuntime will plug into next: `messages` feeds `convertMessage`,
 * `isRunning` drives the composer, and the append/finish actions are mutated
 * by the `agent:event` stream coming from the main process.
 */
export const useChat = create<ChatState>((set) => ({
  messages: [],
  isRunning: false,
  appendUser: (text) =>
    set((s) => ({
      messages: [...s.messages, { id: nextId(), role: 'user', text, statuses: [] }]
    })),
  startAssistant: () => {
    const id = nextId()
    set((s) => ({
      messages: [...s.messages, { id, role: 'assistant', text: '', statuses: [] }],
      isRunning: true
    }))
    return id
  },
  appendDelta: (id, text) =>
    set((s) => ({
      messages: s.messages.map((m) => (m.id === id ? { ...m, text: m.text + text } : m))
    })),
  appendStatus: (id, text) =>
    set((s) => ({
      messages: s.messages.map((m) =>
        m.id === id ? { ...m, statuses: [...m.statuses, text] } : m
      )
    })),
  finish: () => set({ isRunning: false })
}))
