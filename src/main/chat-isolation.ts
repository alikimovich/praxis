import { randomUUID } from 'node:crypto'
import { basename } from 'node:path'
import type { BrowserWindow } from 'electron'
import type { AgentEvent, SessionRecord } from '../shared/api'
import { projectKey } from '../shared/projectKey'
import { completeTurn, createChatWorktree, syncFromLive } from './chat-worktrees'
import { recordEdit } from './edit-history'
import { isRepoRoot } from './git'
import type { SessionStore } from './sessions-store'
import { removeWorktree, type Worktree } from './worktrees'

/**
 * Per-CHAT git-worktree isolation glue (v9). Generalizes the comment-spawn
 * worktree machinery to interactive chats: every chat on a git repo ROOT gets one
 * long-lived `dsgn/chat-<id>` worktree, forked before its session starts and used
 * as the session's `cwd` for the chat's whole life. After each completed agent turn
 * the chat's work auto-merges back onto the LIVE checkout (which the preview always
 * serves) so the preview updates between turns; on mid-turn drift the turn PARKS on
 * its branch for the existing SessionReview UI instead of clobbering the user's edit.
 *
 * Dependency-injected (`initChatIsolation`) so `agent.ts` barely grows — the pure git
 * mechanics live in `chat-worktrees.ts`/`worktrees.ts`, the Electron/store/window seam
 * is passed in here. Non-repo / subdir / non-git projects get no worktree and every
 * hook no-ops (the chat runs on the live root exactly as before).
 *
 * Serialization: each chat has a single promise `chain`. `beforeTurn` (turn-start
 * live→worktree sync) and `afterTurn` (turn-end commit+merge) are both queued on it,
 * so a turn's sync always waits out the previous turn's in-flight merge — no races
 * with the next `agent:send`.
 */

/** In-memory state for one isolated chat, keyed by its `sessionKey` (= emitKey). */
interface ChatState {
  wt: Worktree
  liveRoot: string
  /** A turn's merge refused (mid-turn drift): work stays on the branch for review. */
  parked: boolean
  /** The persisted park `SessionRecord` id while parked, else null. */
  parkRecordId: string | null
  turnNo: number
  /** Per-chat serialization chain (sync + merge queue). */
  chain: Promise<unknown>
}

interface Deps {
  worktreesDir: () => string
  store: () => SessionStore
  getWindow: () => BrowserWindow | null
}

let deps: Deps | null = null
const states = new Map<string, ChatState>()

/** Wire the module's Electron/store/window seam. Called once at IPC registration. */
export function initChatIsolation(d: Deps): void {
  deps = d
  states.clear()
}

/** Emit an isolation event on the same webContents path other agent:* events use,
 *  tagged with the chat's `sessionKey` (= emitKey) so the renderer routes it to the
 *  right chat. Sent via the window (not `session.emit`) so a final merge after the
 *  session is disposed still reaches the renderer. */
function emitIsolation(
  sessionKey: string,
  state: 'isolated' | 'merged' | 'parked',
  branch?: string,
  files?: string[]
): void {
  deps?.getWindow()?.webContents.send('agent:event', {
    type: 'isolation',
    state,
    ...(branch ? { branch } : {}),
    ...(files && files.length ? { files } : {}),
    projectKey: sessionKey
  } satisfies AgentEvent)
}

/**
 * The cwd a chat's session should run in: its private worktree when `liveRoot` is a
 * git repo root, else `liveRoot` itself (all hooks then no-op). Idempotent — a known
 * `sessionKey` (e.g. `agent:restart-chat` reusing the same chat) returns its existing
 * worktree rather than forking a second. On any `createWorktree` failure, falls back
 * to `liveRoot` so a broken repo never blocks the chat.
 */
export async function isolatedCwd(liveRoot: string, sessionKey: string): Promise<string> {
  const existing = states.get(sessionKey)
  if (existing) return existing.wt.path
  if (!deps) return liveRoot
  if (!(await isRepoRoot(liveRoot))) return liveRoot
  try {
    const id = randomUUID().slice(0, 8)
    const wt = await createChatWorktree(liveRoot, id, deps.worktreesDir())
    states.set(sessionKey, {
      wt,
      liveRoot,
      parked: false,
      parkRecordId: null,
      turnNo: 0,
      chain: Promise.resolve()
    })
    emitIsolation(sessionKey, 'isolated', wt.branch)
    return wt.path
  } catch {
    return liveRoot // fork failed — run on the live root, hooks no-op
  }
}

/**
 * Re-stamp a chat session's record back to the LIVE project. A chat runs with `cwd`
 * = its worktree, so `createRecordCapture(root, projectKey(root))` keyed the record to
 * `projectKey(wt.path)` — which would hide the record from `sessions:list` and point
 * `agent:workspace-snapshot`'s reattach at the worktree. Called synchronously right
 * after `startSession` resolves, on every chat path. No-op for a non-isolated chat
 * (its cwd already IS `liveRoot`).
 */
export function adoptSession(sessionKey: string, record: SessionRecord, liveRoot: string): void {
  record.projectKey = projectKey(liveRoot)
  record.projectRoot = liveRoot
  record.projectName = basename(liveRoot) || liveRoot
  void sessionKey
}

/**
 * Turn-start hook: sync the live tree into the worktree so the agent sees the user's
 * between-turn edits. Queued on the chat's chain so it waits out any in-flight
 * post-`done` merge. Skipped while parked (never merge live drift into unmerged work).
 * Awaited by `agent:send` before `session.send`.
 */
export async function beforeTurn(sessionKey: string, _text: string): Promise<void> {
  const st = states.get(sessionKey)
  if (!st) return
  const task = st.chain.then(async () => {
    if (st.parked) return
    await syncFromLive(st.liveRoot, st.wt).catch(() => {})
  })
  st.chain = task.catch(() => {})
  await task
}

/**
 * Turn-end hook (fired on `done` AND `error` to salvage interrupted work): commit the
 * turn, merge it onto the live tree, and advance the fork point. Queued on the chat's
 * chain (never awaited by the caller). On `merged`, records the edits as one undo group
 * `chat:<id>:<turnNo>`, advances `baseSha`, and unparks. On `parked`, upserts the park
 * record for the review UI. `noop` does nothing.
 */
export function afterTurn(sessionKey: string, message: string): void {
  const st = states.get(sessionKey)
  if (!st) return
  st.chain = st.chain
    .then(async () => {
      const turnNo = ++st.turnNo
      const outcome = await completeTurn(st.liveRoot, st.wt, message)
      if (outcome.outcome === 'merged') {
        for (const e of outcome.edits) {
          recordEdit(
            st.liveRoot,
            e.file,
            e.before,
            e.after,
            undefined,
            `chat:${st.wt.id}:${turnNo}`
          )
        }
        if (outcome.newBase) st.wt.baseSha = outcome.newBase
        if (st.parked) {
          st.parked = false
          dropParkRecord(st)
        }
        emitIsolation(sessionKey, 'merged', st.wt.branch, outcome.files)
      } else if (outcome.outcome === 'parked') {
        st.parked = true
        upsertParkRecord(st, outcome.files)
        emitIsolation(sessionKey, 'parked', st.wt.branch, outcome.files)
      }
    })
    .catch(() => {
      /* a turn's merge failing must never wedge the chain */
    })
}

/**
 * Persist (or refresh) the park record a PARKED chat surfaces in the sidebar. Reuses
 * the existing record's `startedAt`/`transcript`/`title` on re-park so successive
 * parked turns update ONE record. Deliberately carries NO `sdkSessionId` (that would
 * light up Resume on a still-live chat). Crash-recovery enrichment lands in C4.
 */
function upsertParkRecord(st: ChatState, files: string[]): void {
  if (!deps) return
  const id = `chatpark-${st.wt.id}`
  try {
    const store = deps.store()
    const existing = store.get(id)
    const rec: SessionRecord = {
      id,
      projectKey: projectKey(st.liveRoot),
      projectRoot: st.liveRoot,
      projectName: basename(st.liveRoot) || st.liveRoot,
      startedAt: existing?.startedAt ?? Date.now(),
      endedAt: Date.now(),
      branch: st.wt.branch,
      filesTouched: files,
      transcript: existing?.transcript ?? [],
      kind: 'comment',
      title: existing?.title ?? 'Unmerged chat changes'
    }
    store.save(rec)
    st.parkRecordId = id
  } catch {
    /* history is non-critical */
  }
}

/** Drop a chat's park record once its work merges (or on discard). */
function dropParkRecord(st: ChatState): void {
  if (!deps || !st.parkRecordId) return
  try {
    deps.store().remove(st.parkRecordId)
  } catch {
    /* history is non-critical */
  }
  st.parkRecordId = null
}

/** Ids of every live chat worktree across ALL open projects — the `pruneOrphans`
 *  skip set must include these so a crash-recovery sweep never reclaims a live chat's
 *  checkout (the global worktrees dir is shared across projects). */
export function liveChatWorktreeIds(): string[] {
  return [...states.values()].map((s) => s.wt.id)
}

/**
 * Tear down one chat's worktree (close-chat / close-project / open-project's replace
 * path). Runs one final commit+merge to salvage the last turn, then removes the
 * checkout — keeping the branch only when parked (its work still awaits review).
 * Never throws (teardown runs in finalizers).
 */
export async function releaseChat(sessionKey: string): Promise<void> {
  const st = states.get(sessionKey)
  if (!st) return
  states.delete(sessionKey)
  try {
    await st.chain.catch(() => {})
    if (!st.parked) {
      const turnNo = ++st.turnNo
      const outcome = await completeTurn(st.liveRoot, st.wt, 'dsgn chat changes')
      if (outcome.outcome === 'merged') {
        for (const e of outcome.edits) {
          recordEdit(
            st.liveRoot,
            e.file,
            e.before,
            e.after,
            undefined,
            `chat:${st.wt.id}:${turnNo}`
          )
        }
      } else if (outcome.outcome === 'parked') {
        st.parked = true
        upsertParkRecord(st, outcome.files)
      }
    }
    await removeWorktree(st.liveRoot, st.wt, { keepBranch: st.parked })
  } catch {
    /* teardown never throws */
  }
}

/** Forget every chat's in-memory state on quit — a mirror of the spawns map. The
 *  checkouts stay on disk for the next launch's crash recovery (C4). */
export function dropAll(): void {
  states.clear()
}

/** The isolation status of a live chat for `agent:workspace-snapshot` (renderer
 *  reload reattach). Undefined for a non-isolated chat (the renderer treats that as
 *  live). */
export function isolationSnapshot(
  sessionKey: string
): { state: 'live' | 'isolated' | 'parked'; branch?: string } | undefined {
  const st = states.get(sessionKey)
  if (!st) return undefined
  return {
    state: st.parked ? 'parked' : 'isolated',
    ...(st.wt.branch ? { branch: st.wt.branch } : {})
  }
}
