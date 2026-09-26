import type { ChildProcess } from 'node:child_process'

// Retain ownership after the shell exits: its descendants may still be alive.
const groups = new Set<number>()
const stopping = new Map<number, Promise<void>>()
const alive = (pid: number) => {
  try { process.kill(-pid, 0); return true } catch { return false }
}
function signal(pid: number, value: NodeJS.Signals) {
  try { process.kill(-pid, value) } catch { /* Already gone. Never signal unrelated groups. */ }
}
export function trackDevServer(child: ChildProcess) {
  if (!child.pid) return
  const pid = child.pid
  groups.add(pid)
  child.once('exit', () => { void stopDevServer(child) })
}
export function stopDevServer(child: ChildProcess): Promise<void> {
  const pid = child.pid
  if (!pid || !groups.has(pid)) return Promise.resolve()
  const pending = stopping.get(pid)
  if (pending) return pending
  signal(pid, 'SIGTERM')
  const done = (async () => {
    const deadline = Date.now() + 1000
    while (alive(pid) && Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, 25))
    if (alive(pid)) signal(pid, 'SIGKILL')
    // Give the OS time to release listener sockets after the forced termination.
    const killedDeadline = Date.now() + 500
    while (alive(pid) && Date.now() < killedDeadline) await new Promise(resolve => setTimeout(resolve, 25))
    groups.delete(pid)
  })().finally(() => { stopping.delete(pid) })
  stopping.set(pid, done)
  return done
}
export async function drainDevServers() {
  await Promise.all([...stopping.values()])
}
/** Synchronous fallback for explicit process.exit()/fatal exit: timers cannot run. */
export function forceStopDevServers() {
  for (const pid of groups) signal(pid, 'SIGKILL')
  groups.clear()
}
