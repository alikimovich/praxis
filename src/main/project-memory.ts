import { createHash } from 'node:crypto'
import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { Revision } from '../shared/service-contract/types'
import { projectKey } from '../shared/projectKey'

/** Project memory is intentionally small: it is injected into model context. */
export const MAX_PROJECT_MEMORY_CHARS = 16_000

export interface ProjectMemory {
  content: string
  updatedAt: number
  /** SHA-256 of the file's bytes, or `absent`: the version this snapshot is. */
  digest: string
  /** The Swift owner's revision for this project (absent from the legacy owner). */
  revision?: Revision
}

/**
 * The owner of project memory: the Swift service (S05, `project-memory-service.ts`)
 * or, under `TREZI_BACKEND_OWNER=legacy`, the Bun writer below. `save` is the
 * editor's manual save, the user's final override. `propose` is a generated
 * evaluation: it commits only if memory is still the `base` it was evaluated
 * against, and answers `null` (stale) otherwise, so it can never overwrite a
 * manual save made while the model was running.
 */
export interface ProjectMemoryStore {
  get: (root: string) => Promise<ProjectMemory>
  save: (root: string, content: string) => Promise<ProjectMemory>
  propose: (root: string, base: ProjectMemory, content: string) => Promise<ProjectMemory | null>
}

export interface ProjectMemoryUpdateQueue {
  enqueue: (
    root: string,
    evaluate: (currentMemory: string) => Promise<string | null>
  ) => Promise<void>
}

export class ProjectMemoryError extends Error {
  constructor(
    readonly code: string,
    message: string
  ) {
    super(message)
  }
}

// --- The format, shared by both owners (MemoryFile.swift produces the same bytes) ---

export const ABSENT = 'absent'
export const memoryDigest = (bytes: Buffer | null): string =>
  bytes ? createHash('sha256').update(bytes).digest('hex') : ABSENT
/** The file name: hex SHA-256 of `projectKey(root)`. */
export const memoryFileId = (root: string): string =>
  createHash('sha256').update(projectKey(root)).digest('hex')
/** The editor's value as stored: trimmed, then bounded. */
export const normalizeProjectMemory = (content: string): string =>
  content.trim().slice(0, MAX_PROJECT_MEMORY_CHARS)
export const encodeProjectMemory = (record: { content: string; updatedAt: number }): Buffer =>
  Buffer.from(JSON.stringify({ content: record.content, updatedAt: record.updatedAt }), 'utf8')

/**
 * Absent is empty. Anything but an object with a string `content` and a number
 * `updatedAt` is damaged: refused, and never replaced by either owner (the
 * pre-S05 reader treated it as empty and the next save overwrote it).
 */
export function decodeProjectMemory(bytes: Buffer | null): { content: string; updatedAt: number } {
  if (!bytes) return { content: '', updatedAt: 0 }
  let raw: unknown
  try {
    raw = JSON.parse(bytes.toString('utf8'))
  } catch {
    throw damaged()
  }
  const record = raw as Partial<Record<'content' | 'updatedAt', unknown>> | null
  if (!record || typeof record !== 'object' || Array.isArray(record)) throw damaged()
  if (typeof record.content !== 'string' || typeof record.updatedAt !== 'number') throw damaged()
  return { content: record.content.slice(0, MAX_PROJECT_MEMORY_CHARS), updatedAt: record.updatedAt }
}

const damaged = () =>
  new ProjectMemoryError(
    'recoveryRequired',
    'Project memory is not a valid saved memory. It was left untouched; fix or remove it, then try again.'
  )

/**
 * The Bun writer: the `TREZI_BACKEND_OWNER=legacy` rollback owner. Durable,
 * per-machine memory under Trezi userData rather than `<repo>/.trezi`: memories
 * are model context, not project source, and must never sneak into a
 * commit/publish or participate in worktree merges. Reads, compares and writes are
 * synchronous, so each operation is atomic within this process.
 */
export function createProjectMemoryStore(
  baseDir: string,
  now: () => number = Date.now
): ProjectMemoryStore {
  const dir = join(baseDir, 'project-memories')
  const fileFor = (root: string): string => join(dir, `${memoryFileId(root)}.json`)
  const read = (root: string): ProjectMemory => {
    let bytes: Buffer | null = null
    try {
      bytes = readFileSync(fileFor(root))
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        throw new ProjectMemoryError('ioFailure', `Project memory could not be read (${String(error)}).`)
      }
    }
    return { ...decodeProjectMemory(bytes), digest: memoryDigest(bytes) }
  }
  const write = (root: string, current: ProjectMemory, content: string): ProjectMemory => {
    const next = normalizeProjectMemory(content)
    if (next === current.content) return current
    const record = { content: next, updatedAt: now() }
    const bytes = encodeProjectMemory(record)
    mkdirSync(dir, { recursive: true })
    const target = fileFor(root)
    const tmp = `${target}.${process.pid}.tmp`
    writeFileSync(tmp, bytes)
    renameSync(tmp, target)
    return { ...record, digest: memoryDigest(bytes) }
  }

  return {
    get: async (root) => read(root),
    save: async (root, content) => write(root, read(root), content),
    propose: async (root, base, content) => {
      if (!normalizeProjectMemory(content)) throw new ProjectMemoryError('invalidRequest', 'A proposal cannot erase project memory.')
      const current = read(root)
      return current.digest === base.digest ? write(root, current, content) : null
    }
  }
}

/**
 * Serialize automatic memory evaluations per project. Each evaluator reads the
 * latest merged memory when its turn starts, so two peer chats cannot overwrite
 * one another. The owner refuses a proposal whose base is no longer current, which
 * protects a manual editor save made while a model call is in flight; the
 * evaluation retries against that new authoritative value instead of clobbering it.
 */
export function createProjectMemoryUpdateQueue(
  store: ProjectMemoryStore
): ProjectMemoryUpdateQueue {
  const chains = new Map<string, Promise<void>>()

  const enqueue = (
    root: string,
    evaluate: (currentMemory: string) => Promise<string | null>
  ): Promise<void> => {
    const key = projectKey(root)
    const prior = chains.get(key) ?? Promise.resolve()
    const run = prior
      .catch(() => {})
      .then(async () => {
        // One retry is enough to preserve a concurrent manual edit without
        // allowing a busy editor to trigger an unbounded series of model calls.
        for (let attempt = 0; attempt < 2; attempt += 1) {
          const before = await store.get(root)
          const next = await evaluate(before.content)
          if (next === null || next.trim() === before.content.trim()) return
          if (await store.propose(root, before, next)) return
        }
      })
      .catch(() => {
        /* best-effort: chat completion must never fail because memory did */
      })

    chains.set(key, run)
    void run.finally(() => {
      if (chains.get(key) === run) chains.delete(key)
    })
    return run
  }

  return { enqueue }
}

/**
 * Which memory version each live provider session already carries. Memory is part
 * of a session's initial instructions; if it changes while the session stays open,
 * the new version is injected once, on its next turn. Unreadable memory (damaged
 * file, owner unavailable) is no memory: it never fails a chat, and the session
 * records no version, so memory is injected as soon as it can be read. The map is
 * chat state (S11); the versions are the owner's digests.
 */
export function createProjectMemoryInjection(store: () => ProjectMemoryStore) {
  const known = new Map<string, string>()
  const read = (root: string) =>
    store()
      .get(root)
      .catch(() => null)
  return {
    /** Memory for a new session's instructions. */
    async context(root: string, session: string | null): Promise<string> {
      const memory = await read(root)
      if (session) {
        if (memory) known.set(session, memory.digest)
        else known.delete(session)
      }
      return memory?.content ?? ''
    },
    /** The turn's prompt, carrying memory only if it changed since the session saw it. */
    async prompt(root: string, session: string | undefined, text: string): Promise<string> {
      const memory = await read(root)
      if (!memory) return text
      const changed = !session || memory.digest !== known.get(session)
      if (session) known.set(session, memory.digest)
      return changed ? projectMemoryUpdate(memory.content, text) : text
    },
    forget: (session: string) => known.delete(session),
    clear: () => known.clear()
  }
}

/** A bounded, clearly-delimited rules section shared by every provider. */
export function projectMemoryRules(content: string): string[] {
  const memory = content.trim().slice(0, MAX_PROJECT_MEMORY_CHARS)
  if (!memory) return []
  return [
    '',
    '## Project memory',
    'Trezi stores the following durable project decisions separately from this chat.',
    'Treat them as standing context. If a current user request contradicts them, follow',
    'the current request and call out that the saved memory may need updating.',
    '',
    '<project-memory>',
    memory,
    '</project-memory>'
  ]
}

/** One-time update injected when memory changed after a live session started. */
export function projectMemoryUpdate(content: string, prompt: string): string {
  const lines = projectMemoryRules(content)
  const update = lines.length
    ? lines.join('\n')
    : [
        '## Project memory update',
        'Trezi project memory is now empty. Do not treat earlier saved memory as standing context.'
      ].join('\n')
  return `${update}\n\n---\n\n${prompt}`
}
