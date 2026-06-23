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

// Sentinel values mean "use the account/model default" (omit from SDK options).
export const DEFAULT_MODEL = 'default'
export const DEFAULT_EFFORT = 'auto'

interface SessionState {
  model: string
  effort: string
  slashCommands: string[]
  setModel: (model: string) => void
  setEffort: (effort: string) => void
  setSlashCommands: (commands: string[]) => void
}

export const useSession = create<SessionState>((set) => ({
  model: DEFAULT_MODEL,
  effort: DEFAULT_EFFORT,
  slashCommands: [],
  setModel: (model) => set({ model }),
  setEffort: (effort) => set({ effort }),
  setSlashCommands: (slashCommands) => set({ slashCommands })
}))

/** Convert the UI sentinels into AgentOptions the SDK understands. */
export const toAgentOptions = (s: { model: string; effort: string }): {
  model?: string
  effort?: string
} => ({
  model: s.model === DEFAULT_MODEL ? undefined : s.model,
  effort: s.effort === DEFAULT_EFFORT ? undefined : s.effort
})

// Exposed for the Playwright test harness (and handy for live debugging).
;(
  window as unknown as { __dsgnStore?: typeof useChat; __dsgnSession?: typeof useSession }
).__dsgnStore = useChat
;(window as unknown as { __dsgnSession?: typeof useSession }).__dsgnSession = useSession
