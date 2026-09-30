import type { NativeView } from '../native/platform'
import { editingOwner } from './editing-owner'
import type { RpcHandlerRegistry } from './rpc-router'
import { registerServiceDevServer } from './devserver-service'
import type { ProjectRuntime } from '../native/runtime-service'

/**
 * Project detection and dev-server routes. The service owns project runtimes (S06):
 * the routes are served by `devserver-service.ts` against the Swift RuntimeOwner, the
 * only runner since LKM-111 removed the Bun one. Only detection's sidecar migration
 * stays here.
 */
export function registerDevServerIpc(
  getWindow: () => NativeView | null,
  router: RpcHandlerRegistry,
  runtime: ProjectRuntime
): void {
  router.handle('project:detect', async (_e, root: string) => {
    // Move pre-rename `.dsgn/` data (annotations/tokens) into `.trezi/` before
    // anything reads the sidecar. No-op except right after the 2026-07 rename.
    for (const legacy of await editingOwner().migrateSidecar(root))
      console.warn(`Trezi metadata collision: keeping the existing file; legacy copy retained at ${legacy}`)
    return runtime.detect(root)
  })
  // The window can outlive its webContents (display sleep / GPU loss), so guard
  // isDestroyed() or `.send()` throws for a late log line.
  registerServiceDevServer(router, runtime, (line) => {
    const wc = getWindow()?.webContents
    if (wc && !wc.isDestroyed()) wc.send('devserver:log', line)
  })
}
