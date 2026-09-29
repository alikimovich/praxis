import { existsSync, readFileSync, realpathSync, renameSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  applyWorkspace, decodeWorkspace, emptyWorkspace, encodeWorkspace, type WorkspaceDocument,
  type WorkspaceOperation, type WorkspacePatch, type WorkspaceView, workspaceView
} from './workspace-model'

/**
 * Project identity, order, selection and recents: the S04 workspace domain.
 * Reads come from the last acknowledged state; every mutation resolves only
 * once it is persisted, so a dependent command (starting a session or server
 * for a project) never runs against an identity that was not saved.
 */
export interface WorkspaceStore {
  snapshot(): WorkspaceView
  /** An existing project (same key, or the same folder by real path) is returned, not duplicated. */
  open(root: string, chatSettings?: Record<string, unknown>): Promise<{ key: string; created: boolean }>
  select(key: string): Promise<void>
  close(key: string): Promise<void>
  reorder(key: string, before: string | null): Promise<void>
  /** The typed adapter for the legacy-owned metadata slice (sessions, servers, Git, display). */
  update(projects: WorkspacePatch[]): Promise<void>
  recent(root: string, name: string): Promise<void>
  /** Called when the stored workspace changes without a local operation (an adopted external edit). */
  subscribe(listener: () => void): void
}

export const resolveRoot = (root: string) => { try { return realpathSync.native(root) } catch { return null } }

/** The Bun writer of `workspace.json`: the `TREZI_BACKEND_OWNER=legacy` rollback owner. */
export function legacyWorkspace(profile: string, options: { now?: () => number } = {}): WorkspaceStore {
  const path = join(profile, 'workspace.json')
  const now = options.now ?? Date.now
  let doc: WorkspaceDocument = existsSync(path) ? decodeWorkspace(readFileSync(path, 'utf8')) : emptyWorkspace()
  let queue: Promise<unknown> = Promise.resolve()
  const run = <T>(op: WorkspaceOperation, pick: (result: ReturnType<typeof applyWorkspace>) => T) => {
    const job = queue.then(() => {
      const next = structuredClone(doc)
      const result = applyWorkspace(next, op, { now: now(), resolve: resolveRoot })
      if (result.changed) {
        writeFileSync(`${path}.tmp`, encodeWorkspace(next), { mode: 0o600 })
        renameSync(`${path}.tmp`, path)
        doc = next
      }
      return pick(result)
    })
    queue = job.catch(() => {})
    return job
  }
  return {
    snapshot: () => structuredClone(workspaceView(doc)),
    open: (root, chatSettings) => run({ method: 'open', root, ...(chatSettings ? { chatSettings } : {}) }, result => ({ key: result.key!, created: !!result.created })),
    select: key => run({ method: 'select', key }, () => {}),
    close: key => run({ method: 'close', key }, () => {}),
    reorder: (key, before) => run({ method: 'reorder', key, before }, () => {}),
    update: projects => run({ method: 'update', projects }, () => {}),
    recent: (root, name) => run({ method: 'recent', root, name }, () => {}),
    subscribe() {}
  }
}
