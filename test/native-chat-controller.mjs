import assert from 'node:assert/strict'
import { assertChatCommandScope } from '../src/shared/chat-command-scope.ts'
import { NativeChatController } from '../src/native/chat-controller.ts'

const tick = () => new Promise(resolve => setTimeout(resolve, 0))
const calls = [], renders = [], effects = []
const context = chat => ({ chat, root: '/fixture', selection: null, turn: {}, setup: { needed: false, dismissed: false, status: null }, tokens: { needed: false, dismissed: false }, notes: [], spawns: [] })
const live = chat => ({ sessionKey: chat, record: { transcript: [], title: 'Restored' }, isRunning: false, options: { provider: 'codex', permissionMode: 'auto' } })
let snapshot = { projects: [{ root: '/fixture', chats: [live('a'), live('b')] }] }
let rejectModel = false, failSend = false
const controller = new NativeChatController({
  invoke: async (channel, ...args) => {
    calls.push([channel, ...args])
    if (channel === 'agent:workspace-snapshot') return snapshot
    if (channel === 'providers:choices') return [
      { value: 'codex:default', modelId: 'default', provider: 'codex', group: 'Codex', label: 'Default' },
      { value: 'codex:other', modelId: 'other', provider: 'codex', group: 'Codex', label: 'Other model' }
    ]
    if (channel === 'agent:restart-chat') return { ok: !rejectModel, error: rejectModel ? 'Cannot restart' : undefined }
    if (channel === 'agent:send' && failSend) throw new Error('Provider unavailable')
    return { ok: true }
  },
  render: state => renders.push(structuredClone(state)),
  effect: effect => effects.push(structuredClone(effect))
})
await controller.refreshChoices()
await controller.command({ type: 'context', context: context('a') })
assert.equal(controller.get('a').settings.provider, 'codex')
let rev = 0
const input = (text, chat = controller.active) => controller.composer({ chat, action: 'input', text, caret: text.length, revision: ++rev })
const send = () => controller.composer({ chat: controller.active, action: 'send' })
const emit = event => controller.event({ projectKey: 'a', ...event })
await input('draft for a')
await controller.command({ type: 'context', context: context('b') })
await input('draft for b')
await controller.composer({ chat: 'a', action: 'input', text: 'stale event', caret: 11, revision: 100 })
assert.equal(controller.get('a').text, 'draft for a')
await controller.command({ type: 'context', context: context('a') })
assert.equal(renders.at(-1).composer.text, 'draft for a')
emit({ type: 'commands', commands: [{ name: 'design', description: 'Design skill', source: 'project' }] })
await input('/des')
assert.equal(renders.at(-1).composer.suggestions[0].title, '/design')
await controller.composer({ chat: 'a', action: 'key', key: 'Tab' })
assert.equal(controller.get('a').text, '/design ')
assert.equal(renders.at(-1).composer.suggestions.length, 0)
await input('First')
await send(); await tick()
assert.equal(calls.filter(c => c[0] === 'agent:send').length, 1)
assert.equal(controller.get('a').text, '')
assert.equal(controller.get('a').isRunning, true)
emit({ type: 'delta', text: 'Before' })
emit({ type: 'status', text: 'Reading' })
emit({ type: 'delta', text: 'After' })
assert.deepEqual(controller.get('a').messages.at(-1).segments.map(s => s.kind), ['text', 'tools', 'text'])
emit({ type: 'delta', text: 'DETACHED', sessionId: 'spawn' })
assert.equal(controller.get('a').messages.at(-1).text, 'BeforeAfter')
await input('Second'); await send()
assert.equal(controller.get('a').queue.length, 1)
await controller.command({ type: 'context', context: context('b') })
emit({ type: 'done', landingPending: true }); await tick()
assert.equal(calls.filter(c => c[0] === 'agent:send').length, 1)
emit({ type: 'landing-finished' }); await tick()
assert.equal(calls.filter(c => c[0] === 'agent:send').length, 2)
assert.equal(calls.filter(c => c[0] === 'agent:send').at(-1)[3], 'a')
assert.equal(renders.at(-1).chat, 'b')
await controller.command({ type: 'context', context: context('a') })
await input('Third'); await send()
await controller.action({ chat: 'a', action: 'stop' })
assert.deepEqual(calls.at(-1), ['agent:interrupt', 'a'])
emit({ type: 'done' }); await tick()
assert.equal(controller.get('a').queue.length, 1)
await controller.action({ chat: 'a', action: 'queue-resume' }); await tick()
assert.equal(controller.get('a').queue.length, 0)
emit({ type: 'error', message: 'failed' }); emit({ type: 'done' }); await tick()
assert.equal(controller.get('a').paused, true)
emit({ type: 'permission-request', request: { id: 'p', sessionKey: 'a', title: 'Allow?', toolName: 'Read' } })
const before = calls.length
await controller.action({ chat: 'b', action: 'permission', id: 'p', value: 'allow' })
assert.equal(calls.length, before)
await controller.action({ chat: 'a', action: 'permission', id: 'p', value: 'deny' })
assert.equal(controller.get('a').permissions.length, 0)
emit({ type: 'question-request', request: { id: 'q', sessionKey: 'a', questions: [] } })
await controller.action({ chat: 'a', action: 'question', id: 'q', answers: null })
assert.deepEqual(calls.at(-1), ['agent:respond-question', 'q', null])
await controller.composer({ chat: 'a', action: 'choice', label: 'Permission mode', value: 'default' })
assert.deepEqual(calls.at(-1), ['agent:set-permission-mode', 'default', 'a'])
assert.equal(controller.get('a').settings.permissionMode, 'default')
await controller.composer({ chat: 'a', action: 'choice', label: 'Model', value: 'codex:other' })
assert.ok(controller.get('a').pendingModel)
rejectModel = true
await controller.action({ chat: 'a', action: 'model-confirm' })
assert.equal(controller.get('a').settings.model, 'default')
assert.match(controller.get('a').error, /Cannot restart/)
assert.equal(controller.get('a').switching, false)
rejectModel = false
await controller.composer({ chat: 'a', action: 'choice', label: 'Model', value: 'codex:other' })
await controller.action({ chat: 'a', action: 'model-confirm' })
assert.equal(controller.get('a').settings.model, 'codex:other')
// Queued context is immutable when the selection/draft/project changes.
const selected = context('a')
selected.selection = { label: 'button', prompt: 'Selected button. ', bubble: { tag: 'button', ident: '#save', source: null } }
await controller.command({ type: 'context', context: selected })
await input('With context'); await send(); await tick()
assert.equal(calls.filter(c => c[0] === 'agent:send').at(-1)[1], 'Selected button. With context')
await input('Never send after close'); await send()
const count = calls.filter(c => c[0] === 'agent:send').length
controller.close('a')
emit({ type: 'done' }); await tick()
assert.equal(calls.filter(c => c[0] === 'agent:send').length, count)
// Transcripts initialize from the service, with no React/window object present.
snapshot.projects[0].chats.push({ ...live('restored'), record: { transcript: [{ role: 'user', text: 'Prior message' }, { role: 'assistant', text: 'Prior reply' }] } })
await controller.command({ type: 'context', context: context('restored') })
assert.deepEqual(controller.get('restored').messages.map(m => m.text), ['Prior message', 'Prior reply'])
failSend = true
await input('Fail this'); await send(); await tick()
assert.equal(controller.get('restored').isRunning, false)
assert.match(controller.get('restored').messages.at(-1).text, /Provider unavailable/)
console.log('Native Bun chat controller: drafts, skills, restore, stream isolation, queues, cancellation, permissions, questions, models, context and errors passed.')

// Adding explicit chat targets must not widen the browser server's root scope.
for (const [channel, index] of [['agent:send', 2], ['agent:set-permission-mode', 1], ['agent:interrupt', 0], ['agent:resolve-conflict', 0], ['agent:discard-conflict', 0]]) {
  const args = Array(index).fill('unused')
  assert.doesNotThrow(() => assertChatCommandScope('/fixture', channel, args))
  assert.doesNotThrow(() => assertChatCommandScope('/fixture', channel, [...args, '/fixture#peer']))
  for (const key of ['/another', '/fixture-elsewhere#peer', null, 2]) {
    assert.throws(() => assertChatCommandScope('/fixture', channel, [...args, key]), /outside/)
  }
}

// Stop during clipboard materialization must prevent the provider call.
let resolveAttachment
const attachmentReady = new Promise(resolve => { resolveAttachment = resolve })
const invokeBeforeAttachment = controller.services.invoke
failSend = false
controller.services.invoke = (channel, ...args) => channel === 'attachments:save' ? attachmentReady : invokeBeforeAttachment(channel, ...args)
await controller.composer({ chat: 'restored', action: 'files', files: [{ name: 'clipboard.png', path: '', type: 'image/png', data: 'AA==' }] })
await input('Clipboard'); await send()
const sendCount = calls.filter(c => c[0] === 'agent:send').length
await controller.action({ chat: 'restored', action: 'stop' })
resolveAttachment('/tmp/clipboard.png'); await tick()
assert.equal(calls.filter(c => c[0] === 'agent:send').length, sendCount)
assert.equal(controller.get('restored').isRunning, false)
controller.services.invoke = invokeBeforeAttachment
// Renderer reload can reattach a fresh mirror without losing native drafts.
await input('Survives renderer reload')
const effectCount = effects.filter(e => e.type === 'mirror').length
await controller.command({ type: 'attach' })
assert.ok(effects.filter(e => e.type === 'mirror').length > effectCount)
assert.equal(controller.get('restored').text, 'Survives renderer reload')
// A delayed snapshot for a closed instance cannot initialize a replacement chat.
const delayed = []
const racing = new NativeChatController({
  invoke: () => new Promise(resolve => delayed.push(resolve)), render() {}, effect() {}
})
const first = racing.command({ type: 'context', context: context('a') })
racing.close('a')
const second = racing.command({ type: 'context', context: context('a') })
delayed[0]({ projects: [{ root: '/fixture', chats: [{ ...live('a'), record: { transcript: [{ role: 'user', text: 'stale' }] } }] }] })
await first
assert.equal(racing.get('a').ready, false)
delayed[1]({ projects: [{ root: '/fixture', chats: [live('a')] }] })
await second
assert.equal(racing.get('a').ready, true)
assert.deepEqual(racing.get('a').messages, [])
console.log('Native controller: root scoping, clipboard cancellation, renderer reattach and close/reopen race passed.')
