import { formatTokens, isEmptyUsage, type TokenUsage } from '../shared/run-stats'
import type { ModelChoice } from '../shared/api'
import type { NativeChatActivity, NativeChatCard, NativeChatState } from '../shared/native-chat'
import { providerOptions, resolveSelection } from '../shared/provider-choices'
import { parseSlashToken } from '../shared/slash-token'
import { rankSlashMatches } from '../shared/slash-menu'
import type { Chat } from './chat-state'
import { loginCard } from './chat-login'
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
/** A turn's counter, shown after its live status and then under its Copy/Revert row. */
export function tokens(turn: TokenUsage, total: TokenUsage) {
  const n = (v: number) => v.toLocaleString('en-US')
  return {
    label: `↑ ${formatTokens(turn.input)}  ↓ ${formatTokens(turn.output)}`,
    detail: `Tokens across this turn’s model calls, not current context size.\nInput: ${n(turn.input)}\nCached input (included above): ${n(turn.cached)}\nOutput: ${n(turn.output)}\nThis chat so far: ${n(total.input)} input, ${n(total.output)} output`
  }
}
export function snapshot(chat: Chat, choices: ModelChoice[]): NativeChatState {
  const providers = providerOptions(choices)
  const selection = resolveSelection(providers, chat.settings)
  const { provider, model, permissionMode } = chat.settings
  const cards: NativeChatCard[] = []
  if (chat.error) cards.push({ id: 'error', title: 'Unable to complete action', detail: chat.error, actions: [{ label: 'Dismiss', action: 'error-dismiss' }] })
  const login = loginCard(chat)
  if (login) cards.push(login)
  if (chat.pendingModel) cards.push({ id: 'model-confirm', title: 'Change model for this chat?', detail: 'The conversation will be preserved and the agent restarted with the selected model.', actions: [{ label: 'Cancel', action: 'model-cancel' }, { label: 'Change model', action: 'model-confirm' }] })
  const context = chat.context
  if (context?.setup.needed && !context.setup.dismissed) cards.push({ id: 'setup', title: 'Connect this project to Trezi', detail: context.setup.status ?? undefined, actions: [{ label: 'Not now', action: 'setup-dismiss', disabled: chat.setup }, { label: chat.setup ? 'Stop' : 'Set up', action: chat.setup ? 'stop' : 'setup', disabled: chat.isRunning && !chat.setup }] })
  if (!context?.setup.needed && context?.tokens.needed && !context.tokens.dismissed) cards.push({ id: 'tokens', title: 'Add a starter design-token palette?', actions: [{ label: 'Not now', action: 'tokens-dismiss' }, { label: 'Add tokens', action: 'tokens' }] })
  if (chat.isolation === 'parked') cards.push({ id: 'conflict', title: 'These edits need reconciliation', detail: chat.isolationFiles?.join('\n'), actions: [{ label: 'Discard', action: 'discard', disabled: chat.isRunning }, { label: 'Resolve', action: 'resolve', disabled: chat.isRunning }] })
  for (const p of chat.permissions) cards.push({ id: p.id, title: p.title, detail: p.detail, actions: [{ label: 'Deny', action: 'permission', value: 'deny' }, { label: 'Allow', action: 'permission', value: 'allow' }] })
  for (const n of context?.notes ?? []) cards.push({ id: n.id, title: 'Note', detail: n.text, actions: [{ label: 'Remove', action: 'remove-note' }] })
  if (context?.notes.length) cards.push({ id: 'notes-publish', title: 'Publish notes as a PR', actions: [{ label: 'Publish PR', action: 'publish-notes' }] })
  for (const spawn of context?.spawns ?? []) cards.push({ id: spawn.id, title: spawn.status === 'queued' ? 'Queued agent' : 'Background agent', detail: [spawn.label, spawn.activity].filter(Boolean).join('\n\n'), actions: [{ label: 'Cancel', action: 'spawn-stop' }] })
  const currentActivity = activity(chat)
  const thinking = !!currentActivity?.animated && currentActivity.kind !== 'applying'
  const stop = chat.isRunning && !chat.text.trim() && !chat.attachments.length
  return {
    activity: currentActivity, streamingId: chat.streamingId,
    chat: chat.chat, running: chat.isRunning, cards, questions: chat.questions,
    messages: chat.messages.map(message => message.usage && !isEmptyUsage(message.usage) ? { ...message, tokens: tokens(message.usage, chat.usage) } : message),
    composer: {
      queue: chat.queue.map(q => ({ id: `queued-${q.id}`, text: q.text, attachments: q.attachments.length })),
      queuePaused: chat.paused,
      text: chat.text, caret: chat.caret, revision: chat.revision, stop,
      ready: chat.ready && !chat.switching, running: chat.isRunning, thinking,
      enabled: chat.ready && (stop || (!chat.switching && (!!chat.text.trim() || !!chat.attachments.length))),
      sendLabel: stop ? 'Stop' : chat.isRunning ? 'Queue message' : 'Send message',
      context: context?.selection?.label ?? '', attachments: chat.attachments.map(a => ({ id: a.id, name: a.name || 'Image', type: a.type, data: a.data })),
      suggestions: matches(chat).map((command, index) => ({ title: `/${command.name}`, description: command.description ?? '', active: index === chat.menuIndex })),
      choices: [
        { label: 'Provider', value: selection.option?.key ?? provider, disabled: !chat.ready || chat.isRunning || chat.switching, options: providers.length ? providers.map(p => ({ value: p.key, label: p.label })) : [{ value: provider, label: provider === 'codex' ? 'Codex' : 'Claude' }] },
        { label: 'Model', value: selection.choice?.value ?? model, disabled: !chat.ready || chat.isRunning || chat.switching, options: selection.option?.models.map(c => ({ value: c.value, label: c.label })) ?? [{ value: model, label: model === 'default' ? 'Default' : model }] },
        { label: 'Permission mode', value: permissionMode, disabled: !chat.ready || chat.switching, options: permissionModes }
      ]
    }
  }
}
