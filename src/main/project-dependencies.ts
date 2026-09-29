import { execFile } from 'node:child_process'
import { access, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { promisify } from 'node:util'
import type { PackageManager } from '../shared/api'
import { enqueueRepoWrite } from './repo-write-queue'

const run = promisify(execFile)
const exists = (path: string): Promise<boolean> =>
  access(path).then(
    () => true,
    () => false
  )

export async function projectPackageManager(root: string): Promise<PackageManager> {
  // Respect an explicit packageManager even while a migration leaves an old lockfile.
  try {
    const pkg = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'))
    const manager = typeof pkg.packageManager === 'string' ? pkg.packageManager.split('@')[0] : ''
    if (['bun', 'pnpm', 'yarn', 'npm'].includes(manager)) return manager as PackageManager
  } catch {
    /* detection reports malformed manifests */
  }
  if ((await exists(join(root, 'bun.lock'))) || (await exists(join(root, 'bun.lockb'))))
    return 'bun'
  if (await exists(join(root, 'pnpm-lock.yaml'))) return 'pnpm'
  if (await exists(join(root, 'yarn.lock'))) return 'yarn'
  return 'npm'
}

let serviceInstaller: ((root: string) => Promise<unknown>) | null = null

/** Swift launch (S06): the service runs and supervises installs. Bun keeps the
 * repository write lease around each one until the S07 repository lane. */
export function setDependencyInstaller(installer: ((root: string) => Promise<unknown>) | null): void {
  serviceInstaller = installer
}

/** Install in the live checkout: worktree-local node_modules are never landed by Git. */
export async function installProjectDependencies(
  root: string,
  log: (line: string) => void
): Promise<void> {
  return enqueueRepoWrite(root, async () => {
    // The service logs its own progress and output as runtime log lines.
    if (serviceInstaller) {
      await serviceInstaller(root)
      return
    }
    if (!(await exists(join(root, 'package.json')))) return
    const manager = await projectPackageManager(root)
    log(`Installing project dependencies with ${manager}…`)
    try {
      await run(manager, ['install'], { cwd: root, timeout: 300_000, maxBuffer: 16 * 1024 * 1024 })
    } catch (error) {
      throw new Error(
        `Could not install project dependencies with ${manager}: ${error instanceof Error ? error.message : String(error)}`
      )
    }
  })
}
