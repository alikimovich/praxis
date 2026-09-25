import { environmentChanges } from '../shared/environment-changes'
import { projectKey } from '../shared/projectKey'
import { agentOptionsFor, chatAgentSettingsFromOptions, defaultChatAgentSettings, resumeChatSettings, type ChatAgentSettings } from '../shared/chat-settings'
import type { WorkspaceSnapshot } from '../shared/api'
import type { ProjectEntry } from '../shared/workspace'
import type { NativeWorkspaceCommand, NativeWorkspaceSnapshot } from '../shared/native-workspace'

export interface WorkspaceServices {
  invoke(channel: string, ...args: any[]): Promise<any>
  read(): string | null
  write(raw: string): void
  render(state: NativeWorkspaceSnapshot): void
  activate(entry: ProjectEntry | null): Promise<void>
  closeChat(key: string): void
  reusableChat(key: string): boolean
}
/** Owns project/session lifetime. Renderers receive projections, never navigation callbacks. */
export class NativeWorkspaceController {
  state: NativeWorkspaceSnapshot = { revision: 0, projects: [], activeKey: null, status: { kind: 'idle' }, history: {}, recents: [] }
  preferred = defaultChatAgentSettings()
  private boot?: Promise<void>
  private intent = 0
  private jobs = new Map<string, Promise<void>>()
  private closing = new Set<string>()
  constructor(readonly services: WorkspaceServices) {}
  reportError(error: unknown) { this.state.error = String(error); this.changed() }
  get active() { return this.state.projects.find(p => p.key === this.state.activeKey) ?? null }
  changed() {
    this.state.revision++
    this.services.write(JSON.stringify({ projects: this.state.projects, activeKey: this.state.activeKey, recents: this.state.recents }))
    this.services.render(structuredClone(this.state))
  }
  reorderProject(key: string, before: string | null) {
    const projects = this.state.projects
    const from = projects.findIndex(project => project.key === key)
    if (from < 0 || before === key || (before !== null && !projects.some(project => project.key === before))) return
    const next = projects.filter(project => project.key !== key)
    const to = before === null ? next.length : next.findIndex(project => project.key === before)
    next.splice(to, 0, projects[from])
    if (next.every((project, index) => project === projects[index])) return
    this.state.projects = next
    this.changed()
  }
  private find(key: string) {
    const entry = this.state.projects.find(p => p.key === key)
    if (!entry || this.closing.has(key)) throw new Error('Project is no longer open')
    return entry
  }
  private settings(entry: ProjectEntry) {
    return entry.chatSettings?.[entry.activeSessionKey] ?? this.preferred
  }
  private async serialize(key: string, work: () => Promise<void>) {
    const prior = this.jobs.get(key)
    const job = (prior ?? Promise.resolve()).catch(() => {}).then(work)
    this.jobs.set(key, job)
    try { await job } finally { if (this.jobs.get(key) === job) this.jobs.delete(key) }
  }
  async transact(key: string, work: (entry: ProjectEntry) => Promise<void>) {
    await this.serialize(key, async () => { const entry = this.find(key); await work(entry) })
  }
  async refreshEnvironment(key: string, files?: string[]) {
    const entry = this.state.projects.find(p => p.key === key)
    if (!entry) return
    const changes = files ? environmentChanges(files) : { restart: true, install: true }
    entry.environmentRevision = (entry.environmentRevision ?? 0) + 1
    entry.dependenciesPending = entry.dependenciesPending || changes.install
    this.changed()
    if (this.active?.key === key) await this.command({ type: 'restart', key })
  }
  async command(command: NativeWorkspaceCommand) {
    if (command.type === 'attach') {
      if (command.preferred) this.preferred = command.preferred
      this.boot ??= this.restore(command.legacy)
      await this.boot; this.services.render(structuredClone(this.state)); return
    }
    if (command.type === 'open') {
      const root = command.root ?? await this.services.invoke('project:pick')
      if (root) await this.open(root, command.command)
      return
    }
    if (command.type === 'select') return this.select(command.key)
    if (command.type === 'close') return this.close(command.key)
    if (command.type === 'restart') {
      const entry = this.find(command.key), intent = this.intent
      if (this.active?.key !== entry.key) return
      if (entry.url && !entry.launchSpec && !command.command) {
        await this.services.invoke('preview:load', entry.url)
        return
      }
      await this.serialize(entry.key, async () => {
        await this.services.invoke(entry.previewKind === 'simulator' ? 'simulator:stop' : 'devserver:stop', entry.root)
      })
      if (this.intent !== intent || this.closing.has(entry.key)) return
      return this.select(entry.key, command.command, true)
    }
    const entry = this.find(command.key), intent = ++this.intent
    if (command.type === 'close-chat' && entry.sessionKeys.length === 1) return this.close(entry.key)
    await this.serialize(entry.key, async () => {
      if (this.closing.has(entry.key)) return
      if (command.type === 'chat') {
        if (!entry.sessionKeys.includes(command.session)) throw new Error('Unknown chat')
        entry.activeSessionKey = command.session
      } else if (command.type === 'new-chat' || command.type === 'resume') {
        const live: WorkspaceSnapshot = await this.services.invoke('agent:workspace-snapshot')
        const sessions = live.projects.find(p => p.projectKey === entry.key)?.chats ?? []
        const empty = command.type === 'new-chat' && sessions.find(c => !c.isRunning && c.record.transcript.length === 0 && this.services.reusableChat(c.sessionKey))
        let key = empty ? empty.sessionKey : ''
        const settings = command.type === 'resume' ? resumeChatSettings(this.settings(entry)) : this.settings(entry)
        if (!key) {
          const result = command.type === 'resume'
            ? await this.services.invoke('agent:resume-session', entry.root, command.record, agentOptionsFor(settings))
            : await this.services.invoke('agent:new-chat', entry.root, agentOptionsFor(settings))
          if (!result.ok || !result.sessionKey) throw new Error(result.error || 'Unable to start chat')
          key = result.sessionKey
        }
        if (!entry.sessionKeys.includes(key)) entry.sessionKeys.push(key)
        entry.activeSessionKey = key
        entry.chatSettings = { ...entry.chatSettings, [key]: settings }
      } else if (command.type === 'close-chat') {
        if (!entry.sessionKeys.includes(command.session)) return
        if (entry.sessionKeys.length === 1) throw new Error('Close the project to close its last chat')
        const result = await this.services.invoke('agent:close-chat', entry.root, command.session)
        if (!result.ok) throw new Error(result.error || 'Unable to close chat')
        entry.sessionKeys = entry.sessionKeys.filter(key => key !== command.session)
        delete entry.chatSettings?.[command.session]
        this.services.closeChat(command.session)
        if (entry.activeSessionKey === command.session) entry.activeSessionKey = result.activeSessionKey ?? entry.sessionKeys[0]
      }
      if (this.closing.has(entry.key)) return
      this.changed()
    })
    if (this.intent !== intent || this.closing.has(entry.key) || !this.state.projects.includes(entry)) return
    if (this.state.activeKey === entry.key) {
      await this.services.invoke('agent:set-active', entry.root, entry.activeSessionKey)
      if (this.intent === intent) await this.services.activate(entry)
    } else await this.select(entry.key)
  }
  private async restore(legacy?: string | null) {
    const raw = this.services.read() ?? legacy
    if (raw) {
      const value = JSON.parse(raw)
      if (!Array.isArray(value.projects)) throw new Error('Invalid saved workspace')
      this.state.projects = value.projects.filter((p: any) => p && typeof p.root === 'string' && p.root.startsWith('/') && p.key === projectKey(p.root))
      this.state.activeKey = this.state.projects.some(p => p.key === value.activeKey) ? value.activeKey : this.state.projects.at(-1)?.key ?? null
      this.state.recents = Array.isArray(value.recents) ? value.recents.filter((p: any) => typeof p.root === 'string' && typeof p.name === 'string') : []
    }
    const live: WorkspaceSnapshot = await this.services.invoke('agent:workspace-snapshot')
    for (const project of live.projects) {
      let entry = this.state.projects.find(p => p.key === project.projectKey)
      if (!entry) { entry = this.entry(project.root); this.state.projects.push(entry) }
      entry.sessionKeys = project.chats.map(c => c.sessionKey)
      entry.activeSessionKey = project.activeSessionKey ?? entry.sessionKeys[0]
      entry.chatSettings = Object.fromEntries(project.chats.map(c => [c.sessionKey, chatAgentSettingsFromOptions(c.options)]))
    }
    this.changed()
    if (this.active) await this.select(this.active.key)
  }
  private entry(root: string): ProjectEntry {
    const key = projectKey(root)
    return { root, key, name: root.split('/').filter(Boolean).at(-1) ?? root, url: null, previewKind: 'web', branch: null, launchSpec: null, touchedAt: Date.now(), sessionKeys: [key], activeSessionKey: key, chatSettings: { [key]: { ...this.preferred } } }
  }
  async open(root: string, command?: string) {
    if (!root.startsWith('/')) throw new Error('Project requires an absolute path')
    const key = projectKey(root)
    const prior = this.jobs.get(key)
    if (this.closing.has(key) && prior) await prior.catch(() => {})
    let entry = this.state.projects.find(p => p.key === key)
    if (!entry) { entry = this.entry(root); this.state.projects.push(entry) }
    await this.select(key, command)
  }
  async select(key: string, command?: string, restart = false) {
    const entry = this.find(key), intent = ++this.intent
    this.state.activeKey = key; entry.touchedAt = Date.now()
    this.state.status = { kind: 'busy', label: 'Opening ' + entry.name + '…' }
    this.changed()
    const current = () => this.intent === intent && !this.closing.has(key) && this.state.projects.includes(entry)
    try {
      await this.serialize(key, async () => {
        if (this.closing.has(key)) return
        const branch = await this.services.invoke(entry.branch ? 'git:list' : 'git:ensure', entry.root).catch(() => null)
        if (branch) entry.branch = branch.current ?? branch.branch ?? null
        let live: WorkspaceSnapshot = await this.services.invoke('agent:workspace-snapshot')
        if (!live.projects.some(p => p.projectKey === key)) {
          await this.services.invoke('agent:open-project', entry.root, agentOptionsFor(this.settings(entry)))
          entry.sessionKeys = [key]; entry.activeSessionKey = key
          live = await this.services.invoke('agent:workspace-snapshot')
        }
        const project = live.projects.find(p => p.projectKey === key)
        if (project) {
          entry.sessionKeys = project.chats.map(c => c.sessionKey)
          if (!entry.sessionKeys.includes(entry.activeSessionKey)) entry.activeSessionKey = project.activeSessionKey ?? entry.sessionKeys[0]
          entry.chatSettings = Object.fromEntries(project.chats.map(c => [c.sessionKey, chatAgentSettingsFromOptions(c.options)]))
        }
        if (this.closing.has(key)) return
        const detected = await this.services.invoke('project:detect', entry.root)
        entry.name = detected.name
        entry.previewKind = command ? 'web' : detected.previewKind
        if (detected.setupRequired && !command) {
          entry.url = null; entry.launchSpec = null
        } else {
          const spec = { root: entry.root, command: command ?? (entry.launchSpec?.customCommand ? entry.launchSpec.command : detected.devCommand), framework: detected.framework, previewKind: entry.previewKind, customCommand: !!command || !!entry.launchSpec?.customCommand }
          // The simulator is shared; a stale project must never take it from the active one.
          if (entry.previewKind === 'simulator' && !current()) return
          const info = entry.previewKind === 'simulator' ? null : await this.services.invoke('devserver:info', entry.root)
          if ((restart || entry.environmentRevision) && info?.running) await this.services.invoke('devserver:stop', entry.root)
          const server = !restart && !entry.environmentRevision && !command && info?.running ? info.server
            : entry.previewKind === 'simulator' ? await this.services.invoke('simulator:start', { root: entry.root, ...(spec.customCommand ? { command: spec.command } : {}) })
            : await this.services.invoke('devserver:start', { ...spec, installDependencies: !!entry.dependenciesPending })
          entry.url = server.url; entry.launchSpec = server.attached ? null : spec
          entry.environmentRevision = 0; entry.dependenciesPending = false
        }
        this.state.history[key] = await this.services.invoke('sessions:list', entry.root)
        this.state.recents = [{ root: entry.root, name: entry.name, at: Date.now() }, ...this.state.recents.filter(p => p.root !== entry.root)].slice(0, 10)
      })
      if (!current()) { this.changed(); return }
      await this.services.invoke('agent:set-active', entry.root, entry.activeSessionKey)
      if (!current()) return
      await this.services.invoke('preview:set-select-mode', false)
      if (!current()) return
      await this.services.invoke(entry.url ? 'preview:load' : 'preview:reset', ...(entry.url ? [entry.url] : []))
      if (!current()) return
      this.state.status = entry.url ? { kind: 'running', name: entry.name, url: entry.url } : { kind: 'setup', name: entry.name }
      this.changed()
      await this.services.activate(entry)
      await this.evictWarm()
    } catch (error) {
      if (!current()) return
      this.state.status = { kind: 'error', message: String(error) }
      this.changed()
      // Keep the agent usable for fixing a failed preview.
      await this.services.activate(entry)
    }
  }

  private async evictWarm() {
    const old = [...this.state.projects].sort((a, b) => b.touchedAt - a.touchedAt).slice(3)
    for (const entry of old) {
      if (entry.key === this.state.activeKey || entry.previewKind === 'simulator' || this.closing.has(entry.key) || this.jobs.has(entry.key)) continue
      await this.serialize(entry.key, async () => {
        const snapshot: WorkspaceSnapshot = await this.services.invoke('agent:workspace-snapshot')
        const live = snapshot.projects.find(p => p.projectKey === entry.key)
        if (entry.key === this.state.activeKey || this.closing.has(entry.key) || live?.chats.some(c => c.isRunning)) return
        await Promise.all([
          this.services.invoke('devserver:stop', entry.root),
          this.services.invoke('agent:close-project', entry.root)
        ])
      })
    }
  }
  async close(key: string) {
    const entry = this.find(key)
    this.closing.add(key)
    const wasActive = this.state.activeKey === key
    if (wasActive) { ++this.intent; this.state.activeKey = null }
    this.state.projects = this.state.projects.filter(p => p !== entry)
    this.changed()
    try {
      await this.serialize(key, async () => {
        await this.services.invoke('devserver:stop', entry.root)
        if (entry.previewKind === 'simulator') await this.services.invoke('simulator:stop')
        await this.services.invoke('agent:close-project', entry.root)
        for (const session of entry.sessionKeys) this.services.closeChat(session)
      })
    } finally { this.closing.delete(key) }
    if (wasActive && this.state.activeKey === null) {
      const next = this.state.projects.at(-1)
      if (next) await this.select(next.key)
      else {
        await this.services.invoke('preview:reset')
        this.state.status = { kind: 'idle' }; this.changed(); await this.services.activate(null)
      }
    }
  }
}
