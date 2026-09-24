import type { QuestionRequest } from './api'
export interface NativeChatMessage {
  id: string; role: 'user' | 'assistant'; text: string
  segments: ({ kind: 'text'; text: string } | { kind: 'tools'; statuses: string[] })[]
  attachments?: { id: string; kind?: 'image' | 'file'; name?: string; path?: string; url?: string }[]
  selection?: { tag: string; ident: string; source: string | null }
  revertGroup?: string
}
import type { NativeComposerAction } from './native-composer'

export interface NativeChatCard {
  id: string
  title: string
  detail?: string
  actions: { label: string; action: string; value?: string; disabled?: boolean }[]
}
export interface NativeChatState {
  chat: string
  messages: NativeChatMessage[]
  running: boolean
  cards: NativeChatCard[]
  questions: QuestionRequest[]
  status: string
  composer: {
    text: string; caret: number; revision: number; stop: boolean; enabled: boolean; sendLabel: string
    context: string; attachments: string[]
    suggestions: { title: string; description: string; active: boolean }[]
    choices: { label: string; value: string; disabled: boolean; options: { value: string; label: string }[] }[]
  }
}
export type NativeChatAction = { chat: string; action: string; id?: string; value?: string; answers?: Record<string, string> | null }
export interface NativeChatBridge {
  focusComposer: () => void
  update: (state: NativeChatState & { visible: boolean; bounds: { x: number; y: number; width: number; height: number } }) => void
  onAction: (callback: (action: NativeChatAction) => void) => () => void
  onComposer: (callback: (action: NativeComposerAction) => void) => () => void
}
declare global { interface Window { praxisNativeChat?: NativeChatBridge } }
