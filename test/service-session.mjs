// LKM-125: the XPC service and every process it starts keep the user's security
// session, so they reach the login keychain (connection keys, the Claude subscription
// token, a `claude auth login` from Terminal).
// - plist: the service's Info.plist, as the build writes it, sets
//   XPCService.JoinExistingSession (without it launchd gives the service a new session
//   with no keychain);
// - probe: `SecuritySessionProbe` (the host's `securitySession` command and
//   `TreziHost --session`) reports the session id, its graphic bit and the `security`
//   exit codes, and a child started through a shell reports the same session.
// The native settings group compares the host with a process started under the real
// service (`src/native/smoke-session.ts`).
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { serviceInfoPlist } from '../scripts/service-info.mjs'
import { skipUnlessDarwin } from './helpers/darwin.mjs'

skipUnlessDarwin('The security session probe')
const root = fileURLToPath(new URL('..', import.meta.url))
const scratch = mkdtempSync(join(tmpdir(), 'trezi-service-session-'))
try {
  const parsed = spawnSync('plutil', ['-convert', 'json', '-o', '-', '-'], {
    input: serviceInfoPlist(),
    encoding: 'utf8'
  })
  assert.equal(parsed.status, 0, parsed.stderr)
  const plist = JSON.parse(parsed.stdout)
  assert.equal(plist.CFBundleIdentifier, 'dev.praxis.service')
  assert.deepEqual(plist.XPCService, {
    ServiceType: 'Application',
    RunLoopType: 'dispatch_main',
    JoinExistingSession: true
  })
  const build = readFileSync(join(root, 'scripts/build-native.mjs'), 'utf8')
  assert.match(
    build,
    /writeFileSync\(join\(serviceContents, 'Info\.plist'\), serviceInfoPlist\(\)\)/,
    'the build writes this plist'
  )
  assert.match(build, /src\/native\/SecuritySession\.swift/, 'the host is built with the probe')
  const host = readFileSync(join(root, 'src/native/Host.swift'), 'utf8')
  assert.match(host, /CommandLine\.arguments\[1\] == "--session"/)
  assert.match(host, /case "securitySession": reply\(id, SecuritySessionProbe\.report\(\)\)/)
  console.log('SERVICE-SESSION plist PASS')

  // The probe, built like the host's `--session` mode.
  const main = join(scratch, 'main.swift'),
    probe = join(scratch, 'probe')
  writeFileSync(
    main,
    'import Foundation\nFileHandle.standardOutput.write(try! JSONSerialization.data(withJSONObject: SecuritySessionProbe.report()))\n'
  )
  const compiled = spawnSync(
    'xcrun',
    [
      'swiftc',
      '-module-cache-path',
      join(scratch, 'mc'),
      main,
      join(root, 'src/native/SecuritySession.swift'),
      '-o',
      probe,
      '-framework',
      'Security'
    ],
    { encoding: 'utf8' }
  )
  assert.equal(compiled.status, 0, compiled.stderr)
  const run = (command, args) => {
    const result = spawnSync(command, args, { encoding: 'utf8' })
    assert.equal(result.status, 0, result.stderr)
    return JSON.parse(result.stdout)
  }
  const direct = run(probe, [])
  assert.deepEqual(Object.keys(direct).sort(), [
    'defaultKeychain',
    'graphic',
    'listKeychains',
    'session'
  ])
  assert.ok(Number.isInteger(direct.session) && typeof direct.graphic === 'boolean')
  const exit = (command) => spawnSync('/usr/bin/security', [command], { stdio: 'ignore' }).status
  assert.deepEqual(
    [direct.listKeychains, direct.defaultKeychain],
    [exit('list-keychains'), exit('default-keychain')]
  )
  assert.deepEqual(
    run('/bin/sh', ['-c', `"${probe}"`]),
    direct,
    'a child keeps its parent’s session'
  )
  console.log('SERVICE-SESSION probe PASS')
} finally {
  rmSync(scratch, { recursive: true, force: true })
}
