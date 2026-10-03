import { editingOwner } from './editing-owner'
import { installProjectDependencies } from './project-dependencies'

/** Every checkout gets its own node_modules (LKM-146): a shared link let an agent's
 * install or remove rewrite the live dependencies under the running dev server before
 * anything landed, and Next/Turbopack cannot follow such a link outside its root. The
 * editing owner removes a link, clones the live folder copy-on-write when the manifests
 * match and keeps the marker (`.trezi/dependencies.sha256`). Otherwise (another volume,
 * changed manifests) the checkout installs from its own manifests and lockfile through
 * the service installer. Never broadens a framework's root. */
export async function provisionDependencies(
  liveRoot: string,
  checkout: string,
  install = installProjectDependencies
): Promise<void> {
  const owner = editingOwner()
  // Empty/uninstalled projects are provisioned by their ordinary setup turn.
  if (!(await owner.dependencyState(liveRoot, checkout))) return
  await install(checkout)
  await owner.markDependencies(liveRoot, checkout)
}
