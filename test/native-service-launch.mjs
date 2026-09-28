import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { nativeServiceLaunchSpec } from '../scripts/start-native.mjs'

const directory = mkdtempSync(join(tmpdir(), 'trezi-launch-'))
try {
  const env = { TREZI_USER_DATA: join(directory, 'profile') }
  const current = nativeServiceLaunchSpec('/checkout', ['--project', '/repo'], env, '/bun')
  assert.equal(current.command, '/checkout/out/native/Trezi Native.app/Contents/MacOS/TreziHost')
  assert.deepEqual(current.args, ['/checkout/out/native', 'persistent', '--service', '--bun', '/bun', '--backend', '/checkout/out/native/index.cjs', '--profile', env.TREZI_USER_DATA, '--', '--project', '/repo'])
  const legacy = nativeServiceLaunchSpec('/checkout', [], { ...env, TREZI_BACKEND_OWNER: 'legacy' }, '/bun')
  assert.equal(legacy.command, '/checkout/out/native/TreziService')
  assert.deepEqual(legacy.args.slice(0, 3), ['--legacy', '--host', current.command])
  assert.equal(legacy.profile, current.profile, 'rollback retains the same profile and writer exclusion')
  const test = nativeServiceLaunchSpec('/checkout', ['--test'], env, '/bun', directory)
  assert.equal(test.profile, join(directory, 'profile'))
  assert.equal(test.env.TREZI_NATIVE_TEST_DIR, directory)
  assert.equal(test.args[1], 'ephemeral')
  assert.throws(() => nativeServiceLaunchSpec('/checkout', [], { ...env, TREZI_BACKEND_OWNER: 'unknown' }, '/bun'))
} finally { rmSync(directory, { recursive: true, force: true }) }
console.log('NATIVE SERVICE LAUNCH PASS — XPC and guarded rollback specs preserve profile identity')
