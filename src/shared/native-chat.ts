import type { QuestionRequest } from './api'
export interface NativeChatMessage {
  at?: number; workedMs?: number
  id: string; role: 'user' | 'assistant'; text: string
  segments: ({ kind: 'text'; text: string; at?: number } | { kind: 'tools'; statuses: string[] } | { kind: 'island'; island: import('./chat-islands').IslandView })[]
  attachments?: { id: string; kind?: 'image' | 'file'; name?: string; path?: string; url?: string }[]
  selection?: { tag: string; ident: string; source: string | null }
  revertGroup?: string
}

export interface NativeChatCard {
  id: string
  title: string
  detail?: string
  actions: { label: string; action: string; value?: string; disabled?: boolean }[]
}
export interface NativeChatActivity {
  label: string
  kind: 'thinking' | 'writing' | 'working' | 'applying' | 'waiting' | 'stopping'
  animated: boolean
}
export interface NativeChatState {
  activity: NativeChatActivity | null
  streamingId: string | null
  chat: string
  messages: NativeChatMessage[]
  running: boolean
  cards: NativeChatCard[]
  questions: QuestionRequest[]
  status: string
  statusDetail?: string
  composer: {
    queue: { id: string; text: string; attachments: number }[]
    queuePaused: boolean
    ready: boolean; running: boolean; thinking: boolean
    text: string; caret: number; revision: number; stop: boolean; enabled: boolean; sendLabel: string
    context: string; attachments: { id: string; name: string; type: string; data: string }[]
    suggestions: { title: string; description: string; active: boolean }[]
    choices: { label: string; value: string; disabled: boolean; options: { value: string; label: string }[] }[]
  }
}
export type NativeChatAction = { chat: string; action: string; id?: string; value?: string; answers?: Record<string, string> | null }
export interface NativeChatBridge {
  focusComposer: () => void
  command: (command: import('./native-chat-controller').NativeChatCommand) => void
  onEffect: (callback: (effect: import('./native-chat-controller').NativeChatEffect) => void) => () => void
}
declare global { interface Window { praxisNativeChat?: NativeChatBridge } }
