import { chatAgentSettingsFromOptions } from '../shared/chat-settings'
import type { AgentEvent } from '../shared/api'
import type { NativeBridge } from './bridge'
import { NativeChatController } from './chat-controller'
import { dispatchIPC, serviceEvents, type NativeView } from './platform'

export let nativeChat: NativeChatController
export function installNativeChat(host: NativeBridge, view: NativeView) {
  nativeChat = new NativeChatController({
    invoke: (channel, ...args) => dispatchIPC('main', { type: 'invoke', channel, args }),
    render: state => host.send('chatState', { state }),
    effect: effect => {
      if (effect.type === 'focus') host.send('composerFocus')
    }
  })
  host.on('composer-action', action => { void nativeChat.composer(action) })
  host.on('chat-action', action => { void nativeChat.action(action) })
  serviceEvents.on('event', (channel: string, event: AgentEvent) => {
    if (channel === 'agent:event') nativeChat.event(event)
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
