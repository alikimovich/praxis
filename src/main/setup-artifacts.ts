import { createHash, randomUUID } from 'node:crypto'
import { lstat, mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

// Copy only executable helpers owned by setup, never annotations, tokens, or user data.
export const SETUP_HELPERS = [
  'trezi-source.cjs',
  'trezi-rn-source.cjs',
  'trezi-svelte-stamp.mjs',
  'trezi-next-loader.cjs',
  'trezi-next.cjs',
  'trezi-mdx.mjs'
]

/** Runs before a provider turn, including for already-created chat worktrees. */
export async function syncSetupArtifacts(liveRoot: string, worktree: string): Promise<void> {
  await syncNamedArtifacts(liveRoot, worktree, '.trezi', SETUP_HELPERS)
  await syncNamedArtifacts(liveRoot, worktree, '.praxis', SETUP_HELPERS.map(name => name.replace('trezi', 'praxis')))
}

async function syncNamedArtifacts(liveRoot: string, worktree: string, directory: string, helpers: string[]): Promise<void> {
  const target = join(worktree, directory)
  const source = join(liveRoot, directory)
  for (const dir of [source, target]) {
    const info = await lstat(dir).catch((e) => {
      if (e.code !== 'ENOENT') throw e
      return null
    })
    if (info && (!info.isDirectory() || info.isSymbolicLink())) {
      throw new Error(`Setup helper directory must be a real directory: ${dir}`)
    }
  }
  const verified: Array<{ path: string; sha256: string }> = []
  for (const name of helpers) {
    const from = join(source, name)
    const info = await lstat(from).catch((e) => {
      if (e.code !== 'ENOENT') throw e
      return null
    })
    if (!info) {
      await rm(join(target, name), { force: true })
      continue
    }
    if (!info.isFile() || info.isSymbolicLink()) throw new Error(`Invalid setup helper: ${from}`)
    const content = await readFile(from)
    await mkdir(target, { recursive: true })
    const temporary = join(target, `${name}.${randomUUID()}.tmp`)
    // Exclusive create avoids following a preexisting temporary symlink.
    try {
      await writeFile(temporary, content, { flag: 'wx' })
      await rename(temporary, join(target, name))
    } finally {
      await rm(temporary, { force: true })
    }
    const actual = await readFile(join(target, name))
    if (!content.equals(actual)) throw new Error(`Setup helper verification failed: ${name}`)
    verified.push({
      path: `${directory}/${name}`,
      sha256: createHash('sha256').update(actual).digest('hex')
    })
  }
  const file = join(target, 'setup-helpers.json')
  await rm(file, { force: true })
  if (verified.length) {
    await writeFile(file, JSON.stringify({ worktree, helpers: verified }, null, 2), { flag: 'wx' })
  }
}
