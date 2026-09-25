import { parsePreferredModelState, rememberLastUsed, resolvePreferredSettings } from '../shared/preferred-model'
import type { nativePreferences } from './preferences'
import type { NativeBridge } from './bridge'
import type { NativeChatController } from './chat-controller'
import { NativeWorkspaceController } from './workspace-controller'
import { dispatchIPC, ipcMain, type NativeView } from './platform'
import type { NativeWorkspaceCommand } from '../shared/native-workspace'
import type { NativeShellAction } from '../shared/native-shell'

export let nativeWorkspace: NativeWorkspaceController
export function installNativeWorkspace(host: NativeBridge, view: NativeView, storage: { read(): string | null; write(raw: string): void }, chat: NativeChatController, preferences: ReturnType<typeof nativePreferences>) {
  const invoke = (channel: string, ...args: any[]) => dispatchIPC('main', { type: 'invoke', channel, args })
  nativeWorkspace = new NativeWorkspaceController({
    invoke, read: storage.read, write: storage.write,
    render: state => view.webContents.send('native-workspace:state', state),
    closeChat: key => chat.close(key),
    reusableChat: key => { const value = chat.chats.get(key); return !value || (!value.text && !value.messages.length && !value.attachments.length) },
    activate: async entry => {
      const key = entry?.activeSessionKey ?? ''
      const previous = chat.chats.get(key)?.context
      await chat.command({ type: 'context', context: {
        chat: key, root: entry?.root ?? null, selection: null, turn: {},
        setup: { needed: false, dismissed: false, status: null },
        tokens: { needed: false, dismissed: false }, notes: [], spawns: [],
        ...(previous?.root === entry?.root ? previous : {})
      } })
    }
  })
  const originalEffect = chat.services.effect
  chat.services.effect = effect => {
    if (effect.type === 'settings') {
      const entry = nativeWorkspace.state.projects.find(p => p.root === effect.root)
      if (entry) {
        entry.chatSettings = { ...entry.chatSettings, [effect.chat]: effect.settings }
        let raw: unknown
        try { raw = JSON.parse(preferences.get('praxis:preferred-model') ?? 'null') } catch {}
        const preferred = rememberLastUsed(parsePreferredModelState(raw), effect.settings)
        preferences.set('praxis:preferred-model', JSON.stringify(preferred))
        nativeWorkspace.preferred = resolvePreferredSettings(preferred)
        nativeWorkspace.changed()
      }
    }
    originalEffect(effect)
  }
    ipcMain.handle('native-workspace:command', async (event, command: NativeWorkspaceCommand) => {
    if (event.sender !== view.webContents) throw new Error('Workspace commands require the main UI')
    await nativeWorkspace.command(command)
  })
  const run = (command: NativeWorkspaceCommand) => { void nativeWorkspace.command(command).catch(error => nativeWorkspace.reportError(error)) }
  host.on('recent', ({ root }) => run({ type: 'open', root }))
  host.on('menu', ({ action }) => { if (action === 'open-project') run({ type: 'open' }) })
  host.on('shell-action', (action: NativeShellAction) => {
    const key = action.project ?? nativeWorkspace.state.activeKey
    if (!key) return
    if (action.action === 'new-chat') run({ type: 'new-chat', key })
    else if (action.action === 'select' && action.id?.startsWith('project:')) run({ type: 'select', key })
    else if (action.action === 'select' && action.id?.startsWith('chat:')) run({ type: 'chat', key, session: action.id.slice(5) })
    else if (action.action === 'close' && action.id?.startsWith('project:')) run({ type: 'close', key })
    else if (action.action === 'close' && action.id?.startsWith('chat:')) run({ type: 'close-chat', key, session: action.id.slice(5) })
  })
  return nativeWorkspace
}
export function workspaceOwnsAction(action: NativeShellAction) {
  return action.action === 'new-chat' || (['select', 'close'].includes(action.action) && /^(project|chat):/.test(action.id ?? ''))
}
