import {
  getAvailableContentControls,
  listContentControls,
  removeContentControls,
  saveContentControls
} from './content-controls'
import type { RpcHandlerRegistry } from './rpc-router'

export function registerContentControlsIpc(ipc: RpcHandlerRegistry): void {
  ipc.handle('content-controls:list', (_e, root: string) => listContentControls(root))
  ipc.handle('content-controls:get', (_e, root: string, id: string) => getAvailableContentControls(root, id))
  ipc.handle(
    'content-controls:save',
    (_e, root: string, id: string, revision: string, value: unknown) =>
      saveContentControls(root, id, revision, value)
  )
  ipc.handle('content-controls:remove', (_e, root: string, id: string) =>
    removeContentControls(root, id)
  )
}
