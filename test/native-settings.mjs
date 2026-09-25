import assert from 'node:assert/strict'
import { NativeSheetController } from '../src/native/sheets-runtime.ts'
import { NativeSettingsController } from '../src/native/settings-controller.ts'
const values = new Map(), sent = [], calls = []
let connections = [], catalogWait
const preferences = { get: key => values.get(key) ?? null, set: (key, value) => values.set(key, value) }
const sheets = new NativeSheetController({ send: (method, data) => sent.push([method, structuredClone(data)]) }, {}, {}, async (channel, ...args) => {
  calls.push([channel, ...args])
  if (channel === 'providers:choices') return [{ value: 'codex:default', provider: 'codex', modelId: 'default', group: 'Codex', label: 'Default' }]
  if (channel === 'providers:list') return connections
  if (channel === 'providers:catalog') return catalogWait ? await catalogWait : { ok: true, models: ['a', 'b'] }
  if (channel === 'providers:save') {
    connections = [{ ...args[0], apiKey: undefined, id: 'connection-1', hasKey: true }]
    return { ok: true, connection: connections[0] }
  }
  if (channel === 'providers:remove') connections = []
  return {}
})
let notified = 0
const settings = new NativeSettingsController(sheets, preferences, () => notified++)
const action = (name, values = {}) => sheets.action({ id: sheets.current.state.id, action: name, values })
await settings.open()
await action('save', { default: 'codex:default', projectUi: 'false', engine: 'agent' })
assert.equal(JSON.parse(values.get('praxis:preferred-model')).fixed.provider, 'codex')
assert.equal(notified, 1)
await action('connections')
await action('add')
const draft = { label: 'Test', url: 'https://provider.example/v1', key: 'fake-test-key', models: 'a,b' }
await action('connect', draft)
assert.equal(sheets.current.state.fields.find(f => f.id === 'models').kind, 'multichoice')
assert.ok(!JSON.stringify(sent).includes('fake-test-key'), 'keys must not return in form snapshots')
await action('save', draft)
assert.equal(connections.length, 1)
assert.deepEqual(connections[0].models, ['a', 'b'])
await action('edit', { connection: 'connection-1' })
await action('save', { ...draft, url: 'https://different.example/v1', key: '' })
assert.match(sheets.current.state.message, /API key/)
await action('save', { ...draft, key: '' })
assert.ok(!('apiKey' in calls.filter(c => c[0] === 'providers:save').at(-1)[1]), 'blank key preserves same-origin credentials')
await action('delete', { connection: 'connection-1' })
assert.equal(connections.length, 1, 'deletion requires confirmation screen')
await action('delete')
assert.equal(connections.length, 0)
await action('add')
let resolve
catalogWait = new Promise(r => resolve = r)
const old = sheets.current.state.id
const pending = action('connect', draft)
await sheets.action({ id: old, action: 'cancel', values: {} })
resolve({ ok: true, models: ['late'] })
await pending
assert.equal(sheets.current, null, 'late catalog must not reopen canceled sheet')
console.log('Native settings: defaults, provider catalog/save/delete, key handling and cancellation passed')
