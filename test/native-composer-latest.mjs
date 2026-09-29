import assert from 'node:assert/strict'
import { revealComposerLatest } from '../src/native/smoke-composer-latest.ts'

// Recorded first-capture failure: a setup card, no messages, no measured lazy
// bottom target. Waiting for a latest message here can never satisfy the check.
const empty = { messageCount: 0, messages: [], cards: ['tokens'], bottomPosition: 0, height: 776, composerInset: 206 }
const populated = { ...empty, messageCount: 2, messages: [{ id: 'request' }, { id: 'reply' }] }
const calls = []
let snapshots = []
const host = { request: async (command, args) => {
  calls.push([command, args])
  if (command === 'chatInspect') return snapshots.length > 1 ? snapshots.shift() : snapshots[0]
  assert.equal(command, 'composerVerification')
  assert.deepEqual(args, { latest: true })
} }
const wait = async check => {
  for (let i = 0; i < 3; i++) if (await check()) return
  throw new Error('Timed out')
}
snapshots = [empty]
await revealComposerLatest(host, () => { throw new Error('Empty chat must not wait for a message') }, 'initial')
assert.deepEqual(calls, [['chatInspect', undefined]])

// Once submitted, an unmeasured or occluded bottom must still wait. Only a
// positive position above the composer satisfies the existing desktop check.
calls.length = 0
snapshots = [populated, populated, { ...populated, bottomPosition: 700 }, { ...populated, bottomPosition: 570 }]
await revealComposerLatest(host, wait, 'normal-multiline')
assert.equal(calls.filter(([command]) => command === 'chatInspect').length, 4)
assert.deepEqual(calls[1], ['composerVerification', { latest: true }])
for (const bottomPosition of [0, 700]) {
  snapshots = [{ ...populated, bottomPosition }]
  await assert.rejects(revealComposerLatest(host, wait, 'narrow-multiline'), error => {
    assert.match(error.message, /narrow-multiline: latest message did not settle/)
    assert.ok(error.message.includes(`"bottomPosition":${bottomPosition}`))
    assert.equal(error.cause.message, 'Timed out')
    return true
  })
}
console.log('Native composer latest-message readiness: empty setup card and strict populated reachability passed')
