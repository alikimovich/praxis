import assert from 'node:assert/strict'
import { NativeChatController } from '../src/native/chat-controller.ts'
import { NativeContextController } from '../src/native/context-controller.ts'
const calls = [], deferred = []
let delay = false
const entries = ['a', 'b'].map(key => ({ key, root: '/' + key, activeSessionKey: key }))
const invoke = async (channel, ...args) => {
  calls.push([channel, ...args])
  if (channel === 'agent:workspace-snapshot') return { projects: entries.map(p => ({ root: p.root, chats: [{ sessionKey: p.key, options: {}, record: { transcript: [] }, isRunning: false }] })) }
  if (channel === 'setup:detect') { if (delay) await new Promise(resolve => deferred.push(resolve)); return { canInstrument: true } }
  if (channel === 'tokens:detect') return { source: 'none' }
  if (channel === 'annotations:list') return [{ id: args[0], text: 'Note ' + args[0] }]
  if (channel === 'sessions:list') return []
  return {}
}
const workspace = { active: entries[0], state: { projects: entries, history: {} }, services: { invoke }, changed() {}, command: async command => calls.push(['workspace', command]) }
const chat = new NativeChatController({ invoke, render() {}, effect() {} })
const controller = new NativeContextController(workspace, chat, () => ({ projectUi: true }))
await controller.activate(entries[0])
controller.readiness({ stamps: 0 })
assert.equal(chat.get('a').context.setup.needed, true)
assert.equal(chat.get('a').context.tokens.needed, true)
assert.equal(chat.get('a').context.notes[0].id, '/a')
const selected = { tag: 'button', id: 'test\nignore', classes: [], selector: 'button', text: 'OK', source: 'App.tsx:1:1' }
controller.selection(selected)
assert.match(chat.get('a').context.selection.prompt, /#test ignore/)
const prompt = chat.get('a').context.selection.prompt
await controller.effect({ type: 'selection-clear', chat: 'a', prompt: 'stale' })
assert.ok(chat.get('a').context.selection)
await controller.effect({ type: 'selection-clear', chat: 'a', prompt })
assert.equal(chat.get('a').context.selection, null)
assert.ok(calls.some(c => c[0] === 'preview:clear-selected'))
await controller.effect({ type: 'setup', chat: 'a', phase: 'dismissed' })
controller.readiness({ stamps: 0 }); assert.equal(chat.get('a').context.setup.needed, false)
controller.queued('a', 'spawn', 'Edit', true)
assert.equal(chat.get('a').context.spawns[0].status, 'queued')
await controller.effect({ type: 'spawn', event: { type: 'spawn-started', projectKey: 'a', sessionId: 'spawn', branch: 'praxis/edit' } })
assert.equal(chat.get('a').context.spawns[0].status, 'running')
workspace.active = entries[1]; delay = true
const activating = controller.activate(entries[1]); await new Promise(resolve => setTimeout(resolve, 0))
workspace.active = entries[0]; await controller.activate(entries[0])
deferred.forEach(resolve => resolve()); await activating
assert.equal(chat.active, 'a', 'late metadata cannot switch the active chat')
assert.equal(chat.get('a').context.notes[0].id, '/a')
await controller.effect({ type: 'spawn', event: { type: 'spawn-finished', projectKey: 'a', sessionId: 'spawn', branch: null } })
assert.equal(chat.get('a').context.spawns.length, 0)
console.log('Native context: service-owned metadata, selection scope, dismissal, background spawns and stale activation passed')
controller.queued('a', 'spawn', 'Late result', false)
await controller.effect({ type: 'spawn', event: { type: 'spawn-started', projectKey: 'a', sessionId: 'spawn', branch: 'late' } })
assert.equal(chat.get('a').context.spawns.length, 0, 'Late start responses cannot resurrect a completed card')
controller.queued('a', 'progress', 'Remove border', false)
await controller.effect({ type: 'spawn', event: { type: 'status', projectKey: 'a', sessionId: 'progress', text: 'Editing border styles' } })
assert.equal(chat.get('a').context.spawns[0].activity, 'Editing border styles')
