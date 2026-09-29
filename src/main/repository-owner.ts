import type { BranchResult } from '../shared/api'

/**
 * The repository owner seam (S07). Under the Swift launch the service's repository
 * coordinator performs every Git effect Trezi makes in a user's repository, one FIFO
 * lane per repository common directory, with journaled intent and recovery refs;
 * the mutating functions in `worktrees.ts`, `chat-worktrees.ts`, `live-commit.ts` and
 * `git.ts` dispatch here when an owner is installed. With no owner (the
 * `TREZI_BACKEND_OWNER=legacy` launch and the pure unit tests) they run their own Git
 * commands exactly as before. Never both: an owner that fails is an error, not a
 * reason to run Git locally.
 */

/** Same shape as `Worktree` in worktrees.ts (kept here to avoid an import cycle). */
export interface OwnedWorktree {
  id: string
  repoRoot: string
  path: string
  branch: string
  baseSha: string
}

export interface OwnedEdit {
  file: string
  before: string
  after: string
}

/** Why a worktree is removed: its HEAD landed, its branch keeps the work, or it is abandoned. */
export type RemoveIntent = 'landed' | 'release' | 'abandon'

export interface RepositoryOwner {
  /** `enqueueRepoWrite` under the owner: holds the repository's lane for `operation`. */
  withLease<T>(root: string, operation: () => Promise<T>): Promise<T>
  createWorktree(root: string, worktreesDir: string, opts: { id: string; branch: string; linkNodeModules: boolean }): Promise<OwnedWorktree>
  syncWorktree(wt: OwnedWorktree): Promise<{ synced: boolean; baseSha: string }>
  attachBranch(wt: OwnedWorktree): Promise<void>
  retireBranch(wt: OwnedWorktree): Promise<void>
  commitWorktree(wt: OwnedWorktree, message: string): Promise<{ committed: boolean; files: string[] }>
  autoApply(wt: OwnedWorktree, files: string[]): Promise<{ applied: boolean; edits: OwnedEdit[] }>
  completeTurn(wt: OwnedWorktree, message: string, land: boolean): Promise<{
    outcome: 'noop' | 'merged' | 'parked'; files: string[]; edits: OwnedEdit[]; newBase?: string
  }>
  applyParked(wt: OwnedWorktree): Promise<{ ok: boolean; conflict: boolean; files: string[]; newBase?: string; error?: string }>
  applyBranch(root: string, branch: string): Promise<{ ok: boolean; conflict: boolean; empty?: boolean; error?: string }>
  stageResolve(wt: OwnedWorktree): Promise<{ conflicted: string[]; files: string[]; clean: boolean; baseSha: string }>
  discardParked(wt: OwnedWorktree): Promise<void>
  removeWorktree(wt: OwnedWorktree, keepBranch: boolean, intent: RemoveIntent): Promise<void>
  deleteBranch(root: string, branch: string, intent: 'discard' | 'integrated'): Promise<void>
  pruneOrphans(root: string, worktreesDir: string, skip: string[], parked: string[]): Promise<
    Array<{ id: string; dirty: boolean; branch: string | null; repoRoot: string | null }>
  >
  pruneBranches(root: string, protectedIds: string[]): Promise<{ deleted: string[]; preserved: string[] }>
  commitLive(root: string, files: string[], title: string, body?: string): Promise<{ committed: boolean; sha?: string; files: string[] }>
  checkout(root: string, branch: string): Promise<BranchResult>
  switchBranch(root: string, branch: string): Promise<BranchResult>
  /** Operations a previous service left unfinished, with the recovery refs that hold their work. */
  status(): Promise<{ active: RepositoryJournalEntry[]; interrupted: RepositoryJournalEntry[]; journal?: string }>
}

export interface RepositoryJournalEntry {
  operationID: string
  kind: string
  intent: string
  lane: string
  root: string
  worktree?: string
  branch?: string
  refs: string[]
  started: string
}

let owner: RepositoryOwner | null = null

/** Installed once by the native entry point when the Swift service is supervising Bun. */
export function setRepositoryOwner(next: RepositoryOwner | null): void {
  owner = next
}

export function repositoryOwner(): RepositoryOwner | null {
  return owner
}
