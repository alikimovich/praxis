import { create } from 'zustand'
import type { PermissionMode, PermissionRequest, SelectedElement } from '../../shared/api'

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
  /** Set when the agent reports an auth failure — drives the onboarding banner. */
  authNeeded: boolean
  setModel: (model: string) => void
  setEffort: (effort: string) => void
  setSlashCommands: (commands: string[]) => void
  setAuthNeeded: (authNeeded: boolean) => void
}

export const useSession = create<SessionState>((set) => ({
  model: DEFAULT_MODEL,
  effort: DEFAULT_EFFORT,
  slashCommands: [],
  authNeeded: false,
  setModel: (model) => set({ model }),
  setEffort: (effort) => set({ effort }),
  setSlashCommands: (slashCommands) => set({ slashCommands }),
  setAuthNeeded: (authNeeded) => set({ authNeeded })
}))

/**
 * Heuristic: does this agent error look like a missing/invalid Claude login?
 * Per-user auth means a fresh teammate hits this before they've run
 * `claude setup-token` — we want to guide them, not show a raw 401.
 */
export const isAuthError = (message: string): boolean =>
  /\b401\b|invalid authentication|unauthorized|setup-token|not logged in|no credentials|authentication_error/i.test(
    message
  )

/** Convert the UI sentinels into AgentOptions the SDK understands. */
export const toAgentOptions = (s: { model: string; effort: string }): {
  model?: string
  effort?: string
} => ({
  model: s.model === DEFAULT_MODEL ? undefined : s.model,
  effort: s.effort === DEFAULT_EFFORT ? undefined : s.effort
})

/**
 * v2 element selection. `selectMode` mirrors the overlay armed in the preview;
 * `selected` is the most recently picked element. The composer reads `selected`
 * to seed a change request that points the agent at the right source location.
 */
interface SelectionState {
  selectMode: boolean
  selected: SelectedElement | null
  setSelectMode: (selectMode: boolean) => void
  setSelected: (selected: SelectedElement | null) => void
}

export const useSelection = create<SelectionState>((set) => ({
  selectMode: false,
  selected: null,
  setSelectMode: (selectMode) => set({ selectMode }),
  setSelected: (selected) => set({ selected })
}))

/**
 * Tool-permission posture + the queue of pending approve/deny prompts. `mode`
 * is the SDK's PermissionMode: 'default' asks (cards), 'acceptEdits' auto-accepts
 * edits, 'bypassPermissions' is Auto (no prompts — approve-all via the SDK).
 */
interface PermissionState {
  mode: PermissionMode
  pending: PermissionRequest[]
  setMode: (mode: PermissionMode) => void
  addRequest: (request: PermissionRequest) => void
  removeRequest: (id: string) => void
  clearPending: () => void
}

export const usePermissions = create<PermissionState>((set) => ({
  mode: 'default',
  pending: [],
  setMode: (mode) => set({ mode }),
  addRequest: (request) =>
    set((s) =>
      s.pending.some((p) => p.id === request.id)
        ? s
        : { pending: [...s.pending, request] }
    ),
  removeRequest: (id) => set((s) => ({ pending: s.pending.filter((p) => p.id !== id) })),
  clearPending: () => set({ pending: [] })
}))

// A picked element's fields come from the (only semi-trusted) previewed page.
// Collapse to a single line (no control chars / newlines, so an injected value
// can't masquerade as a new instruction paragraph) and cap by code point
// (surrogate-safe). The source is additionally validated to a `path:line` shape.
const oneLine = (s: string, max: number): string =>
  Array.from(s.replace(new RegExp("[\\u0000-\\u001F\\u007F]+", "g"), " "))
    .slice(0, max)
    .join('')
    .trim()

const SOURCE_RE = /^[\w./@-]+:\d+(:\d+)?$/

/** Build the chat prompt prefix that anchors the agent to a picked element. */
export const describeSelectionForPrompt = (el: SelectedElement): string => {
  const id = el.id ? oneLine(el.id, 64) : ''
  const cls = el.classes[0] ? oneLine(el.classes[0], 64) : ''
  const ident = id ? `#${id}` : cls ? `.${cls}` : ''
  const source = el.source && SOURCE_RE.test(el.source) ? el.source : null
  const where = source ? ` in ${source}` : ` (selector: ${oneLine(el.selector, 200)})`
  const text = el.text ? ` with text “${oneLine(el.text, 40)}”` : ''
  return `In the preview I selected the <${oneLine(el.tag, 32)}${ident}> element${where}${text}. `
}

// Exposed for the Playwright test harness (and handy for live debugging).
;(
  window as unknown as {
    __dsgnStore?: typeof useChat
    __dsgnSession?: typeof useSession
    __dsgnSelection?: typeof useSelection
    __dsgnPermissions?: typeof usePermissions
  }
).__dsgnStore = useChat
;(window as unknown as { __dsgnSession?: typeof useSession }).__dsgnSession = useSession
;(window as unknown as { __dsgnSelection?: typeof useSelection }).__dsgnSelection = useSelection
;(window as unknown as { __dsgnPermissions?: typeof usePermissions }).__dsgnPermissions =
  usePermissions
