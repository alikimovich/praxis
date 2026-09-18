import { createHash } from 'node:crypto'
import { access, lstat, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { installProjectDependencies } from './project-dependencies'

export async function isNextProject(root: string): Promise<boolean> {
  try {
    const pkg = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'))
    return Boolean(
      pkg.dependencies?.next || pkg.devDependencies?.next || pkg.peerDependencies?.next
    )
  } catch {
    return false
  }
}

/** Next/Turbopack cannot follow the shared node_modules link outside its root.
 * Install using the checkout's manifests and lockfile; never broaden the root. */
export async function provisionNextDependencies(
  liveRoot: string,
  checkout: string,
  install = installProjectDependencies
): Promise<void> {
  if (!(await isNextProject(checkout))) return
  const target = join(checkout, 'node_modules')
  const info = await lstat(target).catch(() => null)
  const fingerprint = async () => {
    const hash = createHash('sha256')
    for (const file of [
      'package.json',
      'bun.lock',
      'bun.lockb',
      'package-lock.json',
      'pnpm-lock.yaml',
      'yarn.lock'
    ]) {
      hash.update(file)
      hash.update(await readFile(join(checkout, file)).catch(() => Buffer.alloc(0)))
    }
    return hash.digest('hex')
  }
  const marker = join(checkout, '.praxis/dependencies.sha256')
  const current = await fingerprint()
  if (info?.isSymbolicLink()) await rm(target)
  else if (info && (await readFile(marker, 'utf8').catch(() => '')) === current) return
  // Empty/uninstalled projects are provisioned by their ordinary setup turn.
  if (
    !(await access(join(liveRoot, 'node_modules')).then(
      () => true,
      () => false
    ))
  )
    return
  await install(checkout, () => {})
  await mkdir(join(checkout, '.praxis'), { recursive: true })
  await rm(marker, { force: true })
  await writeFile(marker, await fingerprint(), { flag: 'wx' })
}
