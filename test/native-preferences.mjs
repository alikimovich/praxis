import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { nativePreferences } from '../src/native/preferences.ts'
const dir = mkdtempSync(join(tmpdir(), 'praxis-preferences-test-'))
try {
  const store = nativePreferences(dir)
  store.set('praxis:preferred-model', '{"mode":"last-used"}', true)
  store.set('praxis:chat-hidden', '1')
  store.set('praxis:chat-hidden', '0', true)
  assert.equal(store.get('praxis:chat-hidden'), '1', 'legacy must not replace native choices')
  store.set('praxis:chat-hidden', null)
  store.set('praxis:chat-hidden', '1', true)
  const reopened = nativePreferences(dir)
  assert.equal(reopened.get('praxis:chat-hidden'), null, 'deletion survives stale legacy imports')
  assert.equal(reopened.get('praxis:preferred-model'), '{"mode":"last-used"}')
  assert.throws(() => store.set('__proto__', 'bad'))
  assert.throws(() => store.set('praxis:bad', {}))
  assert.throws(() => store.set('praxis:too-large', 'x'.repeat(2_000_001)))
  const copy = reopened.snapshot(); copy['praxis:preferred-model'] = 'changed'
  assert.notEqual(reopened.get('praxis:preferred-model'), 'changed')
  console.log('Native preferences: disk restore, one-time imports, deletion and validation passed')
} finally { rmSync(dir, { recursive: true, force: true }) }
