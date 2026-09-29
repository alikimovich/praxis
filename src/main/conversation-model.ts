import type { AgentOptions, PermissionMode, SessionRecord, SessionTranscriptEntry } from '../shared/api'
import { EDIT_TOOLS } from './backends/tools'
import {
  type ApprovalKind,
  ConversationError,
  type ConversationOwner,
  type OwnedChat,
  type Persist,
  type Released,
  type TerminalClaim,
  type TurnPhase
} from './conversation-owner'
import type { SessionStore } from './sessions-store'

/**
 * The rollback conversation owner (`TREZI_BACKEND_OWNER=legacy`) and the owner unit
 * tests use: the twin of `src/service/ConversationState.swift` + `ConversationOwner.swift`,
 * deciding every transition the same way in-process and persisting through the legacy
 * `sessions-store.ts` writer. It keeps no checkpoints (the legacy owner never had
 * them): a crash mid-turn loses the live transcript, as before LKM-97.
 */
const MAX_SPAWNS_PER_PROJECT = 3
const MODES: PermissionMode[] = ['auto', 'default', 'acceptEdits', 'bypassPermissions']

interface Chat {
  chat: string
  project: string
  record: SessionRecord
  options: AgentOptions
  phase: TurnPhase
  turn: string | null
  run: number
  claimed: boolean
  cancelled: boolean
  handoff: boolean
  titling: boolean
  titleSource?: 'user'
}

/** `sessions:rename`/`agent:rename-chat`: one line, collapsed whitespace, capped. */
export const cleanTitle = (t: unknown): string =>
  typeof t === 'string' ? t.replace(/\s+/g, ' ').trim().slice(0, 120) : ''

const spoken = (record: SessionRecord): boolean =>
  record.transcript.some(t => t.role === 'user') && record.transcript.some(t => t.role === 'assistant')

export function legacyConversation(store: () => SessionStore): ConversationOwner {
  const chats = new Map<string, Chat>()
  const active = new Map<string, string>()
  const pending = new Map<string, { chat: string; kind: ApprovalKind; tool: string }>()
  const running = new Map<string, string>()
  const queue: Array<{ id: string; project: string }> = []

  const get = (key: string): Chat => {
    const chat = chats.get(key)
    if (!chat) throw new ConversationError('notFound', 'That chat is closed.')
    return chat
  }
  const release = (key: string): Released[] => {
    const out: Released[] = []
    for (const [id, entry] of pending) if (entry.chat === key) { out.push({ id, kind: entry.kind }); pending.delete(id) }
    return out
  }
  const count = (project: string) => [...running.values()].filter(p => p === project).length
  /** Like the Swift owner's `adopt`: the owner's title survives Bun's record. Records
   *  are copied in and out, as they are over the pipe, so Bun's live buffer and the
   *  owner's copy never alias. */
  const adopt = (chat: Chat, input: SessionRecord) => {
    const record = structuredClone(input)
    const title = chat.record.title
    if (title && (chat.titleSource === 'user' || !record.title)) record.title = title
    chat.record = record
  }

  return {
    kind: 'legacy',
    async save(record, current = false) {
      if (current) store().saveCurrent(record)
      else store().save(record)
    },
    async remove(id) { store().remove(id) },
    async rename(id, title) {
      const name = cleanTitle(title)
      if (!name) return { ok: false, error: 'empty name' }
      const rec = store().get(id)
      if (!rec) return { ok: false, error: 'unknown session' }
      rec.title = name
      store().save(rec)
      for (const chat of chats.values()) if (chat.record.id === id) { chat.record.title = name; chat.titleSource = 'user' }
      return { ok: true, title: name }
    },
    async open(chat, project, record, options, makeActive) {
      chats.set(chat, { chat, project, record: structuredClone(record), options: { ...options }, phase: 'idle', turn: null, run: 0, claimed: false, cancelled: false, handoff: false, titling: false })
      if (makeActive) active.set(project, chat)
    },
    async activate(key) { active.set(get(key).project, key) },
    async checkpoint(key, record) { adopt(get(key), record); return true },
    async close(key, persist, record) {
      const released = release(key)
      const chat = chats.get(key)
      if (!chat) return { saved: false, release: released }
      adopt(chat, record)
      chats.delete(key)
      if (active.get(chat.project) === key) active.delete(chat.project)
      if (persist === 'none' || !chat.record.transcript.some(t => t.role === 'user')) return { saved: false, release: released }
      try {
        if (persist === 'current') store().saveCurrent(chat.record)
        else { delete chat.record.slot; store().save(chat.record) }
      } catch {
        // history is non-critical; never let it interfere with session lifecycle
        return { saved: false, release: released }
      }
      return { saved: true, release: released }
    },
    async configure(key, options) { get(key).options = { ...options } },
    async handoff(key, options, record, reason) {
      const chat = get(key)
      if (reason === 'model' && chat.phase !== 'idle') throw new ConversationError('busy', 'Wait for the current response to finish before switching models.')
      chat.options = { ...options }; chat.handoff = true
      // The force-stopped session is gone: its turn is abandoned, not landed.
      if (reason === 'restart') Object.assign(chat, { phase: 'idle', turn: null, claimed: false, cancelled: false })
      adopt(chat, record)
    },
    async begin(key, turn) {
      const chat = get(key)
      if (chat.phase !== 'idle') throw new ConversationError('busy', 'This chat is already running.')
      Object.assign(chat, { phase: 'preparing', turn, run: 0, claimed: false, cancelled: false })
    },
    async send(key, turn, entry: SessionTranscriptEntry) {
      const chat = get(key)
      if (chat.phase !== 'preparing' || chat.turn !== turn) throw new ConversationError('notFound', 'That message is no longer being sent.')
      if (chat.cancelled) throw new ConversationError('cancelled', 'Message cancelled before sending.')
      chat.phase = 'running'
      const handoff = chat.handoff
      chat.handoff = false
      chat.record.transcript.push({ ...entry })
      return { handoff }
    },
    async abort(key, turn) {
      const chat = chats.get(key)
      if (!chat || chat.turn !== turn || (chat.phase !== 'preparing' && chat.phase !== 'running')) return false
      Object.assign(chat, { phase: 'idle', turn: null, claimed: false, cancelled: false })
      return true
    },
    async cancel(key) {
      const chat = chats.get(key)
      if (!chat) return { phase: 'idle', turn: null }
      if (chat.phase !== 'idle') chat.cancelled = true
      return { phase: chat.phase, turn: chat.turn }
    },
    async terminal(key, turn, run, kind, record): Promise<TerminalClaim> {
      const chat = chats.get(key)
      if (!chat || chat.turn !== turn || chat.run !== run || (chat.phase !== 'running' && chat.phase !== 'landing')) return { claimed: false, reason: 'stale' }
      if (chat.claimed) return { claimed: false, reason: 'duplicate' }
      chat.claimed = true; chat.phase = 'landing'
      adopt(chat, record)
      const success = kind === 'done' && !chat.cancelled
      const title = success && spoken(chat.record) && !chat.titling && !chat.record.title
      if (title) chat.titling = true
      return { claimed: true, outcome: success ? 'success' : 'failed', title, memory: success && spoken(chat.record) }
    },
    async continueTurn(key, turn, run) {
      const chat = chats.get(key)
      if (!chat || chat.turn !== turn || chat.phase !== 'landing' || !chat.claimed || chat.cancelled || run !== chat.run + 1) return false
      Object.assign(chat, { phase: 'running', run, claimed: false })
      return true
    },
    async landed(key, turn, at) {
      const chat = chats.get(key)
      if (!chat || chat.turn !== turn || chat.phase !== 'landing') return { landed: false }
      Object.assign(chat, { phase: 'idle', turn: null, claimed: false, cancelled: false })
      const entry = [...chat.record.transcript].reverse().find(t => t.role === 'user')
      if (entry && entry.completedAt == null) { entry.completedAt = at; return { landed: true, completedAt: at } }
      return { landed: true }
    },
    async title(key, title, source) {
      const chat = get(key)
      if (source === 'generated') {
        chat.titling = false
        if (!title || chat.record.title) return { ok: false }
        chat.record.title = title
        return { ok: true, title }
      }
      const name = cleanTitle(title)
      if (!name) return { ok: false, error: 'empty name' }
      chat.record.title = name; chat.titleSource = 'user'
      // A resumed/parked chat may already have its record on disk — keep that copy in step.
      try {
        const saved = store().get(chat.record.id)
        if (saved) { saved.title = name; store().save(saved) }
      } catch { /* history is non-critical */ }
      return { ok: true, title: name }
    },
    async register(key, id, kind, tool) { get(key); pending.set(id, { chat: key, kind, tool }) },
    async resolve(id, kind) {
      const entry = pending.get(id)
      if (!entry || entry.kind !== kind) return null
      pending.delete(id)
      return entry.chat
    },
    async mode(key, mode) {
      const chat = get(key)
      if (!MODES.includes(mode)) throw new ConversationError('invalidRequest', 'Unknown permission mode.')
      chat.options = { ...chat.options, permissionMode: mode }
      const allow: string[] = []
      for (const [id, entry] of pending) {
        if (entry.chat !== key || entry.kind !== 'permission') continue
        if (mode === 'bypassPermissions' || (mode === 'acceptEdits' && EDIT_TOOLS.has(entry.tool))) { allow.push(id); pending.delete(id) }
      }
      return allow
    },
    async release(key) { return release(key) },
    async spawn(id, project) {
      if (count(project) < MAX_SPAWNS_PER_PROJECT) { running.set(id, project); return true }
      queue.push({ id, project })
      return false
    },
    async spawnDone(id) {
      const project = running.get(id)
      if (project === undefined) return []
      running.delete(id)
      const started: string[] = []
      while (count(project) < MAX_SPAWNS_PER_PROJECT) {
        const index = queue.findIndex(q => q.project === project)
        if (index === -1) break
        const [next] = queue.splice(index, 1)
        running.set(next.id, project); started.push(next.id)
      }
      return started
    },
    async spawnCancel(id) {
      const index = queue.findIndex(q => q.id === id)
      if (index === -1) return false
      queue.splice(index, 1)
      return true
    },
    async snapshot() {
      const list: OwnedChat[] = [...chats.values()].map(chat => ({
        chat: chat.chat, project: chat.project, root: chat.record.projectRoot, active: active.get(chat.project) === chat.chat,
        phase: chat.phase, turn: chat.turn, run: chat.run, record: structuredClone(chat.record), options: { ...chat.options }
      }))
      return { chats: list, spawns: { running: [...running.keys()].sort(), queued: queue.map(q => q.id) } }
    },
    async status() { return { recovered: [] } }
  }
}

export type { Persist }
