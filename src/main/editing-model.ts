import { randomUUID } from 'node:crypto'
import { lstatSync, mkdirSync, readFileSync, realpathSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { join } from 'node:path'
import type { IslandRecord } from '../shared/chat-islands'
import { previewPath } from '../shared/preview-navigation'
import { contentHash } from './source-owner'
import {
  EditingError,
  swiftEditingOwner,
  type ContentDraft,
  type EditingOwner,
  type SidecarName,
  SIDECAR_NAMES
} from './editing-owner'

/**
 * The in-process twin of the Swift editing coordinator (`src/service/Editing*.swift`):
 * the rollback owner under `TREZI_BACKEND_OWNER=legacy` and the owner of the pure unit
 * tests. Every decision and every byte it writes matches the Swift owner (the parity
 * section of test/editing-owner.mjs). Content drafts live in memory here, as before
 * S12; the Swift owner's persisted drafts are left untouched by it.
 */

const MAX_RECORDS = 30
const SIDECAR_BYTES = 1024 * 1024
const DRAFT_BYTES = 512 * 1024

interface Composition { token: string; origin: string | null; id: string; revision: number; turn: number; replacing: boolean; ended: boolean }
interface Running { ticket: string; id: string; action: string; expected: string }
interface Session {
  root: string; file: string; records: IslandRecord[]
  composing?: Composition; running?: Running
  undo: Map<string, string>; chain: Map<string, string>
}

const fail = (code: string, message: string): never => { throw new EditingError(code, message) }
const integer = (value: unknown): number | null => typeof value === 'number' && Number.isInteger(value) && Math.abs(value) < 1e9 ? value : null

export function islandFile(directory: string, root: string, record: string): string {
  return join(directory, createHash('sha256').update(root + '\0' + record).digest('hex') + '.json')
}

/** Same normalization as `EditingIslands.load`: a waiting island lost its turn. */
export function loadIslands(file: string): IslandRecord[] {
  let stored: unknown
  try {
    const text = readFileSync(file, 'utf8')
    if (text.length > 1_000_000) return []
    stored = JSON.parse(text)
  } catch { return [] }
  if (!Array.isArray(stored) || stored.length > MAX_RECORDS) return []
  return stored.flatMap((raw: any) => {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw) || raw.version !== 1 || typeof raw.id !== 'string') return []
    const revision = integer(raw.revision), turn = integer(raw.turn)
    if (revision === null || revision < 0 || turn === null || turn < 1) return []
    const record = { ...raw, status: raw.status === 'ready' ? 'ready' : 'unavailable' }
    if (raw.initial == null) record.initial = {}
    return [record as IslandRecord]
  })
}

export function legacyEditing(options: { islands?: string } = {}): EditingOwner {
  const sessions = new Map<string, Session>()
  const navigation = new Map<string, { root: string; path: string; turn: string | null; awaiting: boolean }>()
  const drafts = new Map<string, ContentDraft[]>()
  const session = (chat: string) => sessions.get(chat)

  const save = (chat: string, records: IslandRecord[]) => {
    const current = sessions.get(chat)!
    try {
      mkdirSync(options.islands!, { recursive: true })
      const temporary = `${current.file}.${randomUUID()}.tmp`
      writeFileSync(temporary, JSON.stringify(records))
      renameSync(temporary, current.file)
    } catch (error) { fail('ioFailure', `The island could not be saved (${error}).`) }
    for (const other of sessions.values()) if (other.file === current.file) other.records = records
  }

  return {
    kind: 'legacy',
    async islandsOpen(chat, root, record) {
      if (!options.islands) fail('unavailable', 'Chat islands have no history folder.')
      const file = islandFile(options.islands!, root, record)
      const existing = sessions.get(chat)
      if (existing?.file === file) return existing.records
      sessions.set(chat, { root, file, records: loadIslands(file), undo: new Map(), chain: new Map() })
      return sessions.get(chat)!.records
    },
    async islandsClose(chat) { sessions.delete(chat) },
    async islands(chat) { return session(chat)?.records ?? [] },
    async islandDefine(chat, turn, origin, id, revision) {
      const current = session(chat) ?? fail('notFound', 'This chat is not available for interactive islands yet.')
      if (current.composing || current.running) fail('busy', 'An island operation is already in progress.')
      const prior = id === undefined ? undefined : current.records.find(r => r.id === id)
      if (id !== undefined && (!prior || prior.revision !== revision)) fail('conflict', 'Island revision changed. Read it before updating.')
      turn = Math.max(1, turn)
      const replacing = prior?.turn === turn
      if (!replacing && current.records.length >= MAX_RECORDS) fail('invalidRequest', 'This chat has reached its island limit.')
      const composition: Composition = { token: randomUUID(), origin, id: replacing ? prior!.id : randomUUID(),
        revision: (replacing ? prior!.revision : 0) + 1, turn, replacing, ended: false }
      current.composing = composition
      return { token: composition.token, id: composition.id, revision: composition.revision, turn, replacing }
    },
    async islandCommit(chat, token, definition, engine, initial, fallback) {
      const current = session(chat)
      const composition = current?.composing
      if (!current || !composition || composition.token !== token || composition.ended) {
        if (current && composition?.token === token) current.composing = undefined
        return fail('conflict', 'Chat closed or turn finished during composition.')
      }
      const record = { version: 1, id: composition.id, revision: composition.revision, turn: composition.turn, ...definition,
        engine, status: 'waiting', initial, ...(fallback !== undefined ? { fallback } : {}),
        ...(composition.origin ? { origin: composition.origin } : {}) } as IslandRecord
      const next = composition.replacing && current.records.some(r => r.id === record.id)
        ? current.records.map(r => r.id === record.id ? record : r) : [...current.records, record]
      current.composing = undefined
      save(chat, next)
      return next
    },
    async islandAbort(chat, token) { const current = session(chat); if (current?.composing?.token === token) current.composing = undefined },
    async islandSettle(chat, turn, successful) {
      const current = session(chat)
      if (!current) return { records: null, cancelled: false }
      const ours = (origin?: string | null) => turn === null || !origin || origin === turn
      let cancelled = false
      if (current.composing && ours(current.composing.origin) && !current.composing.ended) { current.composing.ended = true; cancelled = true }
      let changed = false
      const next = current.records.map(record => {
        if (record.status !== 'waiting' || !ours(record.origin)) return record
        changed = true
        return { ...record, status: successful ? 'ready' : 'unavailable' } as IslandRecord
      })
      if (changed) save(chat, next)
      return { records: current.records, cancelled: cancelled && !successful }
    },
    async islandCommand(chat, id, revision, action, sourceRevision) {
      const current = session(chat) ?? fail('notFound', 'Island is unavailable. Reopen this chat.')
      if (current.running || current.composing) fail('busy', 'Island is unavailable or busy.')
      const record = current.records.find(r => r.id === id)
      if (!record || record.revision !== revision) return fail('conflict', 'Island changed. Reload its controls.')
      const expected = current.chain.get(sourceRevision) ?? sourceRevision
      const ticket = randomUUID()
      if (action === 'reload') return { ticket, expected }
      if (record.status !== 'ready') fail('conflict', 'Source has not landed.')
      let group: string | undefined
      if (action === 'undo') group = current.undo.get(id) ?? fail('notFound', 'No edit from this island is available to undo.')
      current.running = { ticket, id, action, expected }
      return { ticket, expected, ...(group ? { group } : {}), ...(action === 'reset' ? { initial: record.initial } : {}) }
    },
    async islandFinish(chat, ticket, outcome, last) {
      const current = session(chat)
      if (!current) return
      const running = current.running
      if (!running || running.ticket !== ticket) return fail('notFound', 'No such island command.')
      current.running = undefined
      if (outcome.ok) {
        if (running.action === 'undo') { current.undo.delete(running.id); current.chain.clear() }
        else if (outcome.group && outcome.revision) {
          current.undo.set(running.id, outcome.group)
          for (const [before, after] of current.chain) if (after === running.expected) current.chain.set(before, outcome.revision)
          current.chain.set(running.expected, outcome.revision)
          current.chain.delete(outcome.revision)
        }
      }
      if (last) current.chain.clear()
    },

    async navigate(chat, root, path, turn) {
      if (previewPath(path) !== path) fail('invalidRequest', 'Invalid preview path.')
      navigation.set(chat, { root, path, turn, awaiting: turn !== null })
      return turn === null
    },
    async navigation(chat, kind, turn) {
      const request = navigation.get(chat)
      if (!request) return false
      if (kind === 'landed') { if (request.turn === null || request.turn === turn) request.awaiting = false }
      else if (kind === 'failed') { if (turn === null || request.turn === null || request.turn === turn) { navigation.delete(chat); return false } }
      else if (kind === 'begin') { if (turn !== request.turn) { navigation.delete(chat); return false } }
      else { navigation.delete(chat); return false }
      return !request.awaiting
    },
    async navigationTake(chat) {
      const request = navigation.get(chat)
      if (!request || request.awaiting) return null
      navigation.delete(chat)
      return { root: request.root, path: request.path }
    },
    async navigationState() {
      return [...navigation].sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([chat, r]) => ({ chat, ...r }))
    },

    async contentDrafts(root) { return drafts.get(root) ?? [] },
    async saveContentDraft(root, panel, revision, value) {
      const draft = { panel, revision, value, updated: new Date().toISOString() }
      if (Buffer.byteLength(JSON.stringify(draft)) > DRAFT_BYTES) fail('invalidRequest', 'The draft exceeds 512 KB.')
      const next = [...(drafts.get(root) ?? []).filter(d => d.panel !== panel), draft]
      if (next.length > 20) fail('invalidRequest', 'Too many unsaved content drafts in this project.')
      drafts.set(root, next)
    },
    async clearContentDraft(root, panel) {
      const next = (drafts.get(root) ?? []).filter(d => d.panel !== panel)
      if (next.length) drafts.set(root, next); else drafts.delete(root)
    },

    async sidecar(root, name, expectedHash, content) {
      return commitSidecarLocally(root, name, expectedHash, content)
    }
  }
}

/** The legacy writer of a project sidecar: same checks as `EditingSidecar.commit`. */
export function commitSidecarLocally(root: string, name: SidecarName, expectedHash: string | null, content: string) {
  if (!SIDECAR_NAMES.includes(name)) fail('invalidRequest', 'Not a project sidecar.')
  if (Buffer.byteLength(content) > SIDECAR_BYTES) fail('invalidRequest', `The ${name} store would exceed 1 MB.`)
  const refused = () => fail('unauthorized', 'The .trezi folder is not a plain folder inside the project.')
  const base = realpathSync(root), directory = join(base, '.trezi'), file = join(directory, name)
  try { if (!lstatSync(directory).isDirectory()) refused() } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
    mkdirSync(directory)
  }
  if (realpathSync(directory) !== directory) refused()
  let current: string | null = null
  try {
    const info = lstatSync(file)
    if (!info.isFile()) refused()
    if (info.size > SIDECAR_BYTES) fail('invalidRequest', `The ${name} store is too large; it was left untouched.`)
    current = contentHash(readFileSync(file))
  } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error }
  if (current !== expectedHash) return { ok: false as const, conflict: true as const }
  const temporary = `${file}.${randomUUID()}.tmp`
  try { writeFileSync(temporary, content, { flag: 'wx' }); renameSync(temporary, file) } finally { rmSync(temporary, { force: true }) }
  return { ok: true as const, hash: contentHash(content) }
}

let fallback: EditingOwner | null = null

/** The Swift owner when installed, else this process's legacy twin (drafts, navigation, sidecars). */
export function editingOwner(): EditingOwner {
  const swift = swiftEditingOwner()
  if (swift) return swift
  if (!fallback) fallback = legacyEditing()
  return fallback
}
