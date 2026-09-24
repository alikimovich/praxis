import type { NativeChatAction } from '../shared/native-chat'
import { setupPrompt } from '../shared/setup-prompt'
import { assistant, type Chat } from './chat-state'
import type { NativeChatController } from './chat-controller'

/** Card actions call application services directly; shell effects only refresh web panels. */
export async function cardAction(controller: NativeChatController, chat: Chat, action: NativeChatAction) {
  const { invoke, effect } = controller.services
  switch (action.action) {
    case 'error-dismiss': chat.error = undefined; break
    case 'model-cancel': chat.pendingModel = undefined; break
    case 'model-confirm': {
      const settings = chat.pendingModel; chat.pendingModel = undefined
      if (settings) await controller.changeModel(chat, settings)
      break
    }
    case 'permission':
      if (!chat.permissions.some(p => p.id === action.id) || (action.value !== 'allow' && action.value !== 'deny')) return
      await invoke('agent:respond-permission', action.id, action.value)
      chat.permissions = chat.permissions.filter(p => p.id !== action.id)
      break
    case 'question':
      if (!chat.questions.some(q => q.id === action.id)) return
      await invoke('agent:respond-question', action.id, action.answers ?? null)
      chat.questions = chat.questions.filter(q => q.id !== action.id)
      break
    case 'queue-remove': chat.queue = chat.queue.filter(q => `queued-${q.id}` !== action.id); break
    case 'queue-resume': chat.paused = false; void controller.drain(chat); break
    case 'stop': await controller.stop(chat); break
    case 'spawn-stop':
      if (chat.context?.spawns.some(s => s.id === action.id)) await invoke('agent:spawn-interrupt', action.id)
      break
    case 'revert': {
      const message = chat.messages.find(m => m.id === action.id)
      if (!message?.revertGroup) return
      const result = await invoke('edit:revert', chat.root, message.revertGroup)
      if (!result.ok) throw new Error('Unable to revert edits because files have changed since this turn.')
      message.revertGroup = undefined
      break
    }
    case 'resolve': {
      if (chat.isRunning || chat.sending) return
      const result = await invoke('agent:resolve-conflict', chat.chat)
      if (!result.ok) throw new Error(result.error ?? 'Unable to resolve changes.')
      if (result.prompt && result.conflicted.length) await controller.run(chat, { id: crypto.randomUUID(), text: result.prompt, attachments: [], selection: null, turn: {} })
      break
    }
    case 'discard':
      if (!chat.isRunning && !chat.sending) await invoke('agent:discard-conflict', chat.chat)
      break
    case 'setup-dismiss':
      if (chat.setup) return
      if (chat.context) chat.context.setup.dismissed = true
      effect({ type: 'setup', chat: chat.chat, phase: 'dismissed' }); break
    case 'setup': {
      if (!chat.ready || chat.setup || chat.isRunning || chat.sending) return
      chat.setup = true; chat.sending = true; controller.changed(chat)
      const cancellation = chat.cancellation
      try {
        const result = await invoke('setup:scaffold', chat.root)
        if (!result.ok) throw new Error(result.error ?? 'Setup failed.')
        const prompt = setupPrompt(result)
        if (!prompt) throw new Error(`Automatic source mapping is unavailable for ${result.framework ?? 'this framework'}.`)
        if (chat.cancellation !== cancellation || controller.chats.get(chat.chat) !== chat) return
        chat.isRunning = true; chat.turnStartedAt = Date.now(); assistant(chat)
        effect({ type: 'setup', chat: chat.chat, phase: 'configuring' }); controller.changed(chat)
        await invoke('agent:send', prompt, undefined, chat.chat)
      } catch (error) {
        chat.setup = false; chat.isRunning = false
        effect({ type: 'setup', chat: chat.chat, phase: 'failed', status: String(error) })
        throw error
      } finally { chat.sending = false; void controller.drain(chat) }
      break
    }
    case 'tokens': {
      const result = await invoke('tokens:scaffold', chat.root)
      if (!result.ok) throw new Error(result.error ?? 'Unable to add tokens.')
      if (chat.context) chat.context.tokens.needed = false
      effect({ type: 'tokens', root: chat.root }); break
    }
    case 'tokens-dismiss':
      if (chat.context) chat.context.tokens.dismissed = true
      effect({ type: 'tokens', root: chat.root }); break
    case 'remove-note':
      if (!chat.context?.notes.some(n => n.id === action.id)) return
      await invoke('annotations:remove', chat.root, action.id)
      chat.context.notes = chat.context.notes.filter(n => n.id !== action.id)
      effect({ type: 'notes', root: chat.root }); break
    case 'publish-notes': {
      const result = await invoke('publish:to-pr', chat.root, { title: 'praxis: design handoff' })
      if (!result.ok) throw new Error(result.error ?? 'Publish failed.')
      if (result.url) await invoke('agent:tag-session', chat.root, { prUrl: result.url })
      break
    }
  }
}
