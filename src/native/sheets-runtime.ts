import { randomUUID } from 'node:crypto'
import type { NativeSheetAction, NativeSheetState } from '../shared/native-sheet'
import type { NativeBridge } from './bridge'
import type { NativeWorkspaceController } from './workspace-controller'
import type { NativeChatController } from './chat-controller'
import { dispatchIPC } from './platform'

/** Trusted app sheets use fixed operations, never renderer-supplied IPC names. */
export class NativeSheetController {
  generation = 0
  current: { state: NativeSheetState; handle(action: NativeSheetAction): Promise<void> } | null = null
  constructor(readonly host: Pick<NativeBridge, 'send'>, readonly workspace: NativeWorkspaceController, readonly chat: NativeChatController, readonly invoke = (channel: string, ...args: any[]) => dispatchIPC('main', { type: 'invoke', channel, args })) {}
  present(state: Omit<NativeSheetState, 'id' | 'busy'>, handle: (action: NativeSheetAction) => Promise<void>) {
    this.generation++
    if (this.current) this.host.send('sheetClose', { id: this.current.state.id })
    const value = { state: { ...state, id: randomUUID(), busy: false }, handle }
    this.current = value; this.host.send('sheetState', { state: value.state })
  }
  close() {
    this.generation++
    if (this.current) this.host.send('sheetClose', { id: this.current.state.id })
    this.current = null
  }
  async action(action: NativeSheetAction) {
    const sheet = this.current
    if (!sheet || action.id !== sheet.state.id) return
    if (action.action === 'cancel') { if (sheet.state.actions.length) this.close(); return }
    if (sheet.state.busy) return
    if (!sheet.state.actions.some(a => a.id === action.action)) return
    sheet.state.busy = true; sheet.state.message = undefined
    this.host.send('sheetState', { state: sheet.state })
    try { await sheet.handle(action) }
    catch (error) { sheet.state.message = String(error) }
    finally {
      if (this.current === sheet) { sheet.state.busy = false; this.host.send('sheetState', { state: sheet.state }) }
    }
  }
  renameChat(id: string, key: string) {
    const entry = this.workspace.state.projects.find(p => p.key === key)
    if (!entry) return
    const live = id.startsWith('chat:'), session = id.slice(live ? 5 : 8)
    const title = live ? this.chat.chats.get(session)?.title : this.workspace.state.history[key]?.find(r => r.id === session)?.title
    this.present({ title: 'Rename chat', detail: '', fields: [{ id: 'title', label: 'Name', kind: 'text', value: title || 'New chat' }], actions: [{ id: 'cancel', label: 'Cancel' }, { id: 'rename', label: 'Rename', primary: true }] }, async action => {
      const result = await this.invoke(live ? 'agent:rename-chat' : 'sessions:rename', session, action.values.title)
      if (!result.ok) throw new Error(result.error || 'Could not rename chat.')
      if (live) { const chat = this.chat.chats.get(session); if (chat) chat.title = result.title }
      this.workspace.state.history[key] = await this.invoke('sessions:list', entry.root)
      this.workspace.changed()
      if (this.current?.state.id === action.id) this.close()
    })
  }
  async memory(key: string) {
    const project = this.workspace.state.projects.find(p => p.key === key)
    if (!project) return
    const generation = this.generation
    const memory = await this.invoke('project-memory:get', project.root)
    if (generation !== this.generation) return
    this.present({
      title: project.name + ' memory',
      detail: 'Durable decisions shared with this project’s chats and background agents. Stored locally outside the repository.',
      fields: [{ id: 'content', label: 'Project memory', kind: 'multiline', value: memory.content }],
      actions: [{ id: 'cancel', label: 'Close' }, { id: 'save', label: 'Save', primary: true }]
    }, async action => {
      const content = action.values.content ?? ''
      if (content.length > 16000) throw new Error('Project memory is limited to 16,000 characters.')
      await this.invoke('project-memory:set', project.root, content)
      if (this.current?.state.id === action.id) this.current.state.message = 'Saved. Open chats receive the update on their next turn.'
    })
  }
  newProject() {
    if (this.current?.state.busy) return
    this.present({
      title: 'New project',
      detail: 'Choose a starting point, then a folder for your project.',
      fields: [
        { id: 'setup', label: 'Starting point', kind: 'choice', value: 'react', choices: [
          { value: 'react', label: 'React' }, { value: 'next', label: 'Plan a Next.js project' },
          { value: 'svelte', label: 'Plan a Svelte project' }, { value: 'custom', label: 'Choose with Praxis' }
        ] },
        { id: 'details', label: 'What would you like to build?', kind: 'multiline', value: '' }
      ],
      actions: [{ id: 'cancel', label: 'Cancel' }, { id: 'create', label: 'Choose folder…', primary: true }]
    }, async action => {
      const setup = action.values.setup
      if (!['react', 'next', 'svelte', 'custom'].includes(setup)) throw new Error('Choose a starting point.')
      const destination = await this.invoke('project:pick-new')
      if (!destination || this.current?.state.id !== action.id) return
      const result = await this.invoke('project:create', destination, { template: setup === 'react' ? 'react' : 'empty' })
      if (this.current?.state.id !== action.id) return
      if (!result.ok || !result.root) throw new Error(result.error || 'Could not create project')
      this.close()
      await this.workspace.command({ type: 'open', root: result.root })
      const project = this.workspace.active
      if (!project || project.root !== result.root) return
      const text = action.values.details?.trim() ?? ''
      if (setup === 'react') {
        if (text) await this.chat.command({ type: 'seed', chat: project.activeSessionKey, text })
      } else {
        const preference = setup === 'custom' ? 'Let’s plan a new project and choose the environment together.' : `Let’s plan a new ${setup === 'next' ? 'Next.js' : 'Svelte'} project.`
        await this.chat.command({ type: 'submit', chat: project.activeSessionKey, text: preference + ' Please ask me what I want to build and help me decide any remaining setup choices before creating the app.\n' + text })
      }
      if (result.warning) this.workspace.reportError(result.warning)
    })
  }
}
