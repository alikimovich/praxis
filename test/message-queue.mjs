import assert from 'node:assert/strict'
import { drainMessages, useMessageQueue } from '../src/renderer/src/message-queue.ts'

const queue = useMessageQueue.getState()
const states = { a: { isRunning: true, isolation: 'isolated' }, b: { isRunning: false, isolation: 'live' } }
const sent = []
const add = (key, label, fail = false) => queue.add({ key, label, run: async () => {
  sent.push([key, label])
  if (fail) throw new Error('transport failed')
  states[key].isRunning = true
} })
const settle = () => new Promise((resolve) => setTimeout(resolve, 0))
add('a', 'first')
add('a', 'second')
add('b', 'background')
drainMessages(states)
await settle()
assert.deepEqual(sent, [['b', 'background']], 'a running chat must retain its queue; another chat can send')
states.a.isRunning = false
drainMessages(states)
drainMessages(states)
await settle()
assert.deepEqual(sent.at(-1), ['a', 'first'])
assert.equal(sent.length, 2, 'only one message per chat may dispatch')
queue.pause('a', true)
states.a.isRunning = false
drainMessages(states)
await settle()
assert.equal(sent.length, 2, 'Stop/error pauses pending messages')
queue.pause('a', false)
states.a.isolation = 'parked'
drainMessages(states)
assert.equal(sent.length, 2, 'conflicts pause dispatch')
states.a.isolation = 'isolated'
drainMessages(states)
await settle()
assert.deepEqual(sent.at(-1), ['a', 'second'], 'FIFO survives pause/resume')
states.a.isRunning = false
add('a', 'retry me', true)
drainMessages(states)
await settle()
assert.equal(useMessageQueue.getState().messages[0].label, 'retry me')
assert.equal(useMessageQueue.getState().paused.a, true, 'failed sends remain available for retry')
queue.remove(useMessageQueue.getState().messages[0].id)
assert.equal(useMessageQueue.getState().messages.length, 0)
add('a', 'closed draft')
queue.clear('a')
assert.equal(useMessageQueue.getState().messages.length, 0)
assert.equal(useMessageQueue.getState().paused.a, undefined)
console.log('MESSAGE QUEUE OK — FIFO, chat isolation, pause/resume, conflict, retry, removal, close')

// Snapshot context and the chat destination before asynchronous image saving.
globalThis.window = {}
const { messageSender } = await import('../src/renderer/src/message-send.ts')
const { useChat } = await import('../src/renderer/src/store.ts')
const selected = (id) => ({ tag: 'button', id, classes: [], selector: '#' + id, source: 'src/App.tsx:12', componentSource: null, text: id, rect: { x: 0, y: 0, width: 20, height: 20 }, styles: {} })
const first = selected('first')
const second = selected('second')
let saveImage
const calls = []
window.api = { agent: {
  saveAttachment: () => new Promise((resolve) => { saveImage = resolve }),
  send: async (...args) => { calls.push(args) }
} }
useChat.getState().setActiveChat('origin')
const send = messageSender('origin', 'Make both larger', [
  { id: 'file', kind: 'file', name: 'notes.txt', path: '/tmp/notes.txt' },
  { id: 'image', kind: 'image', name: 'shot.png', path: '', mediaType: 'image/png', data: 'bytes', url: 'data:image/png;base64,bytes' }
], { ...second, selectionGroup: [first, second] })
const sending = send()
useChat.getState().setActiveChat('other')
saveImage('/tmp/shot.png')
await sending
assert.equal(calls[0][2], 'origin', 'a switch during attachment saving must not redirect the message')
for (const context of ['#first', '#second', '/tmp/notes.txt', '/tmp/shot.png', 'Make both larger']) assert(calls[0][0].includes(context))
assert.deepEqual(calls[0][1], [{ mediaType: 'image/png', data: 'bytes' }])
assert.equal(useChat.getState().byKey.other.messages.length, 0)
assert.equal(useChat.getState().byKey.origin.messages[0].selection.tag, '2 objects')
assert.equal(useChat.getState().byKey.origin.messages[0].attachments.length, 2)

// A late merge tags the completed response, not the queued turn now streaming.
const chat = useChat.getState()
chat.appendDelta('Completed change', 'origin')
chat.finish('origin')
chat.startAssistant('origin')
chat.tagRevert('origin', 'first-group')
const responses = useChat.getState().byKey.origin.messages.filter((m) => m.role === 'assistant')
assert.equal(responses[0].revertGroup, 'first-group')
assert.equal(responses[1].revertGroup, undefined)
console.log('MESSAGE CONTEXT OK — multi-selection, attachment snapshot, async chat switch, merge undo target')
const stoppedSend = messageSender('origin', 'Do not send after Stop', [
  { id: 'image', kind: 'image', name: 'shot.png', path: '', mediaType: 'image/png', data: 'bytes', url: 'data:image/png;base64,bytes' }
], null)()
useMessageQueue.getState().pause('origin', true)
saveImage('/tmp/late-shot.png')
await assert.rejects(stoppedSend, /cancelled before sending/)
assert.equal(calls.length, 1, 'Stop during attachment saving must prevent the late send')
console.log('MESSAGE STOP OK — cancellation during image saving prevents dispatch')
