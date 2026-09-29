import { projectKey } from '../shared/projectKey'

/**
 * The persisted workspace, `<profile>/workspace.json`, in its unchanged legacy
 * format: `{"projects":[entry…],"activeKey":key|null,"recents":[…]}`. These are
 * the operations of the Swift owner (`src/service/WorkspaceFile.swift`) and of
 * the `TREZI_BACKEND_OWNER=legacy` Bun writer, which must stay byte-identical
 * (checked by `test/workspace-owner.mjs`).
 *
 * Nothing is dropped: unknown top-level and entry fields, invalid entries and
 * invalid recents stay in the file where they are. Only valid entries (an object
 * with an absolute `root` whose `projectKey` equals `key`; the first per key) are
 * projects, exactly the entries the pre-S04 restore accepted.
 */
export type WorkspaceDocument = Record<string, any> & { projects: unknown[] }
export interface WorkspaceEntryRecord { root: string; key: string; touchedAt?: unknown; [field: string]: unknown }
export interface WorkspaceRecent { root: string; name: string; at?: unknown; [field: string]: unknown }
export interface WorkspaceView { projects: WorkspaceEntryRecord[]; activeKey: string | null; recents: WorkspaceRecent[] }
export type WorkspacePatch = { key: string; fields: Record<string, unknown> }

export type WorkspaceOperation =
  | { method: 'open'; root: string; chatSettings?: Record<string, unknown> }
  | { method: 'select' | 'close'; key: string }
  | { method: 'reorder'; key: string; before: string | null }
  | { method: 'update'; projects: WorkspacePatch[] }
  | { method: 'recent'; root: string; name: string }

export class WorkspaceModelError extends Error {
  constructor(readonly code: 'invalidRequest' | 'notFound' | 'busy', message: string) { super(message) }
}

export const MAX_PROJECTS = 1000
export const MAX_PATCHES = 256
export const MAX_RECENTS = 10
const MAX_ROOT = 4096
const MAX_TEXT = 8192
const MAX_NAME = 1024
const MAX_SESSIONS = 1000
const LONE_SURROGATE = /[\ud800-\udbff](?![\udc00-\udfff])|(?<![\ud800-\udbff])[\udc00-\udfff]/

const isObject = (value: unknown): value is Record<string, any> => value !== null && typeof value === 'object' && !Array.isArray(value)
const text = (value: unknown, max: number): value is string => typeof value === 'string' && value.length <= max
const path = (value: unknown): value is string => text(value, MAX_ROOT) && value.startsWith('/') && !LONE_SURROGATE.test(value)

/**
 * The legacy-owned metadata slice (sessions, servers, Git, display), written
 * through the typed `update` adapter. Swift owns membership, order, `root`,
 * `key`, `touchedAt`, `activeKey` and `recents`; Bun owns these values and
 * Swift only persists them. Each rule is the validation both owners apply.
 */
export const METADATA_FIELDS: Record<string, (value: unknown) => boolean> = {
  name: value => text(value, MAX_NAME),
  url: value => value === null || text(value, MAX_TEXT),
  previewKind: value => value === 'web' || value === 'simulator',
  branch: value => value === null || text(value, MAX_NAME),
  launchSpec: value => value === null || isObject(value),
  viewport: value => value === 'desktop' || value === 'mobile',
  chatsCollapsed: value => typeof value === 'boolean',
  environmentRevision: value => Number.isSafeInteger(value) && (value as number) >= 0,
  dependenciesPending: value => typeof value === 'boolean',
  sessionKeys: value => Array.isArray(value) && value.length >= 1 && value.length <= MAX_SESSIONS && value.every(key => text(key, MAX_TEXT)),
  activeSessionKey: value => text(value, MAX_TEXT),
  chatSettings: value => isObject(value)
}

export function validEntry(item: unknown): item is WorkspaceEntryRecord {
  return isObject(item) && typeof item.root === 'string' && item.root.startsWith('/') && item.key === projectKey(item.root)
}
const validRecent = (item: unknown): item is WorkspaceRecent => isObject(item) && typeof item.root === 'string' && typeof item.name === 'string'

/** Refuses anything the pre-S04 reader refused: not an object with an array `projects`. */
export function decodeWorkspace(raw: string): WorkspaceDocument {
  const value = JSON.parse(raw)
  if (!isObject(value) || !Array.isArray(value.projects)) throw new Error('Invalid saved workspace')
  return value as WorkspaceDocument
}
export const emptyWorkspace = (): WorkspaceDocument => ({ projects: [], activeKey: null, recents: [] })
export const encodeWorkspace = (doc: WorkspaceDocument) => JSON.stringify(doc)

/** Valid entries in file order, the first per key, with their index in `projects`. */
export function workspaceEntries(doc: WorkspaceDocument) {
  const seen = new Set<string>(), out: { index: number; entry: WorkspaceEntryRecord }[] = []
  doc.projects.forEach((item, index) => {
    if (validEntry(item) && !seen.has(item.key)) { seen.add(item.key); out.push({ index, entry: item }) }
  })
  return out
}

/** What a client may use. `activeKey` is null unless it names a project. */
export function workspaceView(doc: WorkspaceDocument): WorkspaceView {
  const projects = workspaceEntries(doc).map(({ entry }) => entry)
  const active = typeof doc.activeKey === 'string' && projects.some(entry => entry.key === doc.activeKey) ? doc.activeKey : null
  return { projects, activeKey: active, recents: Array.isArray(doc.recents) ? doc.recents.filter(validRecent) : [] }
}

export const projectName = (root: string) => root.split('/').filter(Boolean).at(-1) ?? root

/** Strict request validation, shared by the Bun client and the legacy writer. */
export function validateOperation(op: WorkspaceOperation) {
  const bad = (message: string) => new WorkspaceModelError('invalidRequest', message)
  switch (op.method) {
    case 'open':
      if (!path(op.root)) throw bad('A project needs an absolute path.')
      if (op.chatSettings !== undefined && !isObject(op.chatSettings)) throw bad('Invalid chat settings.')
      return
    case 'select': case 'close':
      if (!text(op.key, MAX_ROOT)) throw bad('Invalid project key.')
      return
    case 'reorder':
      if (!text(op.key, MAX_ROOT) || !(op.before === null || text(op.before, MAX_ROOT))) throw bad('Invalid project order.')
      return
    case 'recent':
      if (!path(op.root) || !text(op.name, MAX_NAME)) throw bad('Invalid recent project.')
      return
    case 'update':
      if (!Array.isArray(op.projects) || op.projects.length < 1 || op.projects.length > MAX_PATCHES) throw bad('Invalid project update.')
      for (const patch of op.projects) {
        if (!isObject(patch) || Object.keys(patch).length !== 2 || !text(patch.key, MAX_ROOT) || !isObject(patch.fields)) throw bad('Invalid project update.')
        const names = Object.keys(patch.fields)
        if (!names.length) throw bad('Empty project update.')
        for (const name of names) {
          const rule = Object.hasOwn(METADATA_FIELDS, name) ? METADATA_FIELDS[name] : undefined
          if (!rule || !rule(patch.fields[name])) throw bad(`Invalid project field ${JSON.stringify(name)}.`)
        }
      }
      return
    default: throw bad('Unknown workspace operation.')
  }
}

export interface WorkspaceApplyOptions {
  /** Milliseconds since the epoch; one value per operation. */
  now: number
  /** `realpath`, or null when the path cannot be resolved. */
  resolve(root: string): string | null
}
export interface WorkspaceApplied { changed: boolean; key?: string; created?: boolean }

/** Applies one validated operation to `doc` in place. Refusals change nothing. */
export function applyWorkspace(doc: WorkspaceDocument, op: WorkspaceOperation, options: WorkspaceApplyOptions): WorkspaceApplied {
  validateOperation(op)
  const entries = workspaceEntries(doc)
  const find = (key: string) => entries.find(({ entry }) => entry.key === key)
  const missing = () => new WorkspaceModelError('notFound', 'That project is no longer open.')
  switch (op.method) {
    case 'open': {
      const key = projectKey(op.root)
      if (find(key)) return { changed: false, key, created: false }
      // The same folder reached through another path is the same project.
      const real = options.resolve(op.root)
      const alias = real === null ? undefined : entries.find(({ entry }) => options.resolve(entry.root) === real)
      if (alias) return { changed: false, key: alias.entry.key, created: false }
      if (entries.length >= MAX_PROJECTS) throw new WorkspaceModelError('busy', 'Too many open projects; close one first.')
      doc.projects.push({
        root: op.root, key, name: projectName(op.root), url: null, previewKind: 'web', branch: null, launchSpec: null,
        touchedAt: options.now, sessionKeys: [key], activeSessionKey: key,
        ...(op.chatSettings !== undefined ? { chatSettings: { [key]: structuredClone(op.chatSettings) } } : {})
      })
      return { changed: true, key, created: true }
    }
    case 'select': {
      const found = find(op.key)
      if (!found) throw missing()
      found.entry.touchedAt = options.now
      doc.activeKey = op.key
      return { changed: true, key: op.key }
    }
    case 'close': {
      if (!find(op.key)) throw missing()
      // Every copy of the identity goes; invalid entries are left alone.
      doc.projects = doc.projects.filter(item => !(validEntry(item) && item.key === op.key))
      if (doc.activeKey === op.key) doc.activeKey = null
      return { changed: true, key: op.key }
    }
    case 'reorder': {
      const from = find(op.key)
      if (!from) throw missing()
      if (op.before === op.key) return { changed: false }
      const target = op.before === null ? undefined : find(op.before)
      if (op.before !== null && !target) throw missing()
      const next = doc.projects.filter((_, index) => index !== from.index)
      next.splice(target ? next.indexOf(target.entry) : next.length, 0, from.entry)
      if (next.every((item, index) => item === doc.projects[index])) return { changed: false }
      doc.projects = next
      return { changed: true }
    }
    case 'update': {
      let changed = false
      for (const patch of op.projects) {
        // A project closed meanwhile: the close won.
        const found = find(patch.key)
        if (!found) continue
        for (const [name, value] of Object.entries(patch.fields)) {
          if (JSON.stringify(found.entry[name]) === JSON.stringify(value)) continue
          found.entry[name] = structuredClone(value)
          changed = true
        }
      }
      return { changed }
    }
    case 'recent': {
      const prior = Array.isArray(doc.recents) ? doc.recents : []
      doc.recents = [{ root: op.root, name: op.name, at: options.now },
        ...prior.filter((item: unknown) => !(isObject(item) && item.root === op.root))].slice(0, MAX_RECENTS)
      return { changed: true }
    }
  }
}
