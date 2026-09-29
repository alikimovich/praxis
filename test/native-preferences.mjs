import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { nativePreferences } from '../src/native/preferences.ts'
// The Bun writer: now the TREZI_BACKEND_OWNER=legacy rollback owner. The Swift
// owner's parity with it is checked by test/preferences-owner.mjs.
const dir = mkdtempSync(join(tmpdir(), 'trezi-preferences-test-'))
try {
  const store = nativePreferences(dir)
  await store.set('trezi:preferred-model', '{"mode":"last-used"}')
  await store.set('trezi:chat-hidden', '1')
  await store.set('trezi:chat-hidden', null)
  const reopened = nativePreferences(dir)
  assert.equal(reopened.get('trezi:chat-hidden'), null)
  assert.ok(Object.hasOwn(reopened.snapshot(), 'trezi:chat-hidden'), 'an explicit null is stored, not deleted')
  assert.equal(reopened.get('trezi:preferred-model'), '{"mode":"last-used"}')
  await assert.rejects(store.set('__proto__', 'bad'))
  await assert.rejects(store.set('trezi:bad', {}))
  await assert.rejects(store.set('trezi:too-large', 'x'.repeat(2_000_001)))
  const before = readFileSync(join(dir, 'preferences.json'), 'utf8')
  await assert.rejects(store.apply([['trezi:a', '1'], ['trezi:b', 2]]), /Invalid/)
  assert.equal(readFileSync(join(dir, 'preferences.json'), 'utf8'), before, 'an invalid batch writes nothing')
  await store.apply(current => [['trezi:a', '1'], ['trezi:b', current['trezi:a'] ?? 'unset']])
  assert.equal(store.get('trezi:b'), 'unset', 'a function batch sees the committed state')
  const copy = reopened.snapshot(); copy['trezi:preferred-model'] = 'changed'
  assert.notEqual(reopened.get('trezi:preferred-model'), 'changed')
  writeFileSync(join(dir, 'preferences.json'), '{"version":2,"values":{}}')
  assert.throws(() => nativePreferences(dir), /Invalid native preferences file/)
  console.log('Native preferences (legacy owner): disk restore, null storage, atomic batches and validation passed')
} finally { rmSync(dir, { recursive: true, force: true }) }
