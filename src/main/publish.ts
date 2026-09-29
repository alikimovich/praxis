import { execFile } from 'child_process'
import { promisify } from 'util'
import type { PublishResult } from '../shared/api'
import type { Describe } from './workflow-owner'
import { enclosingRepoRoot, ensureBranch, isRepoRoot } from './git'
import { publishConflictFiles, pushReconciledBranch } from './publish-reconcile'
import { aheadOfBase, changedSince, defaultBase } from './publish-scope'
import { branchExists } from './worktrees'

/**
 * The legacy publication paths (moved out of `annotations.ts` and `agent.ts`): the
 * rollback owner for the Swift workflow owner (S13, `src/service/WorkflowPublish.swift`),
 * which mirrors them step for step. `describe` is the PR description helper
 * (`generatePublishDescription` in production), injected so fixtures stay offline.
 */

const execFileP = promisify(execFile)

async function git(root: string, args: string[]): Promise<string> {
  const { stdout } = await execFileP('git', args, { cwd: root, maxBuffer: 10 * 1024 * 1024 })
  return stdout.trim()
}

export function conflictResult(files: string[], recoveryRefs: string[] = []): PublishResult {
  return {
    ok: false,
    error:
      `Publish paused because local and remote changes overlap in ${files.length} ` +
      `${files.length === 1 ? 'file' : 'files'}. Resolve each file, commit the merge, then Publish again.`,
    conflictFiles: files,
    recoveryRefs
  }
}

/**
 * A checkout still on its base branch is moved onto `trezi/<base>` before publishing
 * (`checkout -b` carries uncommitted work along). Answers the branch to publish, or
 * the refusal to show. Runs before any publish effect, under either owner.
 */
export async function healPublishBranch(root: string): Promise<{ branch: string } | { error: string } | null> {
  let branch: string
  try {
    await git(root, ['rev-parse', '--is-inside-work-tree'])
    branch = await git(root, ['rev-parse', '--abbrev-ref', 'HEAD'])
  } catch {
    return null
  }
  const base = await defaultBase(root)
  if (branch !== base) return null
  // The open-time `git:ensure` should have moved the checkout onto a trezi/* work
  // branch, but a project can still land here (ensure failed at open, the user
  // switched back, or a previous publish's recovery stranded them). `ensureBranch`
  // still refuses non-root checkouts, which stays a hard error naming the situation.
  const healed = await ensureBranch(root)
  if (!healed.isRepo) {
    const enclosing = await enclosingRepoRoot(root)
    return {
      error:
        enclosing === null
          ? `This folder isn't a git repository, so there's nothing to publish from. Run \`git init\` in ${root} (and make a first commit), then try again.`
          : `Can't publish: this folder is inside the repository at ${enclosing}, but isn't its top level, so Trezi won't switch that whole repo onto a work branch. Either open ${enclosing} as the project and publish from there, or make this folder its own repository with \`git init\` in ${root}.`
    }
  }
  if (!healed.branch || healed.branch === base || healed.error) {
    return { error: `You're on ${base} and Trezi couldn't create a work branch${healed.error ? `: ${healed.error}` : '.'}` }
  }
  return { branch: healed.branch }
}

/** Engineer handoff (v3): the Trezi changes and reviewer notes become a branch and a PR. */
export async function publishToPr(root: string, title: string, notes: number, describe: Describe): Promise<PublishResult> {
  title ||= 'trezi: design handoff'
  // --- Pre-flight: fail before any mutation. ---
  let original: string
  try {
    await git(root, ['rev-parse', '--is-inside-work-tree'])
    original = await git(root, ['rev-parse', '--abbrev-ref', 'HEAD'])
  } catch {
    return { ok: false, error: 'Not a git repository.' }
  }
  if (original === 'HEAD') {
    return { ok: false, error: 'You’re on a detached HEAD — check out a branch first.' }
  }
  try {
    await git(root, ['remote', 'get-url', 'origin'])
  } catch {
    return { ok: false, error: 'No “origin” remote — add one, then publish.' }
  }
  try {
    await execFileP('gh', ['--version'])
  } catch {
    return { ok: false, error: 'GitHub CLI (gh) not found — install it to publish a PR.' }
  }
  const changedFiles = await changedSince(root)
  if (!changedFiles.length && !notes) {
    return { ok: false, error: 'Nothing to publish — no changes or notes yet.' }
  }

  const branch = `trezi/handoff-${Date.now().toString(36)}`
  let committed = false
  try {
    await git(root, ['checkout', '-b', branch])
    // Stage tracked changes + the sidecar only — never sweep in untracked files
    // (local .env, build artifacts, unrelated WIP).
    await git(root, ['add', '-u'])
    await git(root, ['add', '--', '.trezi'])
    const staged = await git(root, ['diff', '--cached', '--name-only'])
    // Per-turn live commits mean the work is usually already IN the branch's history,
    // so "nothing staged" only means "nothing to publish" when nothing is ahead of the base.
    if (!staged && (await aheadOfBase(root, await defaultBase(root))) === 0) {
      await git(root, ['checkout', original])
      await git(root, ['branch', '-D', branch])
      return { ok: false, error: 'Nothing to publish — no changes or notes yet.' }
    }
    if (staged) {
      await git(root, ['commit', '-m', title])
      committed = true
    }
    await git(root, ['push', '-u', 'origin', branch])

    const { body } = await describe(await defaultBase(root), 'HEAD')
    const { stdout } = await execFileP('gh', ['pr', 'create', '--title', title, '--body', body], {
      cwd: root,
      maxBuffer: 10 * 1024 * 1024
    })
    const url = stdout
      .trim()
      .split('\n')
      .find((l) => /^https?:\/\//.test(l))
    return { ok: true, ...(url ? { url } : {}) }
  } catch (err) {
    const msg = (err instanceof Error ? err.message : String(err)).split('\n').slice(0, 3).join('\n')
    // Roll back to the user's branch. If we already committed, the work lives on
    // the handoff branch — say so rather than silently leaving them stranded.
    try {
      await git(root, ['checkout', original])
      if (!committed) await git(root, ['branch', '-D', branch])
    } catch {
      /* best-effort */
    }
    return committed
      ? { ok: false, error: `Committed to ${branch}, but couldn’t finish: ${msg}` }
      : { ok: false, error: msg }
  }
}

/**
 * Full "Publish": commit every change on the current trezi/* branch → reconcile
 * its remote counterpart without rewriting either history → push → create (or
 * reuse) a PR → squash-merge it into the default branch (deleting the remote
 * branch) → check out the default branch and pull → delete the merged local branch
 * → start a fresh same-named trezi/* branch off the updated base. PR-only mode stops
 * after the PR.
 */
export async function shipToMain(root: string, mode: 'merge' | 'pr', describe: Describe): Promise<PublishResult> {
  let branch: string
  try {
    await git(root, ['rev-parse', '--is-inside-work-tree'])
    branch = await git(root, ['rev-parse', '--abbrev-ref', 'HEAD'])
  } catch {
    return { ok: false, error: 'Not a git repository.' }
  }
  if (branch === 'HEAD') return { ok: false, error: 'Detached HEAD — check out a branch first.' }
  const existingConflicts = await publishConflictFiles(root)
  if (existingConflicts.length) return conflictResult(existingConflicts)
  // Default branch (main/master), from origin/HEAD; fall back to main.
  const base = await defaultBase(root)
  if (branch === base) {
    const healed = await healPublishBranch(root)
    if (healed && 'error' in healed) return { ok: false, error: healed.error }
    if (healed) branch = healed.branch
  }
  try {
    await git(root, ['remote', 'get-url', 'origin'])
  } catch {
    return { ok: false, error: 'No "origin" remote — add one, then publish.' }
  }
  try {
    await execFileP('gh', ['--version'])
  } catch {
    return { ok: false, error: 'GitHub CLI (gh) not found — install it to publish.' }
  }

  const gh = (args: string[]): Promise<{ stdout: string }> =>
    execFileP('gh', args, { cwd: root, maxBuffer: 10 * 1024 * 1024 })

  try {
    // 1. Commit all changes (gitignore-respected). Skip the commit if clean.
    await git(root, ['add', '-A'])
    const staged = await git(root, ['diff', '--cached', '--name-only'])
    if (staged) await git(root, ['commit', '-m', 'Prepare project changes for publishing'])
    const ahead = await git(root, ['rev-list', '--count', `${base}..${branch}`]).catch(() => '0')
    if (!staged && ahead === '0') {
      return { ok: false, error: `Nothing to publish — no changes since ${base}.` }
    }
    // 2. Fetch, preserve both tips, reconcile the remote branch, then push. A content
    // conflict stays in the worktree so the user can resolve each file — never
    // choose ours/theirs globally and never rewrite a shared branch.
    const pushed = await pushReconciledBranch(root, branch)
    if (!pushed.ok) return conflictResult(pushed.files, pushed.recoveryRefs)
    const msg = await describe(base, await git(root, ['rev-parse', 'HEAD']))
    // 3. Create the PR, or reuse an existing one for this branch.
    let url = ''
    try {
      const { stdout } = await gh(['pr', 'create', '--base', base, '--head', branch, '--title', msg.title, '--body', msg.body])
      url = stdout.trim().split('\n').find((l) => /^https?:\/\//.test(l)) ?? ''
    } catch (e) {
      const existing = await gh(['pr', 'view', branch, '--json', 'url', '-q', '.url']).catch(() => ({ stdout: '' }))
      url = existing.stdout.trim()
      if (!url) throw e
      // Reused an open PR: refresh its title/body to the current code summary.
      await gh(['pr', 'edit', branch, '--title', msg.title, '--body', msg.body])
    }
    if (mode === 'pr') return { ok: true, branch, ...(url ? { url } : {}) }
    // 4. Squash-merge into base + delete the remote branch, with an explicit subject
    // and body; keep GitHub's "(#N)" convention.
    const prNumber = url.match(/\/pull\/(\d+)/)?.[1]
    await gh(['pr', 'merge', branch, '--squash', '--delete-branch', '--subject',
      prNumber ? `${msg.title} (#${prNumber})` : msg.title, '--body', msg.body])
    // 5. Update the local base branch; 6. delete the merged local branch; 7. start fresh.
    await git(root, ['checkout', base])
    await git(root, ['pull', '--ff-only', 'origin', base])
    await git(root, ['branch', '-D', branch]).catch(() => {})
    await git(root, ['checkout', '-b', branch])
    return { ok: true, branch, ...(url ? { url } : {}) }
  } catch (err) {
    // A failure partway through steps 5–7 would strand the user on the base branch:
    // put them back on their work branch (check it out, else recreate it). Best-effort.
    try {
      const now = await git(root, ['rev-parse', '--abbrev-ref', 'HEAD'])
      if (now !== branch) {
        await git(root, ['checkout', branch]).catch(() => git(root, ['checkout', '-b', branch]))
      }
    } catch {
      /* couldn't restore — surface the original error below */
    }
    const msg = (err instanceof Error ? err.message : String(err)).split('\n').slice(0, 4).join('\n')
    return { ok: false, error: msg }
  }
}

/** A saved run's branch → push it and open a PR from it (no checkout: the work is committed). */
export async function publishBranch(root: string, branch: string, describe: Describe): Promise<{ ok: boolean; prUrl?: string; error?: string }> {
  if (!(await isRepoRoot(root))) return { ok: false, error: 'Not a git repository.' }
  if (!(await branchExists(root, branch))) return { ok: false, error: 'That branch no longer exists.' }
  try {
    await git(root, ['remote', 'get-url', 'origin'])
  } catch {
    return { ok: false, error: 'No “origin” remote — add one, then open a PR.' }
  }
  try {
    await execFileP('gh', ['--version'])
  } catch {
    return { ok: false, error: 'GitHub CLI (gh) not found — install it to open a PR.' }
  }
  try {
    await git(root, ['push', '-u', 'origin', branch])
    const description = await describe(await defaultBase(root), await git(root, ['rev-parse', `refs/heads/${branch}`]))
    const { stdout } = await execFileP('gh', ['pr', 'create', '--head', branch, '--title', description.title, '--body', description.body], { cwd: root })
    const prUrl = stdout.trim().split('\n').find((l) => /^https?:\/\//.test(l)) ?? stdout.trim()
    return { ok: true, prUrl }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) }
  }
}
