import assert from 'node:assert/strict'
import { NativeSheetController } from '../src/native/sheets-runtime.ts'
import { NativeSettingsController } from '../src/native/settings-controller.ts'
const values = new Map(), sent = [], calls = []
let connections = [], catalogWait
let failNext = null, gate = null, applyBlocked = false, applies = 0
const preferences = {
  get: key => values.get(key) ?? null,
  snapshot: () => Object.fromEntries(values),
  async apply(batch) {
    applies++
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
const field = id => sheets.current.state.fields.find(f => f.id === id)
await settings.open()
// One sidebar window: General, AI Providers (inline, no separate sheet) and Experimental.
assert.deepEqual(sheets.current.state.sections.map(s => [s.id, s.label, s.symbol]), [['general', 'General', 'gearshape'], ['providers', 'AI Providers', 'sparkles'], ['experimental', 'Experimental', 'testtube.2']])
assert.equal(sheets.current.state.section, 'general', 'first open shows General')
assert.deepEqual(sheets.current.state.fields.map(f => [f.id, f.section]), [['default', 'general'], ['version', 'general'], ['projectUi', 'experimental'], ['engine', 'experimental'], ['connections', 'providers']])
// LKM-143: General shows the version as a read-only row (the build stamps the label; unbuilt source says so).
assert.equal(field('version').kind, 'readonly')
assert.equal(field('version').value, 'Trezi (unbuilt development source)')
assert.equal(sheets.current.state.actions.some(a => a.id === 'save' || a.id === 'cancel' || a.id === 'connections'), false)
assert.deepEqual(sheets.current.state.actions.map(a => [a.id, a.section]), [['add', 'providers']])
await action('change', { default: 'codex:default', projectUi: 'false', engine: 'agent' })
assert.equal(JSON.parse(values.get('trezi:preferred-model')).fixed.provider, 'codex')
assert.equal(notified, 1)
const fields = sheets.current.state.fields
assert.equal(fields.find(f => f.id === 'projectUi').label, 'Gen UI')
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

// The last selected section is remembered across reopen; unknown sections are ignored.
const settingsId = sheets.current.state.id
await sheets.action({ id: settingsId, action: 'section', values: {}, section: 'providers' })
await sheets.action({ id: settingsId, action: 'section', values: {}, section: 'bogus' })
assert.equal(values.get('trezi:settings-section:v1'), 'providers')
assert.equal(sheets.current.state.section, 'providers')
await settings.open()
assert.equal(sheets.current.state.section, 'providers', 'reopen restores the last section')
assert.equal(field('projectUi').value, 'true')

// AI Providers is edited in place: the Settings window (same ID) stays open.
const inPlace = sheets.current.state.id
const saves = () => calls.length
await action('add')
assert.equal(sheets.current.state.id, inPlace)
assert.deepEqual(sheets.current.state.fields.filter(f => f.section === 'providers').map(f => [f.id, f.draft]), [['label', true], ['url', true], ['key', true], ['models', true]])
assert.equal(field('default').section, 'general', 'other panes survive the editor')
const draft = { label: 'Test', url: 'https://provider.example/v1', key: 'fake-test-key', models: 'a,b' }
// Typing in the provider form never autosaves the draft or its key.
const applied = applies
await action('change', { default: 'codex:default', projectUi: 'true', engine: 'jev', ...draft })
assert.equal(applies, applied, 'draft provider fields are not autosaved')
await action('connect', draft)
assert.equal(field('models').kind, 'multichoice')
assert.ok(!JSON.stringify(sent).includes('fake-test-key'), 'keys must not return in form snapshots')
const before = saves()
await action('save-provider', draft)
assert.ok(calls.slice(before).some(c => c[0] === 'providers:choices'), 'saving a provider refreshes the default-model choices')
assert.equal(connections.length, 1)
assert.deepEqual(connections[0].models, ['a', 'b'])
assert.equal(sheets.current.state.id, inPlace)
assert.equal(field('connection').value, 'connection-1')
await action('edit', { connection: 'connection-1' })
assert.equal(field('key').help, 'Leave blank to keep the current key.')
await action('save-provider', { ...draft, url: 'https://different.example/v1', key: '' })
assert.match(sheets.current.state.message, /API key/)
await action('save-provider', { ...draft, key: '' })
assert.ok(!('apiKey' in calls.filter(c => c[0] === 'providers:save').at(-1)[1]), 'blank key preserves same-origin credentials')
await action('delete', { connection: 'connection-1' })
assert.equal(connections.length, 1, 'deletion requires confirmation screen')
assert.match(field('remove-confirm').label, /Remove Test\?/)
await action('remove')
assert.equal(connections.length, 0)
assert.equal(field('connections').value, 'None')
assert.equal(sheets.current.state.id, inPlace)
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
console.log('Native settings: sidebar sections and remembered section, defaults, inline provider catalog/save/delete without autosaving drafts, key handling, cancellation, failed-draft retention and close-waits-for-save passed')
