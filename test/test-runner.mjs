import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, writeFileSync, readFileSync, existsSync, rmSync, mkdirSync, chmodSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { acquireRunLock, runCommand, runQueue, skipReason } from './helpers/test-runner.mjs'

const root = mkdtempSync(join(tmpdir(), 'praxis-runner-check-'))
const fixture = join(root, 'worker.mjs')
writeFileSync(fixture, `
import { writeFileSync } from 'node:fs'
import { spawn } from 'node:child_process'
const [mode, file] = process.argv.slice(2)
writeFileSync(file, JSON.stringify({ profile: process.env.PRAXIS_USER_DATA, pid: process.pid }))
if (mode === 'skip') console.log('SKIP missing fixture')
else if (mode === 'partial') console.log('PARTIAL SKIP — one provider unavailable')
else if (mode === 'fail') { console.log('SKIP does not override failure'); process.exitCode = 1 }
else if (mode === 'tree') {
  const child = spawn(process.execPath, ['-e', 'process.on("SIGTERM", () => {}); setInterval(() => {}, 1000)'], { stdio: 'ignore' })
  writeFileSync(file + '.child', String(child.pid))
  process.on('SIGTERM', () => {})
  setInterval(() => {}, 1000)
}
else if (mode === 'hang') { process.on('SIGTERM', () => {}); setInterval(() => {}, 1000) }
else console.log('an assertion about SKIP should still pass')
`)
let id = 0
const run = async (mode, extra = {}) => {
  const name = mode === 'partial' ? 'partial' : `case-${id++}`
  const state = join(root, `${name}.json`)
  const result = await runCommand({ command: 'node', args: [fixture, mode, state], cwd: root,
    name, log: join(root, `${name}.log`), timeoutMs: 5000, graceMs: 30, ...extra })
  if (existsSync(state)) assert.equal(existsSync(JSON.parse(readFileSync(state)).profile), false, 'profile cleaned')
  return result
}
try {
  const lockPath = join(root, 'lock')
  const unlock = acquireRunLock(lockPath)
  assert.throws(() => acquireRunLock(lockPath), /Another suite owns/)
  unlock()
  unlock()
  acquireRunLock(lockPath)()
  assert.equal(existsSync(lockPath), false)
  assert.equal((await run('pass')).outcome, 'PASS')
  assert.equal((await run('skip')).outcome, 'SKIP')
  assert.equal((await run('partial')).outcome, 'SKIP')
  assert.equal((await run('fail')).outcome, 'FAIL')
  const timeout = await run('hang', { timeoutMs: 300 })
  assert.equal(timeout.outcome, 'TIMEOUT')
  assert(timeout.duration < 4000, 'timeout escalates without hanging')
  if (process.platform !== 'win32') {
    const tree = await run('tree', { timeoutMs: 500 })
    assert.equal(tree.outcome, 'TIMEOUT')
    const childPid = Number(readFileSync(join(root, `${tree.name}.json.child`), 'utf8'))
    const alive = () => { try { process.kill(childPid, 0); return true } catch (e) { if (e.code === 'ESRCH') return false; throw e } }
    for (let i = 0; i < 50 && alive(); i++) await new Promise(resolve => setTimeout(resolve, 20))
    assert.equal(alive(), false, 'timeout reaps a stubborn descendant, not just the test process')
  }
  const spawnFailure = await run('pass', { command: join(root, 'missing-command') })
  assert.equal(spawnFailure.outcome, 'FAIL')
  assert.match(spawnFailure.note, /ENOENT/)
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 300)
  const cancelled = await run('hang', { signal: controller.signal })
  clearTimeout(timer)
  assert.equal(cancelled.outcome, 'CANCELLED')
  assert.equal((await run('pass', { signal: controller.signal })).outcome, 'CANCELLED')

  // Assert overlap and a hard exclusive barrier, independently of wall-clock speed.
  let active = 0
  let peak = 0
  const events = []
  const items = ['a', 'b', 'exclusive', 'c', 'd'].map(name => ({ name, exclusive: name === 'exclusive' }))
  const results = await runQueue(items, 2, async item => {
    if (item.exclusive) assert.equal(active, 0)
    active++
    peak = Math.max(active, peak)
    events.push(`start:${item.name}`)
    await new Promise(resolve => setTimeout(resolve, item.name === 'a' ? 40 : 10))
    if (item.exclusive) assert.equal(active, 1)
    active--
    events.push(`end:${item.name}`)
    return { name: item.name }
  })
  assert.equal(peak, 2)
  assert.deepEqual(results.map(r => r.name), items.map(r => r.name), 'stable report order')
  assert(events.indexOf('end:a') < events.indexOf('start:exclusive'))
  assert(events.indexOf('end:exclusive') < events.indexOf('start:c'))
  await assert.rejects(runQueue([], 0, () => {}), /positive integer/)
  let calls = 0
  const stopped = await runQueue(items, 2, () => { calls++ }, controller.signal)
  assert.equal(calls, 0)
  assert(stopped.every(r => r.outcome === 'CANCELLED'))
  const marker = join(root, 'marker.log')
  writeFileSync(marker, 'ok — pruneOrphans must SKIP a live checkout\nOTHER SKIP — unrelated\n')
  assert.equal(await skipReason(marker, 'worktrees'), null)
  writeFileSync(marker, 'AUTO-RECONCILIATION LIVE SKIP — unavailable\n')
  assert.match(await skipReason(marker, 'auto-reconciliation-live'), /unavailable/)
  // Exercise the actual CLI with a tiny checkout and a fake build executable.
  // This proves live-only builds, one build across tiers, build blocking, and reports.
  if (process.platform !== 'win32') {
    const cli = join(root, 'cli')
    mkdirSync(join(cli, 'test/helpers'), { recursive: true })
    mkdirSync(join(cli, 'node_modules/.bin'), { recursive: true })
    writeFileSync(join(cli, 'test/run.mjs'), readFileSync(new URL('./run.mjs', import.meta.url)))
    writeFileSync(join(cli, 'test/helpers/test-runner.mjs'), readFileSync(new URL('./helpers/test-runner.mjs', import.meta.url)))
    writeFileSync(join(cli, 'test/smoke.mjs'), "console.log('SMOKE OK')")
    writeFileSync(join(cli, 'test/next-integration.mjs'), "console.log('SKIP real Next fixture')")
    const build = join(cli, 'node_modules/.bin/electron-vite')
    writeFileSync(build, '#!/usr/bin/env node\n' +
      'require("node:fs").appendFileSync("builds.txt", "build\\n"); process.exitCode = Number(process.env.PRAXIS_RUNNER_FAIL_BUILD || 0)')
    chmodSync(build, 0o755)
    const invoke = (args, failBuild = false) => spawnSync('node', [join(cli, 'test/run.mjs'), ...args], {
      cwd: cli, encoding: 'utf8', timeout: 10000,
      env: { ...process.env, PRAXIS_RUNNER_FAIL_BUILD: failBuild ? '1' : '0' }
    })
    const report = result => {
      assert.equal(result.error, undefined)
      const path = /^Report: (.+)$/m.exec(result.stdout)?.[1]
      assert(path, result.stdout + result.stderr)
      assert.equal(existsSync(join(cli, 'test/artifacts/runs/.runner-lock')), false)
      return JSON.parse(readFileSync(path))
    }
    const success = invoke(['electron', 'live', '--filter=smoke,next-integration'])
    assert.equal(success.status, 0, success.stderr)
    const successfulReport = report(success)
    assert.deepEqual(successfulReport.counts, { PASS: 1, SKIP: 1 })
    assert.equal(readFileSync(join(cli, 'builds.txt'), 'utf8'), 'build\n')
    const blocked = invoke(['electron', 'live', '--filter=smoke,next-integration'], true)
    assert.equal(blocked.status, 1)
    assert.deepEqual(report(blocked).counts, { BLOCKED: 2 })
    assert.equal(readFileSync(join(cli, 'builds.txt'), 'utf8'), 'build\nbuild\n')
    const liveOnly = invoke(['live', '--filter=next-integration'])
    assert.equal(liveOnly.status, 0)
    assert.equal(report(liveOnly).builds.length, 1)
    assert.equal(report(liveOnly).counts.SKIP, 1)
    for (const args of [['unit', '--jobs=0'], ['unit', '--filter=missing'], ['constructor']]) {
      assert.equal(invoke(args).status, 2)
    }
  }
  console.log('TEST-RUNNER OK — bounded concurrency, barriers, outcomes, timeout, cancellation, cleanup')
} finally {
  rmSync(root, { recursive: true, force: true })
}
