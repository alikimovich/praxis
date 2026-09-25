import { spawn } from 'node:child_process'
import { closeSync, mkdtempSync, openSync, rmSync, createReadStream, writeFileSync, readFileSync, unlinkSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createInterface } from 'node:readline'

// Only recognize the test's own status line, not arbitrary mentions of SKIP.
export async function skipReason(log, name) {
  const label = name.toUpperCase().replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replaceAll('-', '[- ]')
  const marker = new RegExp(`^(?:SKIP\\b|${label}(?: LIVE)? SKIP\\b)`)
  const input = createReadStream(log)
  try {
    for await (const line of createInterface({ input, crlfDelay: Infinity })) {
      if (marker.test(line)) return line
    }
    return null
  } finally { input.destroy() }
}

export async function runCommand({ command, args, cwd, name, log, timeoutMs, signal, graceMs = 2000 }) {
  const start = Date.now()
  if (signal?.aborted) return { name, outcome: 'CANCELLED', duration: 0, log }
  const profile = mkdtempSync(join(tmpdir(), `praxis-test-${name}-`))
  let fd
  let child
  let timer
  let escalation
  let timedOut = false
  let cancelled = false
  let spawnError
  const kill = (sig) => {
    if (!child?.pid) return
    try {
      // Every test owns a process group, including its ordinary server children.
      if (process.platform === 'win32') child.kill(sig)
      else process.kill(-child.pid, sig)
    } catch (error) { if (error.code !== 'ESRCH') spawnError ??= error }
  }
  const stop = () => {
    kill('SIGTERM')
    escalation ??= setTimeout(() => kill('SIGKILL'), graceMs)
  }
  const abort = () => { cancelled = true; stop() }
  try {
    fd = openSync(log, 'w')
    child = spawn(command, args, {
      cwd, detached: process.platform !== 'win32', stdio: ['ignore', fd, fd],
      env: { ...process.env, PRAXIS_USER_DATA: profile }
    })
    signal?.addEventListener('abort', abort, { once: true })
    if (signal?.aborted) abort()
    timer = setTimeout(() => { timedOut = true; stop() }, timeoutMs)
    const result = await new Promise((resolve) => {
      child.on('error', (error) => { spawnError = error })
      child.on('close', (code, exitSignal) => resolve({ code, signal: exitSignal }))
    })
    // Reap leftover descendants before another test can use shared fixtures.
    kill('SIGKILL')
    const reason = result.code === 0 && !spawnError && !cancelled && !timedOut
      ? await skipReason(log, name) : null
    const outcome = cancelled ? 'CANCELLED' : timedOut ? 'TIMEOUT'
      : spawnError || result.code !== 0 || result.signal ? 'FAIL' : reason ? 'SKIP' : 'PASS'
    return { name, outcome, duration: Date.now() - start, log, ...result,
      ...(reason ? { note: reason } : {}), ...(spawnError ? { note: spawnError.message } : {}) }
  } finally {
    clearTimeout(timer)
    clearTimeout(escalation)
    signal?.removeEventListener('abort', abort)
    kill('SIGKILL')
    if (fd !== undefined) closeSync(fd)
    rmSync(profile, { recursive: true, force: true })
  }
}

// Exclusive tests are barriers: neither their predecessors nor successors overlap.
export async function runQueue(items, jobs, run, signal) {
  if (!Number.isSafeInteger(jobs) || jobs < 1) throw new Error('jobs must be a positive integer')
  const results = new Array(items.length)
  let cursor = 0
  async function batch(indices) {
    let next = 0
    await Promise.all(Array.from({ length: Math.min(jobs, indices.length) }, async () => {
      while (next < indices.length) {
        const index = indices[next++]
        results[index] = signal?.aborted
          ? { name: items[index].name, outcome: 'CANCELLED', duration: 0 }
          : await run(items[index])
      }
    }))
  }
  while (cursor < items.length) {
    if (items[cursor].exclusive) await batch([cursor++])
    else {
      const indices = []
      while (cursor < items.length && !items[cursor].exclusive) indices.push(cursor++)
      await batch(indices)
    }
  }
  return results
}

// Exclusive barriers cannot protect against a second runner in the same checkout.
export function acquireRunLock(path) {
  let fd
  try {
    fd = openSync(path, 'wx')
  } catch (error) {
    if (error.code !== 'EEXIST') throw error
    let owner = 'unknown'
    try { owner = readFileSync(path, 'utf8').trim() } catch {}
    throw new Error(`Another suite owns ${path} (${owner}). Wait for it to finish. If it crashed, verify its PID is gone before removing the lock.`)
  }
  try { writeFileSync(fd, `pid=${process.pid}\n`) }
  catch (error) { unlinkSync(path); throw error }
  finally { closeSync(fd) }
  let released = false
  return () => {
    if (!released) { released = true; unlinkSync(path) }
  }
}
