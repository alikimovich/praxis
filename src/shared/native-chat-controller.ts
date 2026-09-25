import type { AgentTurnOptions, AgentEvent } from './api'
import type { ChatAgentSettings } from './chat-settings'
import type { NativeChatMessage, NativeChatState } from './native-chat'

/** Transitional shell context. No transcript, draft, queue or streaming state enters here. */
export interface NativeChatContext {
  chat: string
  root: string | null
  selection: { label: string; prompt: string; bubble: NonNullable<NativeChatMessage['selection']> } | null
  turn: AgentTurnOptions
  setup: { needed: boolean; dismissed: boolean; status: string | null }
  tokens: { needed: boolean; dismissed: boolean }
  notes: { id: string; text: string }[]
  spawns: { id: string; label: string; status: string }[]
}
export interface NativeChatLayout {
  visible: boolean
  bounds: { x: number; y: number; width: number; height: number }
}
export interface NativeChatMirror {
  chat: string
  messages: (NativeChatMessage & { statuses: string[] })[]
  isRunning: boolean
  streamingId: string | null
  title?: string
  isolation: 'live' | 'isolated' | 'parked'
  isolationFiles?: string[]
  usage: { input: number; output: number; cached: number }
  workedMs: number
  turnStartedAt: number | null
  needsReview: boolean
}
export type NativeChatEffect =
  | { type: 'spawn'; event: AgentEvent }
  | { type: 'mirror'; state: NativeChatMirror }
  | { type: 'settings'; chat: string; root: string; settings: ChatAgentSettings }
  | { type: 'selection-clear'; chat: string; prompt?: string }
  | { type: 'setup'; chat: string; phase: 'configuring' | 'landed' | 'failed' | 'dismissed'; status?: string }
  | { type: 'tokens'; root: string }
  | { type: 'notes'; root: string }
  | { type: 'layers' | 'focus' | 'history' }
export type NativeChatCommand =
  | { type: 'attach' }
  | { type: 'context'; context: NativeChatContext }
  | { type: 'layout'; layout: NativeChatLayout }
  | { type: 'seed' | 'submit'; chat: string; text: string }
export type NativeChatSnapshot = NativeChatState & NativeChatLayout

declare global { interface Window { praxisNativeContext?: { selection(value: import('./api').SelectedElement | null): void } } }
