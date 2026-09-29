import assert from 'node:assert/strict'
import { latestAboveComposer, settleLatestAboveComposer } from '../src/native/smoke-composer-latest.ts'

// Empty conversations (setup card, no messages) have nothing to place.
assert.equal(latestAboveComposer({ id: '', measured: false, maxY: 0, composerTop: 0 }).ok, true)
// A lazy row without a frame is not on screen; never accepted.
assert.equal(latestAboveComposer({ id: 'reply', measured: false, maxY: 0, composerTop: 638 }).ok, false)
assert.equal(latestAboveComposer({ id: 'reply', measured: true, maxY: 640, composerTop: 638 }).ok, false)
assert.equal(latestAboveComposer({ id: 'reply', measured: true, maxY: 638.5, composerTop: 638 }).ok, true)

// Shrink after submit at normal (440) and narrow (320) chat widths: the drafted
// composer is tall, then compacts, then the conversation re-pins. Only the last
// sample is settled; the intermediate ones (composer still tall, or compact but
// the latest row not yet re-pinned) must keep waiting, and a pin that never
// arrives must fail with the geometry.
const height = 776
for (const drafted of [200, 368]) {
  const gap = 10
  const top = composerHeight => height - gap - composerHeight
  const samples = [
    { id: 'reply', measured: true, maxY: 700, composerTop: top(drafted) },
    { id: 'reply', measured: true, maxY: 700, composerTop: top(128) },
    { id: 'reply', measured: true, maxY: 590, composerTop: top(128) },
  ]
  let index = 0
  const host = { request: async command => { assert.equal(command, 'composerVerification'); return { latest: samples[Math.min(index++, samples.length - 1)] } } }
  const wait = async check => { for (let i = 0; i < 5; i++) if (await check()) return; throw new Error('Timed out') }
  const settled = await settleLatestAboveComposer(host, wait, `shrink-${drafted}`)
  assert.equal(settled.maxY, 590)
  assert.equal(index, 3, 'Waits through the tall-composer and unpinned samples')
}
const stuck = { request: async () => ({ latest: { id: 'reply', measured: true, maxY: 700, composerTop: 638 } }) }
await assert.rejects(settleLatestAboveComposer(stuck, async check => { for (let i = 0; i < 3; i++) if (await check()) return; throw new Error('Timed out') }, 'narrow-sending'), error => {
  assert.match(error.message, /narrow-sending: latest message ends 62\.0pt under the composer/)
  assert.ok(error.message.includes('"maxY":700'))
  assert.equal(error.cause.message, 'Timed out')
  return true
})
console.log('Native composer latest-message readiness: settles above the composer after shrink at 440/320pt; unmeasured or occluded rows are rejected')
