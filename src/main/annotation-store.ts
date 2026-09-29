import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { Annotation, AnnotationInput } from '../shared/api'
import { projectKey } from '../shared/projectKey'

/**
 * Annotation storage (S05), separate from publication (`annotations.ts`, S13).
 * Reviewer notes are pinned to elements in `<repo>/.trezi/annotations.json`, a
 * sidecar the agent may not write. This module only reads and writes that file:
 * it runs no Git and publishes nothing. The file sits inside the user's
 * repository, so its writer stays in Bun until the repository lane (S07) can
 * serialize sidecar writes with Git; see docs/SWIFT-BACKEND-MEMORY.md.
 */

export const MAX_ANNOTATION_TEXT = 2000

export class AnnotationStoreError extends Error {
  constructor(
    readonly code: string,
    message: string
  ) {
    super(message)
  }
}

export interface AnnotationStore {
  /** The notes as stored. A damaged file rejects instead of reading as empty. */
  list: (root: string) => Promise<Annotation[]>
  add: (root: string, input: AnnotationInput) => Promise<Annotation[]>
  remove: (root: string, id: string) => Promise<Annotation[]>
}

const dir = (root: string): string => join(root, '.trezi')
const file = (root: string): string => join(dir(root), 'annotations.json')
const isNote = (value: unknown): value is Annotation =>
  !!value && typeof value === 'object' && typeof (value as Annotation).id === 'string' && typeof (value as Annotation).text === 'string'

export function createAnnotationStore(
  options: { now?: () => Date; newId?: () => string } = {}
): AnnotationStore {
  let counter = 0
  const now = options.now ?? (() => new Date())
  const newId = options.newId ?? ((): string => `a${Date.now().toString(36)}${(counter++).toString(36)}`)

  /**
   * Every entry exactly as stored, so a write never drops what it does not
   * understand. Absent is empty; anything but a JSON array is damaged and is
   * never replaced (the pre-S05 reader read it as empty and the next note
   * overwrote every earlier one).
   */
  const read = async (root: string): Promise<unknown[]> => {
    let raw: string
    try {
      raw = await readFile(file(root), 'utf8')
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return []
      throw new AnnotationStoreError('ioFailure', `Notes could not be read (${String(error)}).`)
    }
    let parsed: unknown
    try {
      parsed = JSON.parse(raw)
    } catch {
      parsed = null
    }
    if (!Array.isArray(parsed)) {
      throw new AnnotationStoreError(
        'recoveryRequired',
        '.trezi/annotations.json is not a valid notes file. It was left untouched; fix or remove it, then try again.'
      )
    }
    return parsed
  }

  /** Atomic write (tmp + rename) so a crash can't leave a half-written file. */
  const write = async (root: string, list: unknown[]): Promise<void> => {
    await mkdir(dir(root), { recursive: true })
    const tmp = `${file(root)}.tmp`
    await writeFile(tmp, `${JSON.stringify(list, null, 2)}\n`, 'utf8')
    await rename(tmp, file(root))
  }

  // Two IPC calls can interleave at their awaits. Serialize each project's
  // operations, reads included, so read-modify-write is atomic and a read issued
  // after a write sees it.
  const chains = new Map<string, Promise<unknown>>()
  const serialize = <T>(root: string, task: () => Promise<T>): Promise<T> => {
    const key = projectKey(root)
    const run = (chains.get(key) ?? Promise.resolve()).then(task, task)
    const settled = run.catch(() => undefined)
    chains.set(key, settled)
    void settled.then(() => {
      if (chains.get(key) === settled) chains.delete(key)
    })
    return run
  }
  const notes = (list: unknown[]): Annotation[] => list.filter(isNote)

  return {
    list: (root) => serialize(root, async () => notes(await read(root))),
    add: (root, input) =>
      serialize(root, async () => {
        const list = await read(root)
        const text = typeof input?.text === 'string' ? input.text.trim() : ''
        if (!text) return notes(list)
        const annotation: Annotation = {
          id: newId(),
          source: input.source,
          selector: input.selector,
          tag: input.tag,
          text: text.slice(0, MAX_ANNOTATION_TEXT),
          createdAt: now().toISOString()
        }
        const next = [...list, annotation]
        await write(root, next)
        return notes(next)
      }),
    remove: (root, id) =>
      serialize(root, async () => {
        const list = await read(root)
        const next = list.filter((entry) => !(isNote(entry) && entry.id === id))
        if (next.length !== list.length) await write(root, next)
        return notes(next)
      })
  }
}
