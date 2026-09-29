import assert from 'node:assert/strict'
import { NativeSheetController } from '../src/native/sheets-runtime.ts'
import { NativeSettingsController } from '../src/native/settings-controller.ts'
const values = new Map(), sent = [], calls = []
let connections = [], catalogWait
let failNext = null, gate = null, applyBlocked = false
const preferences = {
  get: key => values.get(key) ?? null,
  snapshot: () => Object.fromEntries(values),
  async apply(batch) {
    const entries = typeof batch === 'function' ? batch(Object.fromEntries(values)) : batch
    if (gate) { applyBlocked = true; await gate; applyBlocked = false }
    if (failNext) { const error = failNext; failNext = null; throw error }
    for (const [key, value] of entries) values.set(key, value)
  },
  set(key, value) { return this.apply([[key, value]]) },
  subscribe() {}
}
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
assert.equal(sheets.current.state.actions.some(a => a.id === 'save' || a.id === 'cancel'), false)
await action('change', { default: 'codex:default', projectUi: 'false', engine: 'agent' })
assert.equal(JSON.parse(values.get('trezi:preferred-model')).fixed.provider, 'codex')
assert.equal(notified, 1)
const fields = sheets.current.state.fields
assert.equal(fields.find(f => f.id === 'projectUi').label, 'Experimental Gen UI')
assert.match(fields.find(f => f.id === 'projectUi').help, /existing components and styles.*React and Svelte/)
assert.deepEqual(fields.find(f => f.id === 'engine').visibleWhen, { field: 'projectUi', value: 'true' })
assert.match(fields.find(f => f.id === 'engine').help, /Chat model.*Jev.*Gateway/)
assert.equal(fields.find(f => f.id === 'projectUi').value, 'false')
await action('change', { default: 'codex:default', projectUi: 'true', engine: 'jev' })
await action('change', { default: 'codex:default', projectUi: 'false', engine: 'jev' })
await settings.open()
assert.equal(sheets.current.state.fields.find(f => f.id === 'projectUi').value, 'false')
assert.equal(sheets.current.state.fields.find(f => f.id === 'engine').value, 'jev')
await action('change', { default: 'codex:default', projectUi: 'true', engine: 'jev' })
assert.equal(values.get('trezi:project-ui:v1'), 'true')
assert.equal(values.get('trezi:project-ui-engine:v1'), 'jev')
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

// A failed save keeps the draft; closing waits for the retried save to settle.
await settings.open()
values.set('trezi:project-ui:v1', 'false')
failNext = new Error('disk full')
await action('change', { default: 'last-used', projectUi: 'true', engine: 'agent' })
assert.match(sheets.current.state.message, /Could not save: disk full.*draft is still here/)
assert.equal(values.get('trezi:project-ui:v1'), 'false', 'nothing was written by the failed batch')
let release
gate = new Promise(r => release = r)
const closing = action('cancel')
while (!applyBlocked) await new Promise(r => setTimeout(r, 10))
assert.ok(sheets.current, 'close waits for the pending save')
release(); gate = null
await closing
assert.equal(sheets.current, null)
assert.equal(values.get('trezi:project-ui:v1'), 'true', 'the retained draft was saved on close')
assert.equal(JSON.parse(values.get('trezi:preferred-model')).mode, 'last-used')
console.log('Native settings: defaults, provider catalog/save/delete, key handling, cancellation, failed-draft retention and close-waits-for-save passed')
