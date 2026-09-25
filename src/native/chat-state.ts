import type { AgentEvent, PermissionRequest, QuestionRequest, SessionTranscriptEntry, SlashCommandItem } from '../shared/api'
import { defaultChatAgentSettings, type ChatAgentSettings } from '../shared/chat-settings'
import type { NativeChatContext, NativeChatMirror } from '../shared/native-chat-controller'

export interface Attachment {
  id: string; name: string; path: string; type: string; data: string
}
export interface Submission {
  id: string; text: string; attachments: Attachment[]
  selection: NativeChatContext['selection']; turn: NativeChatContext['turn']
}
export interface Chat extends NativeChatMirror {
  phase: 'thinking' | 'writing' | 'working' | 'applying'
  activityDetail: string
  stopping: boolean
  root: string
  ready: boolean
  version: number
  text: string; caret: number; revision: number
  attachments: Attachment[]
  commands: SlashCommandItem[]
  menuIndex: number; dismissed: boolean
  settings: ChatAgentSettings; pendingModel?: ChatAgentSettings
  switching: boolean; error?: string
  queue: Submission[]; paused: boolean; sending: boolean; cancellation: number
  permissions: PermissionRequest[]; questions: QuestionRequest[]
  setup: boolean; awaitingLanding: boolean
  context?: NativeChatContext
}
export function newChat(chat: string): Chat {
  return {
    phase: 'thinking', activityDetail: '', stopping: false,
    chat, root: '', ready: false, version: 0, messages: [], isRunning: false, streamingId: null,
    isolation: 'live', usage: { input: 0, output: 0, cached: 0 }, workedMs: 0,
    turnStartedAt: null, needsReview: false,
    text: '', caret: 0, revision: 0, attachments: [], commands: [], menuIndex: 0, dismissed: false,
    settings: defaultChatAgentSettings(), switching: false, queue: [], paused: false, sending: false,
    cancellation: 0, permissions: [], questions: [], setup: false, awaitingLanding: false
  }
}
export function assistant(chat: Chat) {
  let message = chat.messages.find(message => message.id === chat.streamingId)
  if (!message) {
    message = { id: crypto.randomUUID(), role: 'assistant', text: '', segments: [], statuses: [] }
    chat.messages.push(message)
    chat.streamingId = message.id
  }
  return message
}
export function append(chat: Chat, text: string, status = false) {
  const message = assistant(chat)
  const last = message.segments.at(-1)
  if (status) {
    message.statuses.push(text)
    if (last?.kind === 'tools') last.statuses.push(text)
    else message.segments.push({ kind: 'tools', statuses: [text] })
  } else {
    message.text += text
    if (last?.kind === 'text') last.text += text
    else message.segments.push({ kind: 'text', text })
  }
}
export function hydrate(chat: Chat, transcript: SessionTranscriptEntry[]) {
  chat.messages = []
  chat.streamingId = null
  for (const entry of transcript) {
    if (entry.role === 'user') {
      chat.streamingId = null
      chat.messages.push({ id: crypto.randomUUID(), role: 'user', text: entry.text, statuses: [], segments: [{ kind: 'text', text: entry.text }] })
    } else append(chat, entry.text, entry.role === 'status')
  }
  if (!chat.isRunning) chat.streamingId = null
}
export function finish(chat: Chat, landing = false) {
  chat.isRunning = landing
  chat.phase = landing ? 'applying' : 'thinking'
  chat.activityDetail = ''
  if (!landing) chat.stopping = false
  if (!landing) {
    if (chat.turnStartedAt) chat.workedMs += Date.now() - chat.turnStartedAt
    chat.turnStartedAt = null
    chat.streamingId = null
  }
}
export function reduce(chat: Chat, event: AgentEvent) {
  chat.version++
  switch (event.type) {
    case 'delta':
      chat.phase = 'writing'; chat.activityDetail = ''; append(chat, event.text); break
    case 'status':
      chat.phase = 'working'; chat.activityDetail = event.text; append(chat, event.text, true); break
    case 'title': chat.title = event.title; break
    case 'commands': chat.commands = event.commands; break
    case 'usage':
      for (const key of ['input', 'output', 'cached'] as const) chat.usage[key] += event[key]
      break
    case 'error': append(chat, `\n\n⚠️ ${event.message}`); chat.paused = true; finish(chat); break
    case 'done': finish(chat, event.landingPending); break
    case 'landing-finished': finish(chat); break
    case 'reconciliation-started':
      chat.isolation = 'isolated'; chat.isRunning = true; chat.phase = 'applying'
      append(chat, 'Combining this chat’s changes with recent project edits…', true); break
    case 'isolation':
      chat.isolation = event.state === 'parked' ? 'parked' : 'isolated'
      chat.isolationFiles = event.files
      if (event.state === 'merged' && event.group && event.revertable !== false) {
        const last = [...chat.messages].reverse().find(message => message.role === 'assistant')
        if (last) last.revertGroup = event.group
      }
      if (event.state === 'parked') chat.paused = true
      break
    case 'permission-request':
      chat.permissions = [...chat.permissions.filter(p => p.id !== event.request.id), event.request]; break
    case 'permission-resolved': chat.permissions = chat.permissions.filter(p => p.id !== event.id); break
    case 'question-request': chat.questions = [...chat.questions.filter(q => q.id !== event.request.id), event.request]; break
    case 'question-resolved': chat.questions = chat.questions.filter(q => q.id !== event.id); break
  }
}
export function mirror(chat: Chat): NativeChatMirror {
  const { chat: key, messages, isRunning, streamingId, title, isolation, isolationFiles, usage, workedMs, turnStartedAt, needsReview } = chat
  return { chat: key, messages, isRunning, streamingId, title, isolation, isolationFiles, usage, workedMs, turnStartedAt, needsReview }
}
