// Foundation-only real processes: no AppKit window, provider call or user profile.
import assert from 'node:assert/strict'
import { spawn, spawnSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { randomUUID } from 'node:crypto'
import { createInterface } from 'node:readline'

const root = fileURLToPath(new URL('..', import.meta.url))
const scratch = mkdtempSync(join(tmpdir(), 'trezi-service-'))
const processes = new Set()
const groups = new Set()
const version = { major: 1, minor: 0 }
const capabilities = [{ name: 'legacy.ui', version: 1 }, { name: 'supervision', version: 1 }]
const bun = process.versions.bun ? process.execPath : spawnSync('which', ['bun'], { encoding: 'utf8' }).stdout.trim()
const backend = join(root, 'test/fixtures/service-process/legacy.mjs')
function run(command, args, env = {}) {
  const result = spawnSync(command, args, { cwd: root, env: { ...process.env, ...env }, encoding: 'utf8', timeout: 180_000 })
  assert.equal(result.status, 0, `${command}: ${result.error || result.signal || ''}\n${result.stdout}\n${result.stderr}`)
  return result.stdout
}
function processFixture(binary, args = [], env = {}) {
  const child = spawn(binary, args, { cwd: root, env: { ...process.env, ...env }, stdio: ['pipe', 'pipe', 'pipe'] })
  processes.add(child)
  const lines = [], waiters = []
  let stderr = ''
  child.stderr.on('data', data => { stderr += data })
  createInterface({ input: child.stdout }).on('line', line => { lines.push(line); for (const wake of waiters.splice(0)) wake() })
  const timer = setTimeout(() => child.kill("SIGKILL"), 45_000)
  const done = new Promise(resolve => child.on('exit', (code, signal) => { clearTimeout(timer); processes.delete(child); resolve({ code, signal, stderr }) }))
  return {
    child, done, lines,
    get stderr() { return stderr },
    send(value) { child.stdin.write(`${typeof value === 'string' ? value : Buffer.from(JSON.stringify(value)).toString('base64')}\n`) },
    async line(predicate, timeout = 10_000) {
      // Captured synchronously so a timeout names the waiting step.
      const caller = new Error('waiting step').stack
      const deadline = Date.now() + timeout
      while (Date.now() < deadline) {
        const index = lines.findIndex(predicate)
        if (index >= 0) return lines.splice(index, 1)[0]
        await new Promise(resolve => { const timer = setTimeout(resolve, 50); waiters.push(() => { clearTimeout(timer); resolve() }) })
      }
      throw new Error(`Timed out waiting for fixture output: ${lines.join('\n')}\n${stderr}\n${caller}`)
    },
    async reply(request) {
      this.send(request)
      const line = await this.line(line => line.startsWith('REPLY ') && JSON.parse(Buffer.from(line.slice(6), 'base64')).requestID === request.requestID)
      return JSON.parse(Buffer.from(line.slice(6), 'base64'))
    },
  }
}
const pause = ms => new Promise(resolve => setTimeout(resolve, ms))
async function file(path) { for (let i = 0; i < 100 && !existsSync(path); i++) await pause(20); return readFileSync(path, 'utf8') }
async function dead(pid) {
  for (let i = 0; i < 100; i++) {
    try { process.kill(pid, 0) } catch (error) { if (error.code === 'ESRCH') return }
    await pause(20)
  }
  assert.fail(`fixture process ${pid} survived cleanup`)
}
function control(connection, kind, extra = {}) { return { version, connection, requestID: randomUUID(), kind, ...extra } }
function hello(connection, launch, extra = {}) {
  return control(connection, 'hello', { hello: { connection, role: 'ui', versions: [version], schemaHash: 'trezi-supervision-1', capabilities, ...extra }, launch })
}
function plist(path, value) { writeFileSync(path, `<?xml version="1.0"?><!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd"><plist version="1.0"><dict>${value}</dict></plist>`) }
try {
  if (process.platform !== 'darwin') {
    console.log('SERVICE-PROCESS SKIP — macOS XPC and process supervision require Darwin')
  } else {
    const compile = (sources, output) => run('xcrun', ['swiftc', '-module-cache-path', join(scratch, 'modules'), ...sources, '-o', output])
    const crashFixture = join(scratch, 'guardian-fixture')
    compile(['src/service/LegacySupervisor.swift', 'src/service/ProcessGuardian.swift', 'test/fixtures/legacy-supervisor/main.swift'], crashFixture)
    console.log(run(crashFixture, [], { TREZI_TEST_BUN: bun }).trim())
    const supervisor = join(scratch, 'supervisor')
    compile(['src/service/LegacySupervisor.swift', 'test/fixtures/service-process/SupervisorFixture.swift'], supervisor)
    const profile = join(scratch, 'profile')
    mkdirSync(profile)
    const state = join(profile, 'drafts.json')
    writeFileSync(state, '{"newer":"retained"}')
    const owner = processFixture(supervisor, ['lock', profile])
    await owner.line(line => line === 'LOCKED')
    const contender = processFixture(supervisor, ['lock', profile])
    const rejected = await contender.done
    assert.notEqual(rejected.code, 0, 'second profile owner rejected')
    owner.send('release')
    assert.equal((await owner.done).code, 0)
    run(supervisor, ['startup-failure', profile])
    for (const mode of ['shutdown', 'child-death']) {
      const descendant = join(scratch, `${mode}.pid`)
      const instance = processFixture(supervisor, [mode, profile, bun, backend], { FIXTURE_DESCENDANT: descendant })
      const pid = Number((await instance.line(line => line.startsWith('CHILD '))).slice(6))
      groups.add(pid)
      const descendantPID = Number(await file(descendant))
      instance.send('stop')
      assert.equal((await instance.done).code, 0)
      await dead(pid)
      await dead(descendantPID)
      groups.delete(pid)
    }
    assert.equal(readFileSync(state, 'utf8'), '{"newer":"retained"}', 'shutdown and reacquisition preserve latest data')
    console.log('SERVICE-PROCESS supervision: profile contention, startup failure, child death, repeated shutdown, descendant cleanup PASS')

    const app = join(scratch, 'Fixture.app/Contents')
    const service = join(app, 'XPCServices/dev.praxis.service.xpc/Contents')
    mkdirSync(join(app, 'MacOS'), { recursive: true })
    mkdirSync(join(service, 'MacOS'), { recursive: true })
    const host = join(app, 'MacOS/TreziHost')
    const executable = join(service, 'MacOS/TreziService')
    compile(['src/service/ServiceContract.swift', 'src/service/ServiceXPC.swift', 'src/service/LegacySupervisor.swift', 'src/service/ServiceRuntime.swift', 'src/service/ProcessGuardian.swift', 'src/service/ServiceMain.swift'], executable)
    compile(['src/service/ServiceContract.swift', 'src/service/ServiceXPC.swift', 'src/native/ServiceClient.swift', 'test/fixtures/service-process/XPCFixture.swift'], host)
    plist(join(app, 'Info.plist'), '<key>CFBundleIdentifier</key><string>dev.praxis.fixture</string><key>CFBundleExecutable</key><string>TreziHost</string><key>CFBundlePackageType</key><string>APPL</string><key>LSBackgroundOnly</key><true/>')
    plist(join(service, 'Info.plist'), '<key>CFBundleIdentifier</key><string>dev.praxis.service</string><key>CFBundleExecutable</key><string>TreziService</string><key>CFBundlePackageType</key><string>XPC!</string><key>XPCService</key><dict><key>ServiceType</key><string>Application</string><key>RunLoopType</key><string>dispatch_main</string></dict>')
    console.log(run(host, ['--codec']).trim())
    const intruder = join(app, 'MacOS/Intruder')
    compile(['-D', 'INTRUDER', 'src/service/ServiceContract.swift', 'src/service/ServiceXPC.swift', 'src/native/ServiceClient.swift', 'test/fixtures/service-process/XPCFixture.swift'], intruder)
    run('codesign', ['--force', '--sign', '-', intruder])
    run('codesign', ['--force', '--sign', '-', join(service, '..')])
    run('codesign', ['--force', '--sign', '-', join(app, '..')])
    // The explicit launch-time rollback uses the same lock and drains its child.
    const rollbackPIDFile = join(scratch, 'rollback-child.pid')
    const rollback = processFixture(executable, ['--legacy', '--bun', bun, '--backend', backend, '--profile', profile], { FIXTURE_PID: rollbackPIDFile })
    const rollbackPID = Number(await file(rollbackPIDFile))
    groups.add(rollbackPID)
    const rollbackContender = processFixture(supervisor, ['lock', profile])
    assert.notEqual((await rollbackContender.done).code, 0, 'rollback shares profile exclusion')
    writeFileSync(state, '{"newer":"retained-after-rollback"}')
    rollback.child.kill('SIGTERM')
    assert.equal((await rollback.done).code, 0)
    await dead(rollbackPID)
    groups.delete(rollbackPID)
    assert.equal(readFileSync(state, 'utf8'), '{"newer":"retained-after-rollback"}')
    console.log('SERVICE-PROCESS rollback: launch, shared lock, drain and newest draft retention PASS')
    if (process.argv.includes('--supervision-only')) {
      console.log('SERVICE-PROCESS supervision-only PASS — XPC coverage requires the full fixture')
    } else {
    const backendPID = join(scratch, 'xpc-child.pid')
    const launch = { bun, backend, profile, arguments: [], environment: { FIXTURE_PID: backendPID } }
    const rejectedPeer = processFixture(intruder)
    rejectedPeer.send(hello(randomUUID(), launch))
    const peerError = await rejectedPeer.line(line => line.startsWith('ERROR '))
    assert.ok(!/lookup|Sandbox restriction/.test(peerError), `service lookup must succeed so rejection is the signing check: ${peerError}`)
    assert.ok(!rejectedPeer.lines.some(line => line.startsWith('REPLY ')), 'different executable cannot handshake')
    rejectedPeer.child.stdin.end()
    assert.equal((await rejectedPeer.done).code, 0)
    const client = processFixture(host)
    const connection = randomUUID()
    assert.equal((await client.reply(control(connection, 'legacy', { payload: Buffer.from('{"event":"fixtureEcho"}').toString('base64') }))).failure, 'unauthorized', 'unnegotiated data cannot reach Bun')
    client.send({ ...hello(connection, launch), version: { major: 99, minor: 0 } })
    const badVersion = await client.line(line => line.startsWith('REPLY ') && JSON.parse(Buffer.from(line.slice(6), 'base64')).failure === 'unsupportedVersion')
    assert.equal(JSON.parse(Buffer.from(badVersion.slice(6), 'base64')).failure, 'unsupportedVersion')
    assert.equal((await client.reply(hello(connection, launch, { versions: [{ major: 99, minor: 0 }] }))).failure, 'unsupportedVersion')
    assert.equal((await client.reply(hello(connection, launch, { capabilities: [] }))).failure, 'unsupportedCapability')
    assert.equal((await client.reply(hello(connection, launch, { role: 'parser' }))).failure, 'unauthorized')
    assert.equal((await client.reply(hello(connection, { ...launch, bun: '/nonexistent/trezi-bun' }))).failure, 'unavailable', 'startup failure returned over XPC')
    assert.equal((await client.reply({ ...hello(connection, launch), resume: randomUUID() })).failure, 'recoveryRequired', 'a fresh service never launches Bun for a stale client')
    assert.ok(!existsSync(backendPID), 'refused reattach started no backend')
    const ready = await client.reply(hello(connection, launch))
    assert.ok(ready.hello, 'real XPC handshake')
    assert.equal(ready.hello.connection, connection)
    groups.add(Number(await file(backendPID)))
    const bridge = { event: 'fixtureEcho', value: '猫' }
    assert.equal((await client.reply(control(connection, 'legacy', { payload: Buffer.from(JSON.stringify(bridge)).toString('base64') }))).failure, undefined)
    const echoed = await client.line(line => line.startsWith('EVENT ') && JSON.parse(Buffer.from(line.slice(6), 'base64')).method === 'fixtureEcho')
    assert.equal(JSON.parse(Buffer.from(echoed.slice(6), 'base64')).value, '猫', 'legacy frame crosses XPC and private child pipes')
    const wait = control(connection, 'wait')
    client.send(wait)
    assert.equal((await client.reply(control(connection, 'cancel', { target: wait.requestID }))).failure, undefined)
    const cancelled = await client.line(line => line.startsWith('REPLY ') && JSON.parse(Buffer.from(line.slice(6), 'base64')).requestID === wait.requestID)
    assert.equal(JSON.parse(Buffer.from(cancelled.slice(6), 'base64')).failure, 'cancelled')
    client.send('reconnect')
    await client.line(line => line === 'RECONNECTED')
    await pause(200) // Give invalidation delivery a bounded turn before the next hello.
    const reconnected = randomUUID()
    assert.equal((await client.reply(hello(reconnected, launch))).failure, 'recoveryRequired', 'second first-launch hello refused')
    assert.equal((await client.reply({ ...hello(reconnected, launch), resume: randomUUID() })).failure, 'recoveryRequired', 'wrong epoch refused')
    const resumed = await client.reply({ ...hello(reconnected, launch), resume: ready.hello.serviceEpoch })
    assert.equal(resumed.hello?.serviceEpoch, ready.hello.serviceEpoch, 'same peer reattaches to the same epoch')
    await client.reply(control(reconnected, 'shutdown'))
    client.child.stdin.end()
    assert.equal((await client.done).code, 0)
    await dead(Number(await file(backendPID)))
    groups.delete(Number(await file(backendPID)))
    assert.equal(readFileSync(state, 'utf8'), '{"newer":"retained-after-rollback"}')
    await pause(300)
    const launchFile = join(scratch, 'launch.json')
    writeFileSync(launchFile, JSON.stringify(launch))
    rmSync(backendPID, { force: true })
    const production = processFixture(host, ['production', launchFile, executable])
    await production.line(line => line === 'READY')
    groups.add(Number(await file(backendPID)))
    production.send({ event: 'fixtureEcho', value: 'production-client', stderr: true })
    await production.line(line => line.startsWith('EVENT ') && JSON.parse(Buffer.from(line.slice(6), 'base64')).value === 'production-client')
    // The XPC service's own stderr is discarded; Bun's must reach the host's.
    for (let i = 0; i < 100 && !production.stderr.includes('FIXTURE-STDERR production-client'); i++) await pause(20)
    assert.ok(production.stderr.includes('FIXTURE-STDERR production-client'), 'backend diagnostics reach the host stderr')
    production.send('reconnect')
    production.send({ event: 'fixtureEcho', value: 'during-reconnect' })
    await production.line(line => line === 'RECONNECTED')
    await production.line(line => line.startsWith('EVENT ') && JSON.parse(Buffer.from(line.slice(6), 'base64')).value === 'during-reconnect')
    production.send({ event: 'fixtureEcho', value: 'after-reconnect' })
    await production.line(line => line.startsWith('EVENT ') && JSON.parse(Buffer.from(line.slice(6), 'base64')).value === 'after-reconnect')
    production.send('shutdown')
    assert.equal((await production.done).code, 0, 'production client reconnects and joins repeated shutdown')
    await dead(Number(await file(backendPID)))
    groups.delete(Number(await file(backendPID)))
    await pause(300)
    // Backend death reaches the host with its failure status; nothing relaunches Bun.
    rmSync(backendPID, { force: true })
    const crashing = processFixture(host, ['production', launchFile, executable])
    await crashing.line(line => line === 'READY')
    const crashedPID = Number(await file(backendPID))
    groups.add(crashedPID)
    rmSync(backendPID)
    crashing.send({ event: 'fixtureExit' })
    const stopped = await crashing.line(line => line.startsWith('EVENT ') && JSON.parse(Buffer.from(line.slice(6), 'base64')).method === 'serviceStopped')
    assert.equal(JSON.parse(Buffer.from(stopped.slice(6), 'base64')).status, 1, 'backend failure status reaches the host')
    // serviceStopped is final: no reconnect (launchd would throttle a respawn) and
    // repeated shutdown completes locally, promptly.
    crashing.send('shutdown')
    await crashing.line(line => line === 'STOPPED', 3_000)
    assert.equal((await crashing.done).code, 0, 'shutdown after serviceStopped completes without the service')
    assert.ok(!crashing.lines.some(line => line.startsWith('FAILURE ')), 'announced stop is not an uncertain failure')
    await dead(crashedPID)
    groups.delete(crashedPID)
    assert.ok(!existsSync(backendPID), 'no replacement backend was launched for the stale client')
    console.log('SERVICE-PROCESS PASS — real XPC handshake, peer rejection, closed negotiation, cancellation, reconnection, backend death and process cleanup')
    }
  }
} finally {
  for (const child of processes) { child.stdin.destroy(); child.kill('SIGKILL') }
  for (const pid of groups) { try { process.kill(-pid, 'SIGKILL') } catch {} }
  rmSync(scratch, { recursive: true, force: true })
}
