import assert from 'node:assert/strict'
import { NativeSheetController } from '../src/native/sheets-runtime.ts'
const calls = [], messages = [], chats = []
let destination = null
const workspace = {
  state: { projects: [{ key: '/repo', root: '/repo', name: 'Repo' }] },
  active: { root: '/new', activeSessionKey: '/new' },
  command: async value => calls.push(['workspace', value]), reportError: error => calls.push(['warning', error])
}
const sheets = new NativeSheetController({ send: (method, data) => messages.push([method, structuredClone(data)]) }, workspace, {
  command: async value => chats.push(value)
}, async (channel, ...args) => {
  calls.push([channel, ...args])
  if (channel === 'project-memory:get') return { content: '# Memory' }
  if (channel === 'project:pick-new') return destination
  if (channel === 'project:create') return { ok: true, root: '/new' }
  return {}
})
await sheets.memory('/repo')
const memory = sheets.current.state.id
await sheets.action({ id: memory, action: 'save', values: { content: 'x'.repeat(16001) } })
assert.match(sheets.current.state.message, /16,000/)
assert.ok(!calls.some(c => c[0] === 'project-memory:set'))
await sheets.action({ id: memory, action: 'save', values: { content: 'Native memory' } })
assert.deepEqual(calls.at(-1), ['project-memory:set', '/repo', 'Native memory'])
await sheets.action({ id: memory, action: 'cancel', values: {} })
assert.equal(sheets.current, null)
await sheets.action({ id: memory, action: 'save', values: { content: 'Stale' } })
assert.equal(calls.at(-1)[2], 'Native memory')
sheets.newProject()
let id = sheets.current.state.id
await sheets.action({ id, action: 'create', values: { setup: 'invalid' } })
assert.match(sheets.current.state.message, /starting point/)
await sheets.action({ id, action: 'create', values: { setup: 'react' } })
assert.equal(sheets.current.state.id, id, 'canceled folder selection retains the form')
assert.ok(!calls.some(c => c[0] === 'project:create'))
destination = '/new'
await sheets.action({ id, action: 'create', values: { setup: 'react', details: 'A native project' } })
assert.equal(sheets.current, null)
assert.deepEqual(chats.at(-1), { type: 'seed', chat: '/new', text: 'A native project' })
assert.deepEqual(calls.find(c => c[0] === 'project:create'), ['project:create', '/new', { template: 'react' }])
console.log('Native sheets: memory scope/limits, stale actions, picker cancellation and project creation passed')
