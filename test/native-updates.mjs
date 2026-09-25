import assert from 'node:assert/strict'
import { NativeSheetController } from '../src/native/sheets-runtime.ts'
import { NativeUpdateController } from '../src/native/update-controller.ts'
const sheets = new NativeSheetController({ send() {} }, {}, {}, async () => {})
let dirty = '', blocked = null, failure = '', restarts = 0
const calls = []
const update = new NativeUpdateController(sheets, '/fixture', () => { restarts++ }, async (command, args) => {
  calls.push([command, ...args]); if (args[0] === 'status') return dirty
  if (args[0] === failure) throw Error('fixture failure')
  return ''
}, async () => ({ status: 'available', behind: 1, subject: 'Fixture update' }), () => blocked)
const action = async name => sheets.action({ id: sheets.current.state.id, action: name, values: {} })
await update.open(); await action('check'); assert.ok(sheets.current.state.actions.some(a => a.id === 'apply'))
dirty = ' M source.ts'; await action('apply'); assert.match(sheets.current.state.message, /local changes/); assert.equal(calls.length, 1); assert.equal(restarts, 0)
dirty = ''; blocked = 'Save source drafts'; await action('apply'); assert.match(sheets.current.state.message, /Save source drafts/); assert.equal(calls.length, 1)
blocked = null; failure = 'pull'; await action('apply'); assert.equal(sheets.current.state.title, 'Update could not finish'); assert.equal(restarts, 0)
failure = ''; calls.length = 0; await action('retry'); assert.equal(restarts, 1)
assert.deepEqual(calls.map(a => a.slice(1)), [['status','--porcelain'],['pull','--ff-only'],['install','--frozen-lockfile'],['run','build:native']])
let checks = 0
const changingDraft = new NativeUpdateController(sheets, '/fixture', () => { restarts++ }, async () => '', undefined, () => ++checks === 1 ? null : 'New unsaved content draft')
await changingDraft.apply()
assert.equal(restarts, 1)
assert.equal(sheets.current.state.title, 'Update could not finish')
assert.match(sheets.current.state.detail, /New unsaved content draft/)
console.log('Native updates: dirty/draft guards, failure recovery and native-only rebuild passed')
