import { formatTokens } from '../shared/run-stats'
import type { ModelChoice } from '../shared/api'
import type { NativeChatActivity, NativeChatCard, NativeChatState } from '../shared/native-chat'
import { providerOptions, resolveSelection } from '../shared/provider-choices'
import { parseSlashToken } from '../shared/slash-token'
import { rankSlashMatches } from '../shared/slash-menu'
import type { Chat } from './chat-state'
export const permissionModes = [
  { value: 'auto', label: 'Auto' }, { value: 'acceptEdits', label: 'Allow edits' }, { value: 'default', label: 'Ask always' }
]
export function matches(chat: Chat) {
  const token = parseSlashToken(chat.text, chat.caret)
  return token && !chat.dismissed ? rankSlashMatches(chat.commands, token.query) : []
}
function activity(chat: Chat): NativeChatActivity | null {
  if (!chat.isRunning) return null
  if (chat.stopping) return { kind: 'stopping', label: 'Stopping…', animated: false }
  if (chat.permissions.length) return { kind: 'waiting', label: 'Waiting for approval', animated: false }
  if (chat.questions.length) return { kind: 'waiting', label: 'Waiting for your answer', animated: false }
  if (chat.phase === 'applying') return { kind: 'applying', label: 'Applying changes…', animated: true }
  if (chat.phase === 'writing') return { kind: 'writing', label: 'Writing…', animated: true }
  if (chat.phase === 'working') return { kind: 'working', label: chat.activityDetail.trim() || 'Working…', animated: true }
  return { kind: 'thinking', label: 'Thinking…', animated: true }
}
export function snapshot(chat: Chat, choices: ModelChoice[]): NativeChatState {
  const providers = providerOptions(choices)
  const selection = resolveSelection(providers, chat.settings)
  const { provider, model, permissionMode } = chat.settings
  const cards: NativeChatCard[] = []
  if (chat.error) cards.push({ id: 'error', title: 'Unable to complete action', detail: chat.error, actions: [{ label: 'Dismiss', action: 'error-dismiss' }] })
  if (chat.pendingModel) cards.push({ id: 'model-confirm', title: 'Change model for this chat?', detail: 'The conversation will be preserved and the agent restarted with the selected model.', actions: [{ label: 'Cancel', action: 'model-cancel' }, { label: 'Change model', action: 'model-confirm' }] })
  const context = chat.context
  if (context?.setup.needed && !context.setup.dismissed) cards.push({ id: 'setup', title: 'Connect this project to Praxis', detail: context.setup.status ?? undefined, actions: [{ label: 'Not now', action: 'setup-dismiss', disabled: chat.setup }, { label: chat.setup ? 'Stop' : 'Set up', action: chat.setup ? 'stop' : 'setup', disabled: chat.isRunning && !chat.setup }] })
  if (!context?.setup.needed && context?.tokens.needed && !context.tokens.dismissed) cards.push({ id: 'tokens', title: 'Add a starter design-token palette?', actions: [{ label: 'Not now', action: 'tokens-dismiss' }, { label: 'Add tokens', action: 'tokens' }] })
  if (chat.isolation === 'parked') cards.push({ id: 'conflict', title: 'These edits need reconciliation', detail: chat.isolationFiles?.join('\n'), actions: [{ label: 'Discard', action: 'discard', disabled: chat.isRunning }, { label: 'Resolve', action: 'resolve', disabled: chat.isRunning }] })
  for (const p of chat.permissions) cards.push({ id: p.id, title: p.title, detail: p.detail, actions: [{ label: 'Deny', action: 'permission', value: 'deny' }, { label: 'Allow', action: 'permission', value: 'allow' }] })
  for (const n of context?.notes ?? []) cards.push({ id: n.id, title: 'Note', detail: n.text, actions: [{ label: 'Remove', action: 'remove-note' }] })
  if (context?.notes.length) cards.push({ id: 'notes-publish', title: 'Publish notes as a PR', actions: [{ label: 'Publish PR', action: 'publish-notes' }] })
  for (const q of chat.queue) cards.push({ id: `queued-${q.id}`, title: 'Queued message', detail: q.text || `${q.attachments.length} attachment(s)`, actions: [{ label: 'Remove', action: 'queue-remove' }] })
  if (chat.paused && chat.queue.length) cards.push({ id: 'queue-paused', title: 'Queue paused', actions: [{ label: 'Resume', action: 'queue-resume' }] })
  for (const spawn of context?.spawns ?? []) cards.push({ id: spawn.id, title: spawn.status === 'queued' ? 'Queued agent' : 'Background agent', detail: spawn.label, actions: [{ label: 'Cancel', action: 'spawn-stop' }] })
  const currentActivity = activity(chat)
  const thinking = !!currentActivity?.animated && currentActivity.kind !== 'applying'
  const stop = chat.isRunning && !chat.text.trim() && !chat.attachments.length
  return {
    activity: currentActivity, streamingId: chat.streamingId,
    chat: chat.chat, messages: chat.messages, running: chat.isRunning, cards, questions: chat.questions,
    status: `Chat total · ↑ ${formatTokens(chat.usage.input)}  ↓ ${formatTokens(chat.usage.output)}`,
    statusDetail: `Cumulative tokens across this chat’s model calls, not current context size.\nInput: ${chat.usage.input.toLocaleString('en-US')}\nCached input (included above): ${chat.usage.cached.toLocaleString('en-US')}\nOutput: ${chat.usage.output.toLocaleString('en-US')}`,
    composer: {
      text: chat.text, caret: chat.caret, revision: chat.revision, stop,
      ready: chat.ready && !chat.switching, running: chat.isRunning, thinking,
      enabled: chat.ready && (stop || (!chat.switching && (!!chat.text.trim() || !!chat.attachments.length))),
      sendLabel: stop ? 'Stop' : chat.isRunning ? 'Queue message' : 'Send message',
      context: context?.selection?.label ?? '', attachments: chat.attachments.map(a => `Remove ${a.name || 'image'}`),
      suggestions: matches(chat).map((command, index) => ({ title: `/${command.name}`, description: command.description ?? '', active: index === chat.menuIndex })),
      choices: [
        { label: 'Provider', value: selection.option?.key ?? provider, disabled: !chat.ready || chat.isRunning || chat.switching, options: providers.length ? providers.map(p => ({ value: p.key, label: p.label })) : [{ value: provider, label: provider === 'codex' ? 'Codex' : 'Claude' }] },
        { label: 'Model', value: selection.choice?.value ?? model, disabled: !chat.ready || chat.isRunning || chat.switching, options: selection.option?.models.map(c => ({ value: c.value, label: c.label })) ?? [{ value: model, label: model === 'default' ? 'Default' : model }] },
        { label: 'Permission mode', value: permissionMode, disabled: !chat.ready || chat.switching, options: permissionModes }
      ]
    }
  }
}
