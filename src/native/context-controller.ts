import type { SelectedElement, AgentEvent } from '../shared/api'
import type { NativeChatContext, NativeChatEffect } from '../shared/native-chat-controller'
import { describeSelectionForPrompt, selectionForBubble } from '../shared/selection-context'
import type { ProjectEntry } from '../shared/workspace'
import type { NativeChatController } from './chat-controller'
import type { NativeWorkspaceController } from './workspace-controller'
interface ProjectContext {
  selection: NativeChatContext['selection']
  setup: NativeChatContext['setup']
  tokens: NativeChatContext['tokens']
  notes: NativeChatContext['notes']
  pins: { id: string; selector: string }[]
  canInstrument?: boolean
  stamps?: number
  verifyingAfter?: number
  loading?: Promise<void>
}
export class NativeContextController {
  readonly projects = new Map<string, ProjectContext>()
  readonly spawns = new Map<string, NativeChatContext['spawns']>()
  constructor(readonly workspace: NativeWorkspaceController, readonly chat: NativeChatController, readonly turn: () => NativeChatContext['turn'], readonly send: (channel: string, ...args: any[]) => Promise<any> = workspace.services.invoke) {}
  private get invoke() { return this.workspace.services.invoke }
  private project(root: string) {
    let state = this.projects.get(root)
    if (!state) { state = { selection: null, setup: { needed: false, dismissed: false, status: null }, tokens: { needed: false, dismissed: false }, notes: [], pins: [] }; this.projects.set(root, state) }
    return state
  }
  private context(root: string | null, key: string): NativeChatContext {
    const state = this.project(root ?? '')
    return { chat: key, root, selection: state.selection, setup: { ...state.setup }, tokens: { ...state.tokens }, notes: state.notes, spawns: this.spawns.get(key) ?? [], turn: this.turn() }
  }
  private changed(root: string) {
    for (const value of this.chat.chats.values()) if (value.context?.root === root) {
      value.context = this.context(root, value.chat); this.chat.changed(value)
    }
  }
  async activate(entry: ProjectEntry | null) {
    const old = this.chat.chats.get(this.chat.active)?.context?.root
    if (old !== entry?.root && entry) this.project(entry.root).selection = null
    await this.chat.command({ type: 'context', context: this.context(entry?.root ?? null, entry?.activeSessionKey ?? '') })
    if (!entry) return
    const state = this.project(entry.root)
    if (!state.loading) state.loading = this.load(entry.root)
    await state.loading
    if (this.workspace.active?.root === entry.root) await this.send('preview:set-annotations', state.pins)
  }
  private async load(root: string) {
    const state = this.project(root)
    const results = await Promise.allSettled([this.invoke('setup:detect', root), this.invoke('tokens:detect', root), this.invoke('annotations:list', root)])
    if (this.projects.get(root) !== state) return
    if (results[0].status === 'fulfilled') state.canInstrument = results[0].value.canInstrument
    if (results[1].status === 'fulfilled') state.tokens.needed = results[1].value.source === 'none'
    if (results[2].status === 'fulfilled') { state.notes = results[2].value.map((n: any) => ({ id: n.id, text: n.text })); state.pins = results[2].value.map((n: any) => ({ id: n.id, selector: n.selector })) }
    if (state.stamps === 0 && state.canInstrument && !state.setup.dismissed) state.setup.needed = true
    this.changed(root)
  }
  selection(element: SelectedElement | null) {
    const root = this.workspace.active?.root
    if (!root) return
    const group = element ? element.selectionGroup ?? [element] : []
    this.project(root).selection = element && group.length ? {
      label: group.length > 1 ? `${group.length} objects` : element.tag,
      prompt: group.map(describeSelectionForPrompt).join('\n'),
      bubble: group.length > 1 ? { tag: `${group.length} objects`, ident: '', source: null } : selectionForBubble(element)
    } : null
    this.changed(root)
  }
  readiness(info: { stamps: number; documentStartedAt?: number }) {
    const root = this.workspace.active?.root
    if (!root) return
    const state = this.project(root)
    if (state.verifyingAfter && info.documentStartedAt !== undefined && info.documentStartedAt < state.verifyingAfter) return
    state.stamps = info.stamps
    if (state.verifyingAfter) {
      state.setup.status = info.stamps > 0 ? `Setup verified — ${info.stamps} element(s) now mapped to source.` : 'Setup ran but no elements got stamped. Check the config wiring and dev-server restart.'
      state.verifyingAfter = undefined
    }
    if (info.stamps > 0) state.setup.needed = false
    else if (state.canInstrument && !state.setup.dismissed) state.setup.needed = true
    this.changed(root)
  }
  async effect(effect: NativeChatEffect) {
    if (effect.type === 'selection-clear') {
      const root = this.chat.chats.get(effect.chat)?.context?.root
      if (root && this.project(root).selection?.prompt === effect.prompt) { this.project(root).selection = null; this.changed(root); if (this.workspace.active?.root === root) await this.send('preview:clear-selected') }
    } else if (effect.type === 'setup') {
      const root = this.chat.chats.get(effect.chat)?.context?.root
      if (!root) return
      const state = this.project(root)
      if (effect.status) state.setup.status = effect.status
      if (effect.phase === 'dismissed') { state.setup.dismissed = true; state.setup.needed = false }
      if (effect.phase === 'landed') {
        state.verifyingAfter = Date.now()
        const entry = this.workspace.state.projects.find(p => p.root === root)
        if (entry && this.workspace.active?.key === entry.key) await this.workspace.command({ type: 'restart', key: entry.key })
        else state.setup.status = 'Setup applied. Reopen the project to restart its preview.'
      }
      this.changed(root)
    } else if (effect.type === 'tokens') {
      const state = this.project(effect.root), value = this.chat.chats.get(this.chat.active)?.context
      if (value?.root === effect.root && value.tokens.dismissed) state.tokens.dismissed = true
      const result = await this.invoke('tokens:detect', effect.root)
      state.tokens.needed = result.source === 'none'; this.changed(effect.root)
    } else if (effect.type === 'notes') await this.notes(effect.root)
    else if (effect.type === 'history') {
      await Promise.all(this.workspace.state.projects.map(async entry => {
        const records = await this.invoke('sessions:list', entry.root)
        if (this.workspace.state.projects.includes(entry)) this.workspace.state.history[entry.key] = records
      }))
      this.workspace.changed()
    } else if (effect.type === 'spawn') this.spawn(effect.event)
  }
  async notes(root: string) {
    const state = this.project(root), notes = await this.invoke('annotations:list', root)
    if (this.projects.get(root) !== state) return
    state.notes = notes.map((n: any) => ({ id: n.id, text: n.text })); state.pins = notes.map((n: any) => ({ id: n.id, selector: n.selector })); this.changed(root)
    if (this.workspace.active?.root === root) await this.send('preview:set-annotations', state.pins)
  }
  queued(key: string, id: string, label: string, queued: boolean) {
    const list = this.spawns.get(key) ?? []
    if (!list.some(s => s.id === id)) this.spawns.set(key, [...list, { id, label, status: queued ? 'queued' : 'running' }])
    const root = this.chat.chats.get(key)?.context?.root
    if (root) this.changed(root)
  }
  private spawn(event: AgentEvent) {
    if (!event.projectKey || !event.sessionId) return
    let list = this.spawns.get(event.projectKey) ?? []
    if (event.type === 'spawn-started') list = [...list.filter(s => s.id !== event.sessionId), { id: event.sessionId, label: event.branch, status: 'running' }]
    else if (event.type === 'spawn-finished') list = list.filter(s => s.id !== event.sessionId)
    this.spawns.set(event.projectKey, list)
    const root = this.chat.chats.get(event.projectKey)?.context?.root
    if (root) this.changed(root)
  }
}
