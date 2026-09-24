// Bundled in place of Electron's preload primitives for WKWebView only.
// The full PraxisApi and preview tools remain the shared preloads.
import type { NativeShellAction, NativeShellBridge } from '../shared/native-shell'
import { installComposer } from './composer-transport'
const filePaths = new WeakMap<File, string>()

type Listener = (event: object, ...args: unknown[]) => void
const listeners = new Map<string, Set<Listener>>()
const pending = new Map<
  number,
  { resolve: (value: unknown) => void; reject: (error: Error) => void }
>()
const documentId = `${Date.now()}-${Math.random()}`
let sequence = 0
type Delivery =
  | { type: 'reply'; id: number; document: string; error?: string; value?: unknown }
  | { type: 'event'; channel: string; args: unknown[] }
const nativeGlobal = globalThis as unknown as {
  webkit: { messageHandlers: { praxis: { postMessage: (value: unknown) => void } } }
  __praxisNativeDispatch: (message: Delivery) => void
}
const host = nativeGlobal.webkit.messageHandlers.praxis
nativeGlobal.__praxisNativeDispatch = (message: Delivery) => {
  if (message.type === 'reply') {
    if (message.document !== documentId) return
    const request = pending.get(message.id)
    if (!request) return
    pending.delete(message.id)
    if (message.error) request.reject(new Error(message.error))
    else request.resolve(message.value)
  } else {
    for (const listener of listeners.get(message.channel) ?? []) listener({}, ...message.args)
  }
}
export const ipcRenderer = {
  send(channel: string, ...args: unknown[]) {
    host.postMessage({
      type: 'send',
      channel,
      args,
      undefinedArgs: args.flatMap((value, index) => (value === undefined ? [index] : [])),
      document: documentId
    })
  },
  invoke(channel: string, ...args: unknown[]) {
    const id = ++sequence
    return new Promise((resolve, reject) => {
      pending.set(id, { resolve, reject })
      host.postMessage({
        type: 'invoke',
        id,
        channel,
        args,
        undefinedArgs: args.flatMap((value, index) => (value === undefined ? [index] : [])),
        document: documentId
      })
    })
  },
  on(channel: string, listener: Listener) {
    const set = listeners.get(channel) ?? new Set<Listener>()
    set.add(listener)
    listeners.set(channel, set)
  },
  removeListener(channel: string, listener: Listener) {
    listeners.get(channel)?.delete(listener)
  }
}
export const contextBridge = {
  exposeInMainWorld(key: string, value: unknown) {
    Object.defineProperty(globalThis, key, { value, writable: false })
    if (
      key === 'api' &&
      !location.search.includes('praxisPanel=') &&
      !location.search.includes('praxisEditor=')
    ) {
      const shell: NativeShellBridge = {
        update: (state) => ipcRenderer.send('native-shell:state', state),
        onAction: (callback) => {
          const listener: Listener = (_event, action) => callback(action as NativeShellAction)
          ipcRenderer.on('native-shell:action', listener)
          return () => ipcRenderer.removeListener('native-shell:action', listener)
        }
      }
      Object.defineProperty(globalThis, 'praxisNativeShell', { value: shell, writable: false })
      installComposer(ipcRenderer, (file, path) => filePaths.set(file, path))
    }
  }
}
// Native picker/drop actions associate their File objects with trusted local paths.
export const webUtils = { getPathForFile: (file: File) => filePaths.get(file) ?? '' }
