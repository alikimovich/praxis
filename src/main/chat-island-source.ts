import { createHash, randomUUID } from 'node:crypto'
import { readFile, realpath, writeFile } from 'node:fs/promises'
import { resolve, relative, isAbsolute } from 'node:path'
import { lexLiteral, locateAnchor, renderLiteral, resolveLiteralValue } from './control-manifest'
import { enqueueRepoWrite } from './repo-write-queue'
import { recordEdit, revertGroup } from './edit-history'
import type { IslandRecord, IslandValue } from '../shared/chat-islands'
export const sourceHash = (text: string) => createHash('sha256').update(text).digest('hex')
export async function islandSource(root: string, record: IslandRecord) {
  const base = await realpath(root), file = await realpath(resolve(root, record.manifest.file))
  const rel = relative(base, file)
  if (!rel || rel.startsWith('..') || isAbsolute(rel) || rel.split('/').some(p => ['.git', '.praxis', '.dsgn'].includes(p))) throw new Error('Source target escapes the project or uses metadata.')
  const code = await readFile(file, 'utf8')
  if (Buffer.byteLength(code) > 2_000_000) throw new Error('Source file is too large.')
  const values: Record<string, IslandValue> = {}
  for (const p of record.manifest.params) {
    const value = resolveLiteralValue(code, p)
    if (value === null) throw new Error(`Cannot resolve ${p.label}. Ask the agent to rebind this island.`)
    values[p.id] = value
  }
  return { file, code, values, revision: sourceHash(code) }
}
/** One file/gesture = one validated write and undo group. All participants share repo queue. */
export function writeIsland(root: string, record: IslandRecord, expected: string, values: Record<string, IslandValue>, guard: () => boolean) {
  return enqueueRepoWrite(root, async () => {
    if (!guard()) throw new Error('This island changed or closed. Reload its controls.')
    const source = await islandSource(root, record)
    if (source.revision !== expected) throw new Error('Source changed. Reload before applying your adjustment.')
    const changes: { start: number; end: number; text: string }[] = []
    if (!values || typeof values !== 'object' || Array.isArray(values) || !Object.keys(values).length) throw new Error('No values to apply.')
    for (const [id, value] of Object.entries(values)) {
      const param = record.manifest.params.find(p => p.id === id)
      if (!param || param.apply.strategy !== 'literal') throw new Error('Unknown binding.')
      const loc = locateAnchor(source.code, param.apply.anchor)
      if ('error' in loc) throw new Error('Binding no longer resolves.')
      const lit = lexLiteral(source.code, loc.at, param.kind)
      if (!lit) throw new Error('Source literal no longer resolves.')
      const converted = param.kind === 'bezier' && typeof value === 'string' ? value.match(/-?\d*\.?\d+/g)?.map(Number) : value
      const text = renderLiteral(param.kind, converted, param, lit.raw.startsWith('[') ? 'array' : 'string')
      if (typeof text !== 'string') throw new Error(text.error)
      changes.push({ start: lit.start, end: lit.end, text })
    }
    changes.sort((a, b) => b.start - a.start)
    for (let i = 1; i < changes.length; i++) if (changes[i].end > changes[i - 1].start) throw new Error('Overlapping bindings cannot be changed together.')
    let next = source.code
    for (const change of changes) next = next.slice(0, change.start) + change.text + next.slice(change.end)
    if (next === source.code) return undefined
    // Protect external edits observed during validation too.
    if (!guard() || await readFile(source.file, 'utf8') !== source.code) throw new Error('Source changed before the edit could be saved.')
    await writeFile(source.file, next, 'utf8')
    const group = `island:${randomUUID()}`
    recordEdit(root, source.file, source.code, next, group, group)
    return group
  })
}
export function undoIsland(root: string, group: string, guard: () => boolean) {
  return enqueueRepoWrite(root, async () => {
    if (!guard()) throw new Error('This island changed or closed.')
    const result = await revertGroup(root, group)
    if (!result.ok) throw new Error('Cannot undo: source or edit history changed.')
  })
}
