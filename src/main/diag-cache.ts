import { mkdir, readFile, writeFile } from 'fs/promises'
import { join } from 'path'
import type { Diagnosis, DiagStep } from '../shared/api'

/**
 * Per-machine memory of diagnosed problems, keyed by project path + error
 * signature. Lives in a caller-provided dir (the app's userData) so nothing
 * lands in the repo. Pure (fs only) → unit-testable against a temp dir.
 */

const FILE = 'diagnostics.json'

interface StoredEntry {
  summary: string
  detail?: string
  steps: DiagStep[]
  status: 'proposed' | 'applied' | 'dismissed'
  at: string
}
type Store = Record<string, Record<string, StoredEntry>>

/** Stable key for an error, with the volatile bits (paths, ids, numbers) normalized out. */
export function signatureFor(error: string): string {
  const norm = error
    .toLowerCase()
    .replace(/[a-f0-9]{8,}(-[a-f0-9]{4,})+/g, '<id>') // uuids
    .replace(/[a-f0-9]{12,}/g, '<id>') // long hex
    .replace(/\/(?:[\w.@-]+\/)+[\w.@-]+/g, '<path>') // multi-segment fs paths (not a module's single slash)
    .replace(/\d+/g, 'N') // ports / line numbers / versions
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 400)
  let h = 5381
  for (let i = 0; i < norm.length; i++) h = ((h << 5) + h + norm.charCodeAt(i)) >>> 0
  return h.toString(16)
}

async function load(dir: string): Promise<Store> {
  try {
    return JSON.parse(await readFile(join(dir, FILE), 'utf8')) as Store
  } catch {
    return {}
  }
}

async function save(dir: string, store: Store): Promise<void> {
  await mkdir(dir, { recursive: true })
  await writeFile(join(dir, FILE), JSON.stringify(store, null, 2))
}

/** A previously-seen fix for this exact error class (on this machine + project), or null. */
export async function recall(dir: string, root: string, error: string): Promise<Diagnosis | null> {
  const signature = signatureFor(error)
  const e = (await load(dir))[root]?.[signature]
  if (!e) return null
  return {
    signature,
    summary: e.summary,
    detail: e.detail,
    steps: e.steps,
    seenBefore: true,
    status: e.status
  }
}

export async function remember(dir: string, root: string, diag: Diagnosis): Promise<void> {
  const store = await load(dir)
  ;(store[root] ??= {})[diag.signature] = {
    summary: diag.summary,
    detail: diag.detail,
    steps: diag.steps,
    status: diag.status ?? 'proposed',
    at: new Date().toISOString()
  }
  await save(dir, store)
}

export async function setStatus(
  dir: string,
  root: string,
  signature: string,
  status: 'applied' | 'dismissed'
): Promise<void> {
  const store = await load(dir)
  const e = store[root]?.[signature]
  if (!e) return
  e.status = status
  e.at = new Date().toISOString()
  await save(dir, store)
}
