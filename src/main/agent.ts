import { app, ipcMain, type BrowserWindow } from 'electron'
import { basename, join } from 'node:path'
import type { AgentEvent, AgentOptions, PermissionMode } from '../shared/api'
import { projectKey } from '../shared/projectKey'
import { pickProvider, type ProviderSession } from './backends'
import { EDIT_TOOLS } from './backends/tools'
import { createSessionStore, type SessionStore } from './sessions-store'
import { clearHistory, recordEdit } from './edit-history'
import { isRepoRoot } from './git'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { randomUUID } from 'node:crypto'
import {
  createWorktree,
  commitWorktree,
  removeWorktree,
  pruneOrphans,
  branchPatch,
  branchExists,
  deleteBranch,
  applyToWorkingTree,
  autoApplyWorktree,
  type Worktree
} from './worktrees'

const execFileP = promisify(execFile)
const git = (root: string, args: string[]): Promise<{ stdout: string }> =>
  execFileP('git', args, { cwd: root, timeout: 20000 }) as Promise<{ stdout: string }>

// On-disk agent-session history (v5-D). Lazy so it resolves userData after the
// app is ready; under the app's userData dir, out of any user repo.
let _store: SessionStore | null = null
const store = (): SessionStore =>
  (_store ??= createSessionStore(join(app.getPath('userData'), 'dsgn')))

/**
 * Agent sessions — one persistent multi-turn session per open project (keyed by
 * projectKey), each running a `ModelProvider` backend (Claude Agent SDK by
 * default; Codex/etc. behind the v7 seam). This module is backend-agnostic: it
 * owns the per-project `sessions` map, `activeKey`, teardown, the permission-card
 * settle loop, and every `agent:*` IPC handler — all in terms of `ProviderSession`
 * + `AgentEvent`. The provider-specific streaming/tooling lives under `./backends`.
 *
 * Auth: per-user subscription login for every backend (Claude `setup-token` /
 * `login`, Codex sign-in-with-ChatGPT, …) — never API keys committed in-repo.
 */

// v5: one persistent session per open project. Only the ACTIVE project's session
// streams to the renderer; the dispose guard keeps backgrounded/replaced sessions
// from leaking events into a chat the renderer isn't showing.
const sessions = new Map<string, ProviderSession>()
let activeKey: string | null = null
const activeSession = (): ProviderSession | null =>
  activeKey ? (sessions.get(activeKey) ?? null) : null

// v8 F1: detached comment spawns — background agents each in their OWN git worktree,
// keyed by spawn id. Kept SEPARATE from `sessions` so they never touch `activeKey`
// or the interactive chat stream.
interface Spawn {
  session: ProviderSession
  wt: Worktree
  parentKey: string
  parentRoot: string
  text: string
}
const spawns = new Map<string, Spawn>()
// v8 F1 Phase 3: bound concurrent spawns per project; the rest queue (FIFO) and start
// as slots free, so firing many comments can't fork unbounded worktrees/subprocesses.
const MAX_SPAWNS_PER_REPO = 3
interface QueuedSpawn {
  id: string
  root: string
  parentKey: string
  text: string
  options: AgentOptions
}
const spawnQueue: QueuedSpawn[] = []
const runningCount = (parentKey: string): number =>
  [...spawns.values()].filter((s) => s.parentKey === parentKey).length
const worktreesDir = (): string => join(app.getPath('userData'), 'dsgn', 'worktrees')
const firstLine = (t: string): string => (t.split('\n')[0] || 'dsgn comment edit').slice(0, 72)

/** Tear down a session: stop it emitting, deny its prompts, provider teardown,
 * then persist it to history (v5-D) — a torn-down session is a "previous agent". */
function closeSession(s: ProviderSession): void {
  s.dispose()
  ;[...s.pending.keys()].forEach((id) => resolvePending(s, id, 'deny'))
  s.shutdown()
  // Only persist sessions the user actually engaged (≥1 prompt) — skip opened-then
  // -closed empties. Best-effort: a disk hiccup must not break teardown.
  try {
    s.finalize()
    if (s.record.transcript.some((t) => t.role === 'user')) {
      s.record.endedAt = Date.now()
      store().save(s.record)
    }
  } catch {
    // history is non-critical; never let it interfere with session lifecycle
  }
}

/**
 * A detached comment spawn (v8 F1) reached its terminal event. By default we now
 * AUTO-APPLY its change straight onto the working branch the user is on — no
 * separate `dsgn/comment-*` branch, no PR, no manual Apply (that was "too many
 * approvals") — and record it in the undo history so Cmd+Z reverts the whole
 * comment atomically. The branch + checkout are deleted and the record is NOT
 * persisted, so the finished spawn vanishes from the rail instead of lingering as
 * a "previous agent".
 *
 * Only when auto-apply is UNSAFE (the user edited a touched file concurrently,
 * or a binary/delete change) do we fall back to the old behaviour: keep the
 * branch + persist the record so the user can resolve it via the review modal.
 * Best-effort throughout — a finalizer must never throw.
 */
async function finalizeSpawn(id: string, _status: 'done' | 'error'): Promise<void> {
  const spawn = spawns.get(id)
  if (!spawn) return
  spawns.delete(id)
  const { session, wt, parentKey, parentRoot, text } = spawn
  try {
    closeSession(session) // finalize + persist the record (removed below if we auto-apply)
    const { committed, files } = await commitWorktree(wt, firstLine(text))
    let auto: { applied: boolean; edits: { file: string; before: string; after: string }[] } = {
      applied: false,
      edits: []
    }
    if (committed && files.length) {
      try {
        auto = await autoApplyWorktree(parentRoot, wt, files)
      } catch {
        auto = { applied: false, edits: [] }
      }
    }
    if (auto.applied) {
      // Land it on the working branch + make the whole comment ONE Cmd+Z (shared
      // group). Then drop the branch and un-persist the record so the rail clears.
      const group = `comment:${id}`
      for (const e of auto.edits) recordEdit(parentRoot, e.file, e.before, e.after, undefined, group)
      await removeWorktree(parentRoot, wt, { keepBranch: false })
      try {
        store().remove(session.record.id)
      } catch {
        /* history is non-critical */
      }
      getWindow_()?.webContents.send('agent:event', {
        type: 'spawn-finished',
        projectKey: parentKey,
        sessionId: id,
        branch: null
      } satisfies AgentEvent)
    } else {
      // Fallback: keep the branch + record for the manual review modal.
      if (committed) {
        session.record.filesTouched = files // git's staged list beats the heuristic
        session.record.endedAt = session.record.endedAt ?? Date.now()
        store().save(session.record)
      }
      await removeWorktree(parentRoot, wt, { keepBranch: committed })
      getWindow_()?.webContents.send('agent:event', {
        type: 'spawn-finished',
        projectKey: parentKey,
        sessionId: id,
        branch: committed ? wt.branch : null
      } satisfies AgentEvent)
    }
  } catch {
    // Never let spawn teardown break the app; the worktree may linger for prune.
  }
  void pumpQueue(parentKey) // a slot just freed — start the next queued spawn
}

// finalizeSpawn runs outside registerAgentIpc's closure, so it needs the window
// accessor. Captured when IPC is registered.
let getWindow_: () => BrowserWindow | null = () => null

/**
 * Create the worktree + start a detached session for one spawn. Shared by the
 * immediate path and the queue. On a setup failure it reclaims the worktree and
 * emits `spawn-finished` so the renderer drops the row, then pumps the queue.
 * Returns the branch (immediate path needs it) or null on failure.
 */
async function startSpawn(q: QueuedSpawn): Promise<string | null> {
  let wt: Worktree
  try {
    wt = await createWorktree(q.root, worktreesDir(), { label: q.text, id: q.id })
  } catch {
    getWindow_()?.webContents.send('agent:event', {
      type: 'spawn-finished',
      projectKey: q.parentKey,
      sessionId: q.id,
      branch: null
    } satisfies AgentEvent)
    void pumpQueue(q.parentKey)
    return null
  }
  const opts: AgentOptions = { ...q.options, permissionMode: 'bypassPermissions' }
  try {
    const s = await pickProvider(opts).startSession(wt.path, opts, getWindow_, {
      sessionId: wt.id,
      emitKey: q.parentKey,
      onEvent: (e) => {
        if (e.type === 'done') void finalizeSpawn(wt.id, 'done')
        else if (e.type === 'error') void finalizeSpawn(wt.id, 'error')
      }
    })
    s.record.kind = 'comment'
    s.record.branch = wt.branch
    s.record.projectRoot = q.root
    s.record.projectName = basename(q.root) || q.root
    s.record.transcript.push({ role: 'user', text: q.text, at: Date.now() })
    spawns.set(wt.id, { session: s, wt, parentKey: q.parentKey, parentRoot: q.root, text: q.text })
    s.send(q.text)
    return wt.branch
  } catch {
    await removeWorktree(q.root, wt, { keepBranch: false })
    getWindow_()?.webContents.send('agent:event', {
      type: 'spawn-finished',
      projectKey: q.parentKey,
      sessionId: q.id,
      branch: null
    } satisfies AgentEvent)
    void pumpQueue(q.parentKey)
    return null
  }
}

/** Start queued spawns for a project while it has free slots (FIFO). Each dequeued
 *  spawn emits `spawn-started` so the rail flips its row from queued → running. */
async function pumpQueue(parentKey: string): Promise<void> {
  while (runningCount(parentKey) < MAX_SPAWNS_PER_REPO) {
    const idx = spawnQueue.findIndex((q) => q.parentKey === parentKey)
    if (idx === -1) return
    const [q] = spawnQueue.splice(idx, 1)
    const branch = await startSpawn(q)
    if (branch) {
      getWindow_()?.webContents.send('agent:event', {
        type: 'spawn-started',
        projectKey: parentKey,
        sessionId: q.id,
        branch
      } satisfies AgentEvent)
    }
  }
}

/** Settle a pending prompt and tell the renderer to drop its card. */
function resolvePending(s: ProviderSession, id: string, behavior: 'allow' | 'deny'): void {
  const p = s.pending.get(id)
  if (!p) return
  p.settle(behavior)
  s.emit({ type: 'permission-resolved', id })
}

export function registerAgentIpc(getWindow: () => BrowserWindow | null): void {
  getWindow_ = getWindow // share with finalizeSpawn (runs outside this closure)
  ipcMain.handle('agent:open-project', async (_e, root: string, options: AgentOptions = {}) => {
    const key = projectKey(root)
    // Reopening the same project starts a fresh session — close the old one.
    const existing = sessions.get(key)
    if (existing) {
      closeSession(existing)
      sessions.delete(key)
    }
    const s = await pickProvider(options).startSession(root, options, getWindow)
    sessions.set(key, s)
    activeKey = key
    // v8 F1: reclaim any comment-spawn worktrees orphaned by a prior crash/quit —
    // pruneOrphans commits dirty leftovers to their branch (recovering the work)
    // before removing the checkout. Skip ids of spawns live THIS session (their
    // checkouts are under the same dir). Best-effort, fire-and-forget.
    if (await isRepoRoot(root)) {
      void pruneOrphans(root, worktreesDir(), new Set(spawns.keys())).catch(() => {})
    }
  })

  // Close a project's session (renderer single-active teardown; the rail uses
  // this when a project is closed, not merely switched away from).
  ipcMain.handle('agent:close-project', async (_e, root: string) => {
    const key = projectKey(root)
    const s = sessions.get(key)
    if (s) {
      closeSession(s)
      sessions.delete(key)
    }
    // Closing the active project clears `active` — never auto-promote an arbitrary
    // backgrounded session (it would start emitting into a chat the renderer isn't
    // showing). The renderer re-activates explicitly via open-project.
    if (activeKey === key) activeKey = null
    // v8 F3b: drop the project's undo/redo history — a reopened project starts fresh.
    clearHistory(root)
  })

  // Switch the active project to an already-open (warm) session, without
  // recreating it — used by the rail when switching between open projects.
  ipcMain.handle('agent:set-active', async (_e, root: string) => {
    const key = projectKey(root)
    if (sessions.has(key)) activeKey = key
  })

  // Does this project still have a live session? (LRU eviction can suspend a
  // backgrounded project's session; the renderer reopens it on switch-back.)
  ipcMain.handle('agent:is-open', (_e, root: string) => sessions.has(projectKey(root)))

  ipcMain.handle('agent:set-model', async (_e, model: string) => {
    const session = activeSession()
    if (!session) return
    await session.setModel?.(model)
    session.options.model = model
  })

  ipcMain.handle('agent:set-permission-mode', async (_e, mode: PermissionMode) => {
    const session = activeSession()
    if (!session) return
    // Apply to the backend first; only commit our copy if it took (keeps the
    // toolbar and the live agent in agreement).
    await session.setPermissionMode?.(mode)
    session.options.permissionMode = mode
    // Switching to a more permissive posture should also release prompts already
    // on screen — otherwise the user picks "Auto" but the pending card stays.
    if (mode === 'bypassPermissions' || mode === 'acceptEdits') {
      for (const [id, p] of [...session.pending.entries()]) {
        if (mode === 'bypassPermissions' || EDIT_TOOLS.has(p.toolName)) {
          resolvePending(session, id, 'allow')
        }
      }
    }
  })

  ipcMain.handle('agent:respond-permission', async (_e, id: string, behavior: 'allow' | 'deny') => {
    const session = activeSession()
    if (session) resolvePending(session, id, behavior)
  })

  ipcMain.handle('agent:send', async (_e, text: string) => {
    const session = activeSession()
    if (!session) {
      getWindow()?.webContents.send('agent:event', {
        type: 'error',
        message: 'Open a project first — the agent works inside a repo.'
      } satisfies AgentEvent)
      return
    }
    session.record.transcript.push({ role: 'user', text, at: Date.now() })
    session.send(text)
  })

  // Tag the live session with branch / PR metadata for its history record (the
  // renderer knows these; main captures transcript + files). No-op if no session.
  ipcMain.handle(
    'agent:tag-session',
    async (_e, root: string, tag: { branch?: string; prUrl?: string }) => {
      const s = sessions.get(projectKey(root))
      if (!s) return
      if (typeof tag.branch === 'string') s.record.branch = tag.branch
      if (typeof tag.prUrl === 'string') s.record.prUrl = tag.prUrl
    }
  )

  // v8 F1: spawn a detached comment agent in its own git worktree. It runs in the
  // background (bypassPermissions — a headless run has no card UI), edits its private
  // checkout (zero cross-writes with the main agent or other spawns), and on finish
  // commits to a `dsgn/comment-<id>` branch + lands in this project's history. Over the
  // per-repo cap (Phase 3) it QUEUES and starts when a slot frees.
  ipcMain.handle(
    'agent:spawn-comment',
    async (_e, root: string, text: string, options: AgentOptions = {}) => {
      // Worktrees need a repo TOP LEVEL — a non-repo (or subdir) falls back to chat.
      if (!(await isRepoRoot(root))) return { ok: false, reason: 'not-a-repo' }
      const parentKey = projectKey(root)
      // Stable id assigned up front so the rail row survives a queued→running flip.
      const id = randomUUID().slice(0, 8)
      const q: QueuedSpawn = { id, root, parentKey, text, options }
      if (runningCount(parentKey) >= MAX_SPAWNS_PER_REPO) {
        spawnQueue.push(q) // a slot will free on the next finalizeSpawn → pumpQueue
        return { ok: true, spawnId: id, queued: true }
      }
      const branch = await startSpawn(q)
      if (!branch) return { ok: false, reason: 'Could not start the agent (is it logged in?).' }
      return { ok: true, spawnId: id, branch }
    }
  )

  // v8 F1 Phase 3 — cancel a running OR queued comment spawn (the rail row's ×).
  ipcMain.handle('agent:spawn-interrupt', async (_e, id: string) => {
    const queuedIdx = spawnQueue.findIndex((q) => q.id === id)
    if (queuedIdx !== -1) {
      const [q] = spawnQueue.splice(queuedIdx, 1)
      getWindow()?.webContents.send('agent:event', {
        type: 'spawn-finished',
        projectKey: q.parentKey,
        sessionId: id,
        branch: null
      } satisfies AgentEvent)
      return
    }
    const spawn = spawns.get(id)
    if (!spawn) return
    await spawn.session.interrupt?.() // → emits done → finalizeSpawn commits any work
  })

  // v8 F1 Phase 2 — close the loop from a finished comment spawn to a visible result.
  // APPLY: patch the spawn's branch diff onto the LIVE working tree (the dev server
  // HMRs it). Not `git merge` — patch-apply tolerates the main agent's WIP; on textual
  // overlap it surfaces conflict markers for the user to resolve.
  ipcMain.handle('agent:spawn-apply', async (_e, root: string, branch: string) => {
    if (!(await isRepoRoot(root))) return { ok: false, error: 'Not a git repository.' }
    if (!(await branchExists(root, branch))) return { ok: false, error: 'That branch no longer exists.' }
    const patch = await branchPatch(root, branch)
    if (!patch.trim()) return { ok: false, error: 'That run made no changes to apply.' }
    const res = await applyToWorkingTree(root, patch, worktreesDir())
    if (res.ok) return { ok: true }
    return {
      ok: false,
      conflict: res.conflict,
      error: res.conflict
        ? 'Applied with conflicts — resolve the markers in your editor, then keep going.'
        : (res.error ?? 'Could not apply the changes.')
    }
  })

  // DISCARD: drop the spawn's branch (the renderer also removes the history record).
  ipcMain.handle('agent:spawn-discard', async (_e, root: string, branch: string) => {
    if (branch) await deleteBranch(root, branch)
    return { ok: true }
  })

  // PR: push the spawn's branch + open a PR from it (no checkout — the work is already
  // committed on the branch). Persists prUrl back onto the history record.
  ipcMain.handle(
    'agent:spawn-pr',
    async (_e, root: string, branch: string, title: string, recordId: string) => {
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
        const body = `Edited by a dsgn comment agent.\n\n🤖 Generated with [dsgn](https://github.com/alikimovich/dsgn)`
        const { stdout } = await execFileP(
          'gh',
          ['pr', 'create', '--head', branch, '--title', title || 'dsgn comment edit', '--body', body],
          { cwd: root }
        )
        const prUrl = stdout.trim().split('\n').find((l) => /^https?:\/\//.test(l)) ?? stdout.trim()
        // Persist prUrl onto the history record (overwrite by id).
        const rec = store().get(recordId)
        if (rec) {
          rec.prUrl = prUrl
          store().save(rec)
        }
        return { ok: true, prUrl }
      } catch (e) {
        return { ok: false, error: e instanceof Error ? e.message : String(e) }
      }
    }
  )

  // Persisted history ("previous agents", v5-D). Lists past runs (the live session
  // is persisted only on teardown, so it isn't here).
  ipcMain.handle('sessions:list', (_e, root: string) => store().list(projectKey(root)))
  ipcMain.handle('sessions:get', (_e, id: string) => store().get(id))
  ipcMain.handle('sessions:remove', (_e, id: string) => store().remove(id))

  ipcMain.handle('agent:interrupt', async () => {
    const session = activeSession()
    if (!session) return
    // Release any open prompts (interrupt may not abort their per-call signal),
    // so cards don't orphan and the backend callbacks unblock.
    ;[...session.pending.keys()].forEach((id) => resolvePending(session, id, 'deny'))
    await session.interrupt?.()
  })

  // Don't leave any backend subprocess running after dsgn quits.
  app.on('before-quit', () => {
    for (const s of sessions.values()) closeSession(s)
    sessions.clear()
    activeKey = null
    // v8 F1: stop any in-flight spawns' subprocesses, but LEAVE their checkouts on
    // disk — committing/removing here would race the process exit (work lost, or a
    // half-removed worktree). The next launch's pruneOrphans commits each dirty
    // leftover to its branch (recovering the work) and reclaims the checkout.
    for (const { session } of spawns.values()) closeSession(session)
    spawns.clear()
  })
}
