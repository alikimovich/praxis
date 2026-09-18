import { execFile } from 'node:child_process'
import { access } from 'node:fs/promises'
import { resolve } from 'node:path'
import { promisify } from 'node:util'
import type { GitRemoteAction, GitRemoteResult, GitRemoteStatus } from '../shared/api'
import { getCurrentBranch, isRepoRoot } from './git'
import { enqueueRepoWrite } from './repo-write-queue'
import type { RpcHandlerRegistry } from './rpc-router'
import { excludedWorktreePath } from './worktrees'

const run = promisify(execFile)
const git = async (root: string, args: string[]): Promise<string> =>
  (
    await run('git', args, {
      cwd: root,
      timeout: 120_000,
      maxBuffer: 4 * 1024 * 1024,
      env: { ...process.env, GIT_TERMINAL_PROMPT: '0', GIT_MERGE_AUTOEDIT: 'no' }
    })
  ).stdout.trim()
const message = (error: unknown): string => (error instanceof Error ? error.message : String(error))

async function requireRoot(root: string): Promise<void> {
  if (!(await isRepoRoot(root)))
    throw new Error('Open the repository’s top-level folder to manage Git updates.')
}

async function status(root: string): Promise<GitRemoteStatus> {
  await requireRoot(root)
  const remotes = (await git(root, ['remote'])).split('\n').filter(Boolean)
  const localBranches = (
    await git(root, ['for-each-ref', '--format=%(refname:strip=2)', 'refs/heads/'])
  )
    .split('\n')
    .filter(Boolean)
  const refs = await git(root, ['for-each-ref', '--format=%(refname)%09%(symref)', 'refs/remotes/'])
  const branches: GitRemoteStatus['branches'] = []
  for (const line of refs.split('\n')) {
    const [ref, symbolic] = line.split('\t')
    if (!ref || symbolic) continue
    const remote = [...remotes]
      .sort((a, b) => b.length - a.length)
      .find((name) => ref.startsWith(`refs/remotes/${name}/`))
    if (!remote) continue
    const branch = ref.slice(`refs/remotes/${remote}/`.length)
    branches.push({ ref, remote, branch, label: `${remote}/${branch}` })
  }
  let upstream: string | null = null
  try {
    upstream = await git(root, ['rev-parse', '--symbolic-full-name', '@{upstream}'])
  } catch {
    /* no upstream */
  }
  return { current: await getCurrentBranch(root), remotes, branches, upstream, localBranches }
}

export function remoteStatus(root: string, fetch = false): Promise<GitRemoteStatus> {
  return enqueueRepoWrite(root, async () => {
    await requireRoot(root)
    if (fetch) await git(root, ['fetch', '--all', '--prune', '--no-recurse-submodules'])
    return status(root)
  })
}

async function requireClean(root: string): Promise<void> {
  const changes = (await git(root, ['status', '--porcelain', '-z'])).split('\0').filter(Boolean)
  // Runtime sidecars are intentionally outside commits; Git still refuses to
  // overwrite an untracked path if an incoming branch would collide with it.
  if (changes.some((entry) => !entry.startsWith('?? ') || !excludedWorktreePath(entry.slice(3)))) {
    throw new Error(
      'Commit or stash the project’s uncommitted changes before pulling or switching branches.'
    )
  }
  for (const state of [
    'MERGE_HEAD',
    'CHERRY_PICK_HEAD',
    'REVERT_HEAD',
    'rebase-merge',
    'rebase-apply',
    'BISECT_START'
  ]) {
    const path = await git(root, ['rev-parse', '--git-path', state])
    if (
      await access(resolve(root, path)).then(
        () => true,
        () => false
      )
    ) {
      throw new Error(
        'Finish or abort the Git operation already in progress before updating this project.'
      )
    }
  }
}

/** Pull preserves local commits; conflicting merges are aborted back to the clean starting tree. */
export function updateFromRemote(
  root: string,
  action: GitRemoteAction,
  hasRunningAgents: () => boolean = () => false
): Promise<GitRemoteResult> {
  return enqueueRepoWrite(root, async () => {
    try {
      await requireRoot(root)
      if (!['pull', 'checkout'].includes(action.action)) throw new Error('Unknown Git action.')
      const ready = async (): Promise<void> => {
        if (hasRunningAgents())
          throw new Error(
            'Wait for this project’s agents to finish before pulling or switching branches.'
          )
        if (!action.expectedBranch || (await getCurrentBranch(root)) !== action.expectedBranch) {
          throw new Error('The current branch changed. Refresh Git updates and try again.')
        }
        await requireClean(root)
      }
      await ready()
      const requested = (await status(root)).branches.find((branch) => branch.ref === action.ref)
      if (!requested) throw new Error('Fetch updates and choose an available remote branch.')
      await git(root, ['fetch', '--prune', '--no-recurse-submodules', '--', requested.remote])
      await ready()
      const snapshot = await status(root)
      const source = snapshot.branches.find((branch) => branch.ref === action.ref)
      if (!source)
        throw new Error(
          'That remote branch is no longer available. Fetch updates and choose another branch.'
        )
      const before = await git(root, ['rev-parse', 'HEAD'])
      if (action.action === 'checkout') {
        await git(root, ['check-ref-format', '--branch', source.branch])
        if (snapshot.localBranches.includes(source.branch)) {
          // Never reset or silently repoint an existing local branch.
          await git(root, ['switch', '--', source.branch])
        } else {
          await git(root, ['switch', '--create', source.branch, '--track', source.ref])
        }
      } else {
        try {
          await git(root, ['merge', '--no-edit', '--no-autostash', source.ref])
        } catch (error) {
          let merging = false
          try {
            await git(root, ['rev-parse', '--verify', 'MERGE_HEAD'])
            merging = true
          } catch {
            /* merge did not start */
          }
          if (merging) {
            try {
              await git(root, ['merge', '--abort'])
            } catch (abortError) {
              throw new Error(
                `Pull stopped and Git could not abort the merge: ${message(abortError)}`
              )
            }
          }
          throw new Error(
            `Could not merge ${source.label}. Your existing commits are preserved. ${message(error)}`
          )
        }
      }
      const after = await git(root, ['rev-parse', 'HEAD'])
      const files = (await git(root, ['diff', '--name-only', '-z', before, after]))
        .split('\0')
        .filter(Boolean)
      return {
        ok: true,
        branch: await getCurrentBranch(root),
        files,
        changed: before !== after,
        message:
          action.action === 'checkout'
            ? snapshot.localBranches.includes(source.branch)
              ? `Switched to local ${source.branch}. Use Pull updates to bring in ${source.label}.`
              : `Switched to ${source.branch}, tracking ${source.label}.`
            : before === after
              ? `Already up to date with ${source.label}.`
              : `Pulled ${source.label} into ${action.expectedBranch}.`
      }
    } catch (error) {
      return {
        ok: false,
        branch: await getCurrentBranch(root),
        files: [],
        changed: false,
        message: message(error)
      }
    }
  })
}

export function registerGitRemoteIpc(
  router: RpcHandlerRegistry,
  busy: (root: string) => boolean
): void {
  router.handle('git:remote-status', (_event, root: string, fetch?: boolean) =>
    remoteStatus(root, fetch)
  )
  router.handle('git:remote-update', (_event, root: string, action: GitRemoteAction) =>
    updateFromRemote(root, action, () => busy(root))
  )
}
