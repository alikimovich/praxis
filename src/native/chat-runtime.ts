import { join } from 'node:path'
import { ChatIslands, installChatIslands } from '../main/chat-islands'
import type { NativeChatSnapshot } from '../shared/native-chat-controller'
import { app, views } from './platform'
import { chatAgentSettingsFromOptions } from '../shared/chat-settings'
import type { AgentEvent } from '../shared/api'
import type { NativeBridge } from './bridge'
import { NativeChatController } from './chat-controller'
import { dispatchIPC, serviceEvents, type NativeView } from './platform'

export let nativeIslands: ChatIslands
export let nativeChat: NativeChatController
export function installNativeChat(host: NativeBridge, view: NativeView) {
  const islands = new ChatIslands(join(app.getPath('userData'), 'chat-islands'), key => {
    const chat = nativeChat.chats.get(key)
    if (chat) nativeChat.changed(chat)
  })
  nativeIslands = islands
  installChatIslands(islands)
  const renderIslands = (state: NativeChatSnapshot) => {
    const messages = state.messages.map(message => ({ ...message, segments: [...message.segments] }))
    for (const attachment of islands.attachments(state.chat)) {
      let turn = 0
      const message = messages.find(message => {
        if (message.role === 'user') turn++
        return message.role === 'assistant' && turn === attachment.turn
      })
      if (message && attachment.view) message.segments.push({ kind: 'island', island: attachment.view })
    }
    return { ...state, messages }
  }
  nativeChat = new NativeChatController({
    restoreIslands: (key, root, recordId) => islands.register(key, root, recordId, () => nativeChat.get(key).messages.filter(m => m.role === 'user').length),
    invoke: (channel, ...args) => dispatchIPC('main', { type: 'invoke', channel, args }),
    render: state => host.send('chatState', { state: renderIslands(state) }),
    effect: effect => {
      if (effect.type === 'focus') host.send('composerFocus')
    }
  })
  host.on('island-action', command => {
    if (command.chat !== nativeChat.active || !nativeChat.chats.has(command.chat)) return
    const chat = nativeChat.get(command.chat)
    void (async () => {
      try {
        if (command.action === 'replay') {
          const record = islands.sessions.get(command.chat)?.records.find(r => r.id === command.id && r.revision === command.revision && r.status === 'ready')
          if (!record?.manifest.replay) throw new Error('Replay is unavailable.')
          views.get('preview')?.webContents.send('preview:animation-replay', record.manifest.component)
        } else await islands.interact(command)
      } catch (error) { chat.error = String(error); nativeChat.changed(chat) }
    })()
  })
  const stop = nativeChat.stop.bind(nativeChat)
  nativeChat.stop = async chat => { try { await islands.settle(chat.chat, false) } finally { await stop(chat) } }
  const close = nativeChat.close.bind(nativeChat)
  nativeChat.close = key => { islands.close(key); close(key) }
  host.on('composer-action', action => { void nativeChat.composer(action) })
  host.on('chat-action', action => { void nativeChat.action(action) })
  serviceEvents.on('event', (channel: string, event: AgentEvent) => {
    if (channel === 'agent:event') {
      nativeChat.event(event)
      const key = event.projectKey
      if (key && !event.sessionId) {
        const terminal = event.type === 'error' || event.type === 'isolation' && event.state === 'parked'
        const success = event.type === 'isolation' && event.state === 'merged' || event.type === 'done' && !event.landingPending
        if (terminal || success) void islands.settle(key, !terminal).catch(error => {
          const chat = nativeChat.chats.get(key); if (chat) { chat.error = String(error); nativeChat.changed(chat) }
        })
      }
    }
  })
  serviceEvents.on('command', (channel: string, args: any[], result: any) => {
    if (channel === 'agent:close-chat' && result.ok) nativeChat.close(args[1])
    else if (channel === 'agent:close-project') {
      for (const [key, chat] of nativeChat.chats) if (chat.root === args[0]) nativeChat.close(key)
    } else if (channel === 'agent:rename-chat' && result.ok) {
      const chat = nativeChat.get(args[0]); chat.title = result.title; nativeChat.changed(chat)
    } else if (channel === 'agent:restart-chat' && result.ok) {
      const chat = nativeChat.chats.get(args[1])
      if (chat) { chat.settings = chatAgentSettingsFromOptions(args[2]); nativeChat.changed(chat) }
    } else if (channel === 'agent:open-project' || channel === 'agent:new-chat' || channel === 'agent:resume-session') {
      // The shell may publish context before the session-creation reply arrives.
      for (const chat of nativeChat.chats.values()) if (!chat.ready && chat.context?.root === args[0]) void nativeChat.initialize(chat)
    } else if (channel.startsWith('providers:') && channel !== 'providers:choices' && channel !== 'providers:list') {
      void nativeChat.refreshChoices()
    }
  })
  void nativeChat.refreshChoices()
  return nativeChat
}
