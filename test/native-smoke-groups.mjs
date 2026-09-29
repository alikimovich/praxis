/**
 * Native smoke `--only=group,group` selection (src/native/smoke-groups.ts) and the
 * dev-native launcher's early rejection of bad selections — before any build, so
 * no desktop is needed. The groups themselves run in the native tier.
 *
 * Run with: bun test/native-smoke-groups.mjs
 */
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { NATIVE_SMOKE_GROUPS, parseSmokeGroups } from '../src/native/smoke-groups.ts'

const all = ['core', 'islands', 'shadow-light', 'sidebar', 'settings', 'chat', 'composer']
assert.deepEqual([...NATIVE_SMOKE_GROUPS], all)
assert.deepEqual([...parseSmokeGroups([])], all, 'No flag runs every group')
assert.deepEqual([...parseSmokeGroups(['--test', '--project', '/tmp/x'])], all)
assert.deepEqual([...parseSmokeGroups(['--test', '--only=chat,composer'])], ['chat', 'composer'])
assert.deepEqual([...parseSmokeGroups(['--only= sidebar , shadow-light '])], ['sidebar', 'shadow-light'])
assert.deepEqual([...parseSmokeGroups(['--only=core,core'])], ['core'])
assert.throws(() => parseSmokeGroups(['--only=core,bogus']), /Unknown native smoke group: bogus\. Known groups: core, islands, shadow-light, sidebar, settings, chat, composer/)
assert.throws(() => parseSmokeGroups(['--only=nope,also']), /Unknown native smoke groups: nope, also\./)
assert.throws(() => parseSmokeGroups(['--only=']), /--only needs at least one group/)
assert.throws(() => parseSmokeGroups(['--only']), /--only needs at least one group/)
assert.throws(() => parseSmokeGroups(['--only=core', '--only=chat']), /--only may be given once/)
assert.throws(() => parseSmokeGroups(['--live', '--only=chat']), /--live needs the core group/)
assert.deepEqual([...parseSmokeGroups(['--live', '--only=core,chat'])], ['core', 'chat'])
console.log('Native smoke group selection: default, subset, unknown/empty/repeated and --live guards passed.')

if (process.platform === 'darwin') {
  const cwd = fileURLToPath(new URL('../', import.meta.url))
  const dev = (...args) => spawnSync(process.execPath, ['scripts/dev-native.mjs', ...args], { cwd, encoding: 'utf8', timeout: 20000 })
  const unknown = dev('--test', '--only=core,bogus')
  assert.equal(unknown.status, 1)
  assert.match(unknown.stderr, /Unknown native smoke group: bogus\. Known groups:/)
  assert.doesNotMatch(unknown.stdout, /Building/, 'A bad group name fails before the build')
  const withoutTest = dev('--only=core')
  assert.equal(withoutTest.status, 1)
  assert.match(withoutTest.stderr, /requires --test/)
  const help = dev('--help')
  assert.equal(help.status, 0)
  assert.match(help.stdout, /--only=group,group/)
  assert.ok(all.every(group => help.stdout.includes(group)), 'Help lists every group')
  console.log('dev-native: bad --only selections fail before building; --help lists the groups.')
} else console.log('dev-native launcher checks SKIP — macOS only.')
