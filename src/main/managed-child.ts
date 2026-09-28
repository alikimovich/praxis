import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'

const guardedChildren = new WeakSet<object>()

/** Bun retains command/domain policy; Swift guards detached groups against Bun
 * or service death through the inherited, read-only lifetime pipe at fd 3. */
export function spawnManagedCommand(command: string, options: { cwd: string; env: NodeJS.ProcessEnv }): ChildProcessWithoutNullStreams {
  const guardian = process.env.TREZI_SERVICE_EXECUTABLE
  let child: ChildProcessWithoutNullStreams
  if (process.env.TREZI_SERVICE_LOCKED === '1') {
    if (!guardian) throw new Error('Swift lifetime guardian is unavailable')
    child = spawn(guardian, ['--guard', '/bin/sh', '-c', command], {
      ...options, detached: true, stdio: ['pipe', 'pipe', 'pipe', 3]
    }) as ChildProcessWithoutNullStreams
    guardedChildren.add(child)
  } else {
    child = spawn(command, { ...options, shell: true, detached: true })
  }
  return child
}

export function isGuardedChild(child: object): boolean {
  return guardedChildren.has(child)
}
