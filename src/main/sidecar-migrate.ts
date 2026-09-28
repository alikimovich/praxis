import { randomUUID } from 'node:crypto'
import { link, lstat, mkdir, readdir, readFile, writeFile, unlink } from 'node:fs/promises'
import { join } from 'node:path'

async function publishCopy(from: string, to: string) {
  const temporary = `${to}.migration-${randomUUID()}`
  try {
    await writeFile(temporary, await readFile(from), { flag: 'wx', mode: 0o600 })
    await link(temporary, to) // Atomic exclusive publication; no partial destination.
  } finally { await unlink(temporary).catch(() => {}) }
}

/** Copy legacy data without removing the original. Existing canonical files win;
 * collisions are reported and both versions remain available for reconciliation.
 * Exclusive copies are restartable. Never follow project-controlled symlinks.
 */
async function copyLegacy(from: string, to: string): Promise<void> {
  const info = await lstat(from).catch((error) => {
    if (error.code === 'ENOENT') return null
    throw error
  })
  if (!info) return
  if (!info.isDirectory()) throw new Error(`Legacy metadata must be a real directory: ${from}`)
  const dest = await lstat(to).catch(error => { if (error.code === 'ENOENT') return null; throw error })
  if (dest && !dest.isDirectory()) throw new Error(`Metadata must be a real directory: ${to}`)
  await mkdir(to, { recursive: true })
  for (const entry of await readdir(from, { withFileTypes: true })) {
    const source = join(from, entry.name), target = join(to, entry.name)
    if (entry.isDirectory()) { await copyLegacy(source, target); continue }
    if (!entry.isFile()) throw new Error(`Unsupported legacy metadata entry: ${source}`)
    try { await publishCopy(source, target) } catch (error: any) {
      if (error.code !== 'EEXIST') throw error
      const targetInfo = await lstat(target)
      if (!targetInfo.isFile()) throw new Error(`Invalid metadata destination: ${target}`)
      if (!(await readFile(source)).equals(await readFile(target)))
        console.warn(`Trezi metadata collision: using ${target}; legacy copy retained at ${source}`)
    }
  }
}
export async function migrateLegacySidecar(root: string): Promise<void> {
  await copyLegacy(join(root, '.praxis'), join(root, '.trezi'))
  const oldDirectory = await lstat(join(root, '.dsgn')).catch(error => { if (error.code === 'ENOENT') return null; throw error })
  if (oldDirectory && !oldDirectory.isDirectory()) throw new Error('Legacy dsgn metadata must be a real directory.')
  const currentDirectory = await lstat(join(root, '.trezi')).catch(error => { if (error.code === 'ENOENT') return null; throw error })
  if (currentDirectory && !currentDirectory.isDirectory()) throw new Error('Trezi metadata must be a real directory.')
  // Preserve the previous dsgn migration policy: only its known data files move.
  for (const file of ['annotations.json', 'tokens.json', 'control-panels.json']) {
    const from = join(root, '.dsgn', file), to = join(root, '.trezi', file)
    const source = await lstat(from).catch(error => { if (error.code === 'ENOENT') return null; throw error })
    if (!source) continue
    if (!source.isFile()) throw new Error(`Invalid legacy metadata: ${from}`)
    const target = await lstat(to).catch(error => { if (error.code === 'ENOENT') return null; throw error })
    if (target) continue
    await mkdir(join(root, '.trezi'), { recursive: true })
    // Copy exclusively before unlinking the legacy file; interruption preserves data.
    await publishCopy(from, to)
    await unlink(from)
  }
}
