import { execFile } from 'child_process'
import { promisify } from 'util'
import type { UpdateStatus } from '../shared/api'

/**
 * Praxis self-update — detection half. The app is distributed as a git checkout,
 * so an "update" is: does HEAD trail the tracked remote? This module is
 * electron-free (child_process + git only), like git.ts, so it's unit-testable
 * against a temp repo. The electron-side wiring (IPC, apply, relaunch) lives in
 * update-ipc.ts. Applying an update shells out to `bin/praxis.mjs --update` — the
 * single source of truth for pull + install + build.
 */

const execFileP = promisify(execFile)

const git = (root: string, args: string[], timeout = 15000): Promise<{ stdout: string }> =>
  execFileP('git', args, { cwd: root, timeout, maxBuffer: 4 * 1024 * 1024 }) as Promise<{
    stdout: string
  }>

/** Parse `git rev-list --count` output into a non-negative commit count (0 on junk). */
export function parseBehind(revListCount: string): number {
  const n = Number.parseInt(String(revListCount).trim(), 10)
  return Number.isFinite(n) && n > 0 ? n : 0
}

/** Turn a behind-count (+ newest commit subject) into a renderer-facing status. */
export function deriveStatus(behind: number, subject?: string): UpdateStatus {
  if (behind > 0) return { status: 'available', behind, subject: subject?.trim() || undefined }
  return { status: 'idle', behind: 0 }
}

/**
 * Compare HEAD to its tracked upstream (fallback origin/main) after a fetch.
 * Returns `idle` for every soft failure — not a git checkout, no upstream,
 * offline — so a source install that isn't wired to a remote simply never nags.
 */
export async function checkForUpdate(repoRoot: string): Promise<UpdateStatus> {
  try {
    let upstream: string
    try {
      const { stdout } = await git(repoRoot, [
        'rev-parse',
        '--abbrev-ref',
        '--symbolic-full-name',
        '@{u}'
      ])
      upstream = stdout.trim()
    } catch {
      upstream = 'origin/main'
    }
    const slash = upstream.indexOf('/')
    const remote = slash > 0 ? upstream.slice(0, slash) : 'origin'
    const branch = slash > 0 ? upstream.slice(slash + 1) : 'main'

    await git(repoRoot, ['fetch', remote, branch])
    const { stdout: count } = await git(repoRoot, ['rev-list', '--count', `HEAD..${upstream}`])
    const behind = parseBehind(count)

    let subject: string | undefined
    if (behind > 0) {
      try {
        const { stdout } = await git(repoRoot, ['log', '-1', '--format=%s', upstream])
        subject = stdout.trim()
      } catch {
        // subject is a nicety; a missing one doesn't change that an update exists.
      }
    }
    return deriveStatus(behind, subject)
  } catch {
    return { status: 'idle', behind: 0 }
  }
}
