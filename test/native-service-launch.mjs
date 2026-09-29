import assert from 'node:assert/strict'
import { existsSync, mkdirSync, mkdtempSync, readlinkSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { defaultProfile, nativeServiceLaunchSpec } from '../scripts/start-native.mjs'

const directory = mkdtempSync(join(tmpdir(), 'trezi-launch-'))
try {
  const env = { TREZI_USER_DATA: join(directory, 'profile') }
  const current = nativeServiceLaunchSpec('/checkout', ['--project', '/repo'], env, '/bun')
  assert.equal(current.command, '/checkout/out/native/Trezi.app/Contents/MacOS/TreziHost')
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
  // The default profile comes from the service, which makes the `Praxis Native` alias.
  assert.throws(() => defaultProfile(join(directory, 'no-build'), directory), /run bun run build/)
  const out = fileURLToPath(new URL('../out/native', import.meta.url))
  if (existsSync(join(out, 'TreziService'))) {
    const support = join(directory, 'support'); mkdirSync(join(support, 'Praxis Native'), { recursive: true })
    assert.equal(defaultProfile(out, support), join(support, 'Trezi Native'))
    assert.equal(readlinkSync(join(support, 'Trezi Native')), 'Praxis Native')
    const collision = join(directory, 'collision'); mkdirSync(join(collision, 'Praxis Native'), { recursive: true }); mkdirSync(join(collision, 'Trezi Native'))
    assert.throws(() => defaultProfile(out, collision), /Separate Trezi Native and Praxis Native profiles exist/)
  } else console.log('SKIP defaultProfile against the service: no build')
} finally { rmSync(directory, { recursive: true, force: true }) }
console.log('NATIVE SERVICE LAUNCH PASS — XPC and guarded rollback specs preserve profile identity')
