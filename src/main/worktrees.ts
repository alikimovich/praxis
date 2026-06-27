import { execFile } from 'child_process'
import { mkdir, symlink, writeFile, rm, readdir, stat } from 'fs/promises'
import { randomUUID } from 'crypto'
import { join } from 'path'
import { promisify } from 'util'
import { normalizeBranchName } from './git'

/**
 * Git-worktree management for F1 (comment → parallel agent session). Each spawned
 * comment agent runs in its OWN `git worktree` on a `dsgn/comment-<id>` branch — a
 * private on-disk checkout that shares the repo's object store — so N comments edit
 * the repo truly in parallel with zero cross-writes, and the user's live preview
 * (which stays on the main working tree) is undisturbed until they accept one.
 *
 * Pure (child_process + git + fs only, no electron) so it's unit-testable against a
 * temp repo. Mirrors git.ts's style.
 */

const execFileP = promisify(execFile)
const msg = (e: unknown): string => (e instanceof Error ? e.message : String(e))

const git = (
  cwd: string,
  args: string[],
  timeout = 15000
): Promise<{ stdout: string; stderr: string }> =>
  execFileP('git', args, { cwd, timeout, maxBuffer: 16 * 1024 * 1024 }) as Promise<{
    stdout: string
    stderr: string
  }>

export interface Worktree {
  /** Short unique id; also the worktree directory name and the branch suffix. */
  id: string
  repoRoot: string
  /** The on-disk checkout (under worktreesDir). */
  path: string
  /** `dsgn/comment-<id>`. */
  branch: string
  /** The commit the worktree forked from (main-tree HEAD + any uncommitted WIP). */
  baseSha: string
}

/**
 * Create a fresh worktree forked from the main tree's CURRENT state — including the
 * interactive agent's uncommitted WIP. We capture that WIP via `git stash create`
 * (which writes a dangling commit WITHOUT touching the live working tree or the
 * stash list), and fork the worktree off it; if the tree is clean, stash create is
 * empty and we fork off HEAD. node_modules / .env are gitignored (so absent in a
 * fresh checkout) — symlink them in so a spawned agent can typecheck/run.
 */
export async function createWorktree(
  repoRoot: string,
  worktreesDir: string,
  opts: { label?: string } = {}
): Promise<Worktree> {
  const id = randomUUID().slice(0, 8)
  const branch = normalizeBranchName(`comment-${id}`)
  const dir = join(worktreesDir, id)
  await mkdir(worktreesDir, { recursive: true })

  // Capture the live tree's WIP into a dangling commit (no side effects on the tree).
  let baseSha = ''
  try {
    baseSha = (await git(repoRoot, ['stash', 'create'])).stdout.trim()
  } catch {
    /* nothing to stash / not allowed — fall through to HEAD */
  }
  if (!baseSha) baseSha = (await git(repoRoot, ['rev-parse', 'HEAD'])).stdout.trim()

  await git(repoRoot, ['worktree', 'add', '-b', branch, dir, baseSha])

  // Symlink gitignored runtime deps so the spawn can build (best-effort).
  for (const name of ['node_modules', '.env']) {
    try {
      await symlink(join(repoRoot, name), join(dir, name))
    } catch {
      /* absent or already present — fine */
    }
  }
  return { id, repoRoot, path: dir, branch, baseSha }
}

/**
 * Stage + commit everything the spawn changed in its worktree, so the run leaves a
 * durable branch. Returns whether anything was committed (an empty diff → no commit)
 * and the authoritative list of files it touched (from git, not a tool heuristic).
 */
export async function commitWorktree(
  wt: Worktree,
  message: string
): Promise<{ committed: boolean; files: string[] }> {
  await git(wt.path, ['add', '-A'])
  const staged = (await git(wt.path, ['diff', '--cached', '--name-only'])).stdout
    .split('\n')
    .map((s) => s.trim())
    .filter(Boolean)
  if (staged.length === 0) return { committed: false, files: [] }
  // Identity is forced inline so a spawn commits even if the repo has no user.name.
  await git(wt.path, [
    '-c',
    'user.name=dsgn',
    '-c',
    'user.email=dsgn@local',
    'commit',
    '-m',
    message || 'dsgn comment edit'
  ])
  return { committed: true, files: staged }
}

/** The spawn's full change as an applyable patch (its branch vs the fork point).
 *  `--full-index`/`--binary` so `git apply --3way` can locate the base blobs (it
 *  reconstructs the merge ancestor from the patch's blob SHAs). */
export async function diffWorktree(wt: Worktree): Promise<string> {
  return (
    await git(wt.path, ['diff', '--full-index', '--binary', `${wt.baseSha}..HEAD`])
  ).stdout
}

/**
 * Apply a spawn's patch onto the LIVE working tree — NOT `git merge` (which fails
 * when the interactive agent has uncommitted WIP). Strategy:
 *  1. plain `git apply` (working-tree based) — clean when the live tree still
 *     matches the spawn's fork point, the common case, and tolerates the dirty WIP.
 *  2. on failure, `git apply --3way` (index/HEAD based) — handles real context
 *     drift (e.g. another spawn already landed) and, on textual overlap, leaves
 *     conflict markers for the user to resolve in the ConflictPanel.
 * An empty patch is a no-op success.
 */
export async function applyToWorkingTree(
  repoRoot: string,
  patchText: string,
  tmpDir: string
): Promise<{ ok: boolean; conflict: boolean; error?: string }> {
  if (!patchText.trim()) return { ok: true, conflict: false }
  await mkdir(tmpDir, { recursive: true })
  const patchFile = join(tmpDir, `apply-${randomUUID().slice(0, 8)}.patch`)
  await writeFile(patchFile, patchText, 'utf8')
  try {
    try {
      await git(repoRoot, ['apply', '--whitespace=nowarn', patchFile])
      return { ok: true, conflict: false }
    } catch {
      // Context drifted — fall back to a 3-way merge against the index.
    }
    try {
      await git(repoRoot, ['apply', '--3way', '--whitespace=nowarn', patchFile])
      return { ok: true, conflict: false }
    } catch (e) {
      // `git apply --3way` exits non-zero on overlap but still writes the markers.
      const text = msg(e)
      const conflict = /with conflicts|U \w|<<<<<<</.test(text)
      return { ok: false, conflict, error: text }
    }
  } finally {
    await rm(patchFile, { force: true }).catch(() => {})
  }
}

/**
 * Tear down a worktree: remove its checkout and (unless `keepBranch`) delete its
 * branch. Never throws — teardown runs in finalizers. `keepBranch` is set when the
 * spawn committed real work (the branch is the durable record for PR/Apply/Discard).
 */
export async function removeWorktree(
  repoRoot: string,
  wt: Worktree,
  opts: { keepBranch?: boolean } = {}
): Promise<void> {
  try {
    await git(repoRoot, ['worktree', 'remove', '--force', wt.path])
  } catch {
    await rm(wt.path, { recursive: true, force: true }).catch(() => {})
  }
  try {
    await git(repoRoot, ['worktree', 'prune'])
  } catch {
    /* ignore */
  }
  if (!opts.keepBranch) {
    await git(repoRoot, ['branch', '-D', wt.branch]).catch(() => {})
  }
}

/**
 * Startup recovery: a crash can leave checkouts in worktreesDir whose admin entries
 * git no longer tracks. Prune stale entries, then remove any leftover directory.
 * Branches with committed work are kept (they're the durable artifacts); we only
 * reclaim the on-disk checkouts. Returns the ids it reclaimed. Never throws.
 */
export async function pruneOrphans(repoRoot: string, worktreesDir: string): Promise<string[]> {
  try {
    await git(repoRoot, ['worktree', 'prune'])
  } catch {
    /* ignore */
  }
  let entries: string[] = []
  try {
    entries = await readdir(worktreesDir)
  } catch {
    return [] // dir doesn't exist yet — nothing to reclaim
  }
  const reclaimed: string[] = []
  for (const id of entries) {
    const dir = join(worktreesDir, id)
    try {
      if (!(await stat(dir)).isDirectory()) continue
    } catch {
      continue
    }
    // Best-effort: commit any dirty leftover to its branch before removing the dir,
    // so a crashed-mid-run spawn's work isn't lost.
    try {
      await git(dir, [
        '-c',
        'user.name=dsgn',
        '-c',
        'user.email=dsgn@local',
        'add',
        '-A'
      ])
      await git(dir, [
        '-c',
        'user.name=dsgn',
        '-c',
        'user.email=dsgn@local',
        'commit',
        '-m',
        'dsgn: recovered orphaned worktree'
      ]).catch(() => {})
    } catch {
      /* not a worktree / already clean */
    }
    try {
      await git(repoRoot, ['worktree', 'remove', '--force', dir])
    } catch {
      await rm(dir, { recursive: true, force: true }).catch(() => {})
    }
    reclaimed.push(id)
  }
  try {
    await git(repoRoot, ['worktree', 'prune'])
  } catch {
    /* ignore */
  }
  return reclaimed
}
