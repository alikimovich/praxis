import { execFile } from 'child_process'
import { realpath } from 'fs/promises'
import { promisify } from 'util'
import type { BranchResult } from '../shared/api'

/**
 * Branch management for the opened project: dsgn does its work on a `dsgn/<…>`
 * branch so the user's main branch stays clean. Pure (child_process + git only,
 * no electron) so it's unit-testable against a temp repo.
 */

const execFileP = promisify(execFile)
const DSGN_PREFIX = 'dsgn/'
const msg = (e: unknown): string => (e instanceof Error ? e.message : String(e))

const git = (root: string, args: string[], timeout = 8000): Promise<{ stdout: string }> =>
  execFileP('git', args, { cwd: root, timeout, maxBuffer: 4 * 1024 * 1024 }) as Promise<{
    stdout: string
  }>

export async function isGitRepo(root: string): Promise<boolean> {
  try {
    const { stdout } = await git(root, ['rev-parse', '--is-inside-work-tree'])
    return stdout.trim() === 'true'
  } catch {
    return false
  }
}

/**
 * Only manage the branch when the opened folder is the repo's TOP LEVEL — not a
 * subdirectory of a larger repo (e.g. a fixture inside this repo, or a package
 * in a monorepo), where switching the whole repo's branch would be surprising.
 */
export async function isRepoRoot(root: string): Promise<boolean> {
  try {
    const { stdout } = await git(root, ['rev-parse', '--show-toplevel'])
    const top = stdout.trim()
    if (!top) return false
    return (await realpath(top)) === (await realpath(root))
  } catch {
    return false
  }
}

export async function getCurrentBranch(root: string): Promise<string | null> {
  try {
    const { stdout } = await git(root, ['rev-parse', '--abbrev-ref', 'HEAD'])
    const b = stdout.trim()
    return b && b !== 'HEAD' ? b : null // null = detached HEAD
  } catch {
    return null
  }
}

/** Make a git-ref-safe `dsgn/<…>` branch name from a requested name or bare suffix. */
export function normalizeBranchName(requested: string): string {
  const raw = requested.trim()
  const withPrefix = raw.startsWith(DSGN_PREFIX) ? raw : DSGN_PREFIX + raw
  const suffix = withPrefix
    .slice(DSGN_PREFIX.length)
    .replace(/[\s~^:?*[\]\\@{}]+/g, '-') // git-forbidden chars + whitespace → -
    .replace(/\.{2,}/g, '-') // no ".."
    .replace(/\/{2,}/g, '/') // collapse //
    .replace(/^[/.\-]+|[/.\-]+$/g, '') // trim leading/trailing / . -
  return DSGN_PREFIX + (suffix || 'work')
}

async function branchExists(root: string, name: string): Promise<boolean> {
  try {
    await git(root, ['rev-parse', '--verify', '--quiet', `refs/heads/${name}`])
    return true
  } catch {
    return false
  }
}

/** Switch to (creating if needed) a specific dsgn/* branch. */
export async function switchBranch(root: string, requested: string): Promise<BranchResult> {
  if (!(await isRepoRoot(root))) return { isRepo: false, branch: null, created: false }
  const name = normalizeBranchName(requested)
  const cur = await getCurrentBranch(root)
  if (cur === name) return { isRepo: true, branch: name, created: false }
  const existed = await branchExists(root, name)
  try {
    // checkout -b carries uncommitted changes onto the new branch (nothing lost);
    // checking out an existing branch can fail if changes conflict — report that.
    await git(root, existed ? ['checkout', name] : ['checkout', '-b', name])
    return { isRepo: true, branch: name, created: !existed }
  } catch (e) {
    return { isRepo: true, branch: cur, created: false, error: msg(e) }
  }
}

/**
 * Ensure work happens on a `dsgn/*` branch. If already on one, keep it; else
 * create `dsgn/<current-branch>` (or `dsgn/work` when detached) off HEAD.
 */
export async function ensureBranch(root: string): Promise<BranchResult> {
  if (!(await isRepoRoot(root))) return { isRepo: false, branch: null, created: false }
  const cur = await getCurrentBranch(root)
  if (cur && cur.startsWith(DSGN_PREFIX)) return { isRepo: true, branch: cur, created: false }
  return switchBranch(root, DSGN_PREFIX + (cur ?? 'work'))
}
