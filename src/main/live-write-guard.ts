import { isAbsolute, join, normalize, relative } from 'node:path'

// LKM-151: a chat that runs in its own worktree must never write the live checkout
// directly. An absolute path to the live tree (a picked element's source, an earlier
// turn's tool output) would bypass the worktree, so a stopped turn's half-done edit
// lands live where neither Stop nor Revert can reach it. The Claude adapter denies
// such an edit with a PreToolUse hook (which also runs in bypass and auto modes) and
// tells the agent the worktree path to use instead.

const EDIT_TOOLS = new Set(['Edit', 'Write', 'MultiEdit', 'NotebookEdit'])

const inside = (path: string, dir: string): boolean => {
  const rel = relative(dir, path)
  return rel === '' || (!!rel && !rel.startsWith('..') && !isAbsolute(rel))
}

/**
 * The denial for an edit tool whose absolute target lies in `liveRoot` while the session
 * runs in the worktree `root`; null when the edit is allowed. Relative targets resolve
 * against `root` and are always inside the session's own tree.
 */
export function liveCheckoutEdit(tool: string, input: unknown, root: string, liveRoot: string): { reason: string; path: string } | null {
  if (!EDIT_TOOLS.has(tool) || !liveRoot || normalize(root) === normalize(liveRoot)) return null
  const record = (input && typeof input === 'object' ? input : {}) as Record<string, unknown>
  const target = typeof record.file_path === 'string' ? record.file_path : typeof record.notebook_path === 'string' ? record.notebook_path : null
  if (!target || !isAbsolute(target)) return null
  const path = normalize(target)
  // The worktree may live under the live tree (it does not today); its own paths are fine.
  if (inside(path, root) || !inside(path, liveRoot)) return null
  const equivalent = join(root, relative(liveRoot, path))
  return {
    path: equivalent,
    reason: `This chat edits its own copy of the project, not the live checkout. Edit ${equivalent} instead; ` +
      'Trezi lands your changes in the live project when the turn finishes.'
  }
}
