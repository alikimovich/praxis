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
  env?: NodeJS.ProcessEnv,
  timeout = 15000
): Promise<{ stdout: string; stderr: string }> =>
  execFileP('git', args, {
    cwd,
    timeout,
    maxBuffer: 16 * 1024 * 1024,
    ...(env ? { env: { ...process.env, ...env } } : {})
  }) as Promise<{ stdout: string; stderr: string }>

// `git worktree add` mutates shared admin state under .git/worktrees and is NOT
// concurrency-safe (firing several comment spawns at once can race). Serialize the
// create path behind a single in-process chain — creates are fast, so this is cheap.
let createChain: Promise<unknown> = Promise.resolve()

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
 * Snapshot the live tree's FULL current state — tracked modifications AND brand-new
 * untracked files — into a dangling base commit, WITHOUT touching the live tree or
 * its index. `git stash create` omits untracked files (no `-u`), and the dsgn
 * interactive agent constantly creates new files, so we build the snapshot in a
 * throwaway index instead: seed it from HEAD, `add -A` the whole working tree
 * (`.gitignore` keeps node_modules/.env out), write a tree, commit it off HEAD.
 * A clean tree just yields HEAD.
 */
async function captureBase(repoRoot: string, indexFile: string): Promise<string> {
  const head = (await git(repoRoot, ['rev-parse', 'HEAD'])).stdout.trim()
  const env: NodeJS.ProcessEnv = {
    GIT_INDEX_FILE: indexFile,
    GIT_AUTHOR_NAME: 'dsgn',
    GIT_AUTHOR_EMAIL: 'dsgn@local',
    GIT_COMMITTER_NAME: 'dsgn',
    GIT_COMMITTER_EMAIL: 'dsgn@local'
  }
  try {
    await git(repoRoot, ['read-tree', 'HEAD'], env)
    await git(repoRoot, ['add', '-A'], env)
    const tree = (await git(repoRoot, ['write-tree'], env)).stdout.trim()
    if (!tree) return head
    const commit = (
      await git(repoRoot, ['commit-tree', tree, '-p', head, '-m', 'dsgn: spawn base (WIP snapshot)'], env)
    ).stdout.trim()
    return commit || head
  } catch {
    return head // any hiccup — fork off HEAD rather than fail the spawn
  } finally {
    await rm(indexFile, { force: true }).catch(() => {})
  }
}

/**
 * Create a fresh worktree forked from the main tree's CURRENT state — including the
 * interactive agent's uncommitted WIP (tracked + untracked, via `captureBase`).
 * node_modules / .env are gitignored (so absent in a fresh checkout) — symlink them
 * in so a spawned agent can typecheck/run. Serialized (see `createChain`) because
 * `git worktree add` races on shared admin state.
 */
export function createWorktree(
  repoRoot: string,
  worktreesDir: string,
  opts: { label?: string; id?: string } = {}
): Promise<Worktree> {
  const run = createChain.then(() => doCreateWorktree(repoRoot, worktreesDir, opts))
  createChain = run.catch(() => {}) // keep the chain alive even if one create fails
  return run
}

async function doCreateWorktree(
  repoRoot: string,
  worktreesDir: string,
  opts: { label?: string; id?: string }
): Promise<Worktree> {
  // The id may be assigned up front (so a queued spawn's rail row keeps a stable id
  // before its worktree exists); otherwise generate one.
  const id = opts.id ?? randomUUID().slice(0, 8)
  const branch = normalizeBranchName(`comment-${id}`)
  const dir = join(worktreesDir, id)
  await mkdir(worktreesDir, { recursive: true })

  const baseSha = await captureBase(repoRoot, join(worktreesDir, `.index-${id}`))
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
  // The spawn runs bypassPermissions (headless — no card to approve), which skips
  // the canUseTool sidecar deny. `.dsgn/` is dsgn-managed and NOT gitignored in
  // target repos, so unstage it here: a spawn's accidental sidecar writes must never
  // reach the durable branch or the apply patch. (The Bash allowlist is deferred.)
  await git(wt.path, ['reset', '-q', '--', '.dsgn']).catch(() => {})
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
 * The spawn's net change read back from its branch AFTER the worktree is gone (v8 F1
 * Phase 2 — Apply/PR). A spawn makes exactly one commit on top of its WIP-snapshot
 * base, so `<branch>^..<branch>` is precisely the spawn's edits (excluding the base
 * WIP, which is already in the live tree). Empty if the branch is missing.
 */
export async function branchPatch(repoRoot: string, branch: string): Promise<string> {
  try {
    return (
      await git(repoRoot, ['diff', '--full-index', '--binary', `${branch}^..${branch}`])
    ).stdout
  } catch {
    return ''
  }
}

/** Delete a spawn's branch (v8 F1 Phase 2 — Discard). Never throws. */
export async function deleteBranch(repoRoot: string, branch: string): Promise<void> {
  await git(repoRoot, ['branch', '-D', branch]).catch(() => {})
}

/** Does this branch exist locally? */
export async function branchExists(repoRoot: string, branch: string): Promise<boolean> {
  try {
    await git(repoRoot, ['rev-parse', '--verify', '--quiet', `refs/heads/${branch}`])
    return true
  } catch {
    return false
  }
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
 * Startup recovery: a crash/quit can leave checkouts in worktreesDir whose admin
 * entries git no longer tracks. Prune stale entries, then for each leftover commit
 * any dirty work to its branch (so a crashed-mid-run spawn isn't lost) and remove the
 * checkout. `skip` names ids that are CURRENTLY ACTIVE (a live spawn this session) —
 * never touch those. Branches are kept; we only reclaim the on-disk checkouts.
 * Returns the ids it reclaimed. Never throws.
 */
export async function pruneOrphans(
  repoRoot: string,
  worktreesDir: string,
  skip: Set<string> = new Set()
): Promise<string[]> {
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
    if (skip.has(id)) continue // a live spawn this session — leave it alone
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
