import { type IsolatedChat, stoppedTurnSeam as seam } from './chat-isolation'
import { completeTurn } from './chat-worktrees'
import { recordEdit } from './edit-history'
import { commitLiveTurn } from './live-commit'
import { enqueueRepoWrite } from './repo-write-queue'
import { retireWorktreeBranch } from './worktrees'

/**
 * LKM-151: what the user can do with a stopped (or failed) turn. Such a turn never
 * lands: its work is held on the chat's branch and the live checkout keeps exactly the
 * bytes it had before the turn. From the post-Stop card the user can
 *  - revert it: the hold is marked reverted (the live tree already matches) and the
 *    work is discarded at the next turn start or chat release; until then Undo puts
 *    the hold back;
 *  - keep it: land the partial work now like a finished turn, with its undo group, so
 *    the message's Revert still works; live drift parks it as an ordinary conflict;
 *  - ask the agent to finish: a normal follow-up turn on top of the held work, whose
 *    successful landing carries the whole batch.
 */

export interface StoppedTurnResult {
  ok: boolean
  files: string[]
  /** Keep: the undo group of the landed turn. */
  group?: string
  /** Keep: live drift parked the work as a conflict instead. */
  conflict?: boolean
  error?: string
}

const held = (st: IsolatedChat | undefined): st is IsolatedChat => !!st && st.parked && st.interrupted

/** Revert the stopped turn. The live checkout is untouched; nothing is written now. */
export function revertStoppedTurn(sessionKey: string): StoppedTurnResult {
  const st = seam.state(sessionKey)
  if (!held(st) || st.reverted) return { ok: false, files: [], error: 'Nothing from a stopped turn is on hold.' }
  st.reverted = true
  seam.dropRecord(st)
  seam.emit(sessionKey, 'isolated', st.wt.branch, st.parkedFiles, undefined, undefined, 'reverted')
  return { ok: true, files: st.parkedFiles }
}

/** Undo a revert that has not been settled by a new turn yet. */
export function undoStoppedRevert(sessionKey: string): StoppedTurnResult {
  const st = seam.state(sessionKey)
  if (!held(st) || !st.reverted) return { ok: false, files: [], error: 'The stopped turn can no longer be restored.' }
  st.reverted = false
  seam.holdRecord(st, st.parkedFiles)
  seam.emit(sessionKey, 'parked', st.wt.branch, st.parkedFiles, undefined, undefined, 'interrupted')
  return { ok: true, files: st.parkedFiles }
}

/** Land the stopped turn's partial work on the live checkout. */
export async function keepStoppedTurn(sessionKey: string): Promise<StoppedTurnResult> {
  const st = seam.state(sessionKey)
  if (!held(st) || st.reverted) return { ok: false, files: [], error: 'Nothing from a stopped turn is on hold.' }
  const task = st.chain.then(() =>
    enqueueRepoWrite(st.liveRoot, async (): Promise<StoppedTurnResult> => {
      if (!held(st) || st.reverted) return { ok: false, files: [], error: 'Nothing from a stopped turn is on hold.' }
      const turnNo = ++st.turnNo
      const title = 'Keep partial changes from a stopped turn'
      const outcome = await completeTurn(st.liveRoot, st.wt, title, { land: true })
      if (outcome.outcome === 'parked') {
        st.interrupted = false
        st.parkedFiles = outcome.files
        seam.holdRecord(st, outcome.files)
        seam.emit(sessionKey, 'parked', st.wt.branch, outcome.files)
        return { ok: true, files: outcome.files, conflict: true }
      }
      const group = outcome.outcome === 'merged' ? `chat:${st.wt.id}:${turnNo}` : undefined
      if (group) {
        for (const e of outcome.edits) recordEdit(st.liveRoot, e.file, e.before, e.after, undefined, group)
        await commitLiveTurn(st.liveRoot, outcome.files, { title, body: `Trezi turn ${turnNo} (${st.wt.branch}).` })
      }
      if (outcome.newBase) st.wt.baseSha = outcome.newBase
      st.parked = false
      st.interrupted = false
      st.parkedFiles = []
      st.resolvingFiles = null
      seam.dropRecord(st)
      await retireWorktreeBranch(st.wt)
      if (group) seam.emit(sessionKey, 'merged', st.wt.branch, outcome.files, group, !st.record?.prUrl)
      else seam.emit(sessionKey, 'isolated', st.wt.branch)
      return { ok: true, files: outcome.files, ...(group ? { group } : {}) }
    })
  )
  st.chain = task.catch(() => {})
  try {
    return await task
  } catch (error) {
    return { ok: false, files: [], error: error instanceof Error ? error.message : String(error) }
  }
}
