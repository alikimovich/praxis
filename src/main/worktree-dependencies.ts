import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { editingOwner } from './editing-model'
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
 * Install using the checkout's manifests and lockfile; never broaden the root. The editing
 * owner removes the link and keeps the marker (`.trezi/dependencies.sha256`); the install
 * runs through the service installer. */
export async function provisionNextDependencies(
  liveRoot: string,
  checkout: string,
  install = installProjectDependencies
): Promise<void> {
  if (!(await isNextProject(checkout))) return
  const owner = editingOwner()
  // Empty/uninstalled projects are provisioned by their ordinary setup turn.
  if (!(await owner.dependencyState(liveRoot, checkout))) return
  await install(checkout, () => {})
  await owner.markDependencies(liveRoot, checkout)
}
