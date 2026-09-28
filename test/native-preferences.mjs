import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { nativePreferences } from '../src/native/preferences.ts'
const dir = mkdtempSync(join(tmpdir(), 'trezi-preferences-test-'))
try {
  const store = nativePreferences(dir)
  store.set('trezi:preferred-model', '{"mode":"last-used"}', true)
  store.set('trezi:chat-hidden', '1')
  store.set('trezi:chat-hidden', '0', true)
  assert.equal(store.get('trezi:chat-hidden'), '1', 'legacy must not replace native choices')
  store.set('trezi:chat-hidden', null)
  store.set('trezi:chat-hidden', '1', true)
  const reopened = nativePreferences(dir)
  assert.equal(reopened.get('trezi:chat-hidden'), null, 'deletion survives stale legacy imports')
  assert.equal(reopened.get('trezi:preferred-model'), '{"mode":"last-used"}')
  assert.throws(() => store.set('__proto__', 'bad'))
  assert.throws(() => store.set('trezi:bad', {}))
  assert.throws(() => store.set('trezi:too-large', 'x'.repeat(2_000_001)))
  const copy = reopened.snapshot(); copy['trezi:preferred-model'] = 'changed'
  assert.notEqual(reopened.get('trezi:preferred-model'), 'changed')
  console.log('Native preferences: disk restore, one-time imports, deletion and validation passed')
} finally { rmSync(dir, { recursive: true, force: true }) }
