import type {} from '../shared/native-layout'
// Bundled in place of Electron's preload primitives for WKWebView only.
// The full PraxisApi and preview tools remain the shared preloads.
import type { NativeShellAction, NativeShellBridge } from '../shared/native-shell'
import type { NativePreferencesBridge } from '../shared/native-preferences'
import type { NativeWorkspaceBridge } from '../shared/native-workspace'
import type { NativeChatBridge } from '../shared/native-chat'
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
    if (key === 'api') {
      const cache = () => (globalThis as any).__praxisPreferences ??= {}
      const update = (key: string, value: string | null, imported = false) => {
        cache()[key] = value
        ipcRenderer.send('native-preferences:set', key, value, imported)
      }
      const preferences: NativePreferencesBridge = {
        getItem: key => {
          if (!Object.hasOwn(cache(), key)) {
            let legacy: string | null = null
            try { legacy = localStorage.getItem(key) } catch {}
            update(key, legacy, true)
          }
          return cache()[key] ?? null
        },
        setItem: (key, value) => update(key, value),
        removeItem: key => update(key, null)
      }
      ipcRenderer.on('native-preferences:changed', (_event, values) => { (globalThis as any).__praxisPreferences = values })
      Object.defineProperty(globalThis, 'praxisNativePreferences', { value: preferences, writable: false })
      try {
        for (const key of Object.keys(localStorage)) {
          if (/^praxis[:.]/.test(key) && key !== 'praxis:workspace' && !Object.hasOwn(cache(), key)) update(key, localStorage.getItem(key), true)
        }
      } catch {}

    }

    if (
      key === 'api' &&
      !location.search.includes('praxisPanel=') &&
      !location.search.includes('praxisEditor=')
    ) {
      const shell: NativeShellBridge = {
        readWorkspace: () => ipcRenderer.invoke('native-workspace:read') as Promise<string | null>,
        writeWorkspace: raw => ipcRenderer.send('native-workspace:write', raw),
        update: (state) => ipcRenderer.send('native-shell:state', state),
        onAction: (callback) => {
          const listener: Listener = (_event, action) => callback(action as NativeShellAction)
          ipcRenderer.on('native-shell:action', listener)
          return () => ipcRenderer.removeListener('native-shell:action', listener)
        }
      }
      Object.defineProperty(globalThis, 'praxisNativeShell', { value: shell, writable: false })
      Object.defineProperty(globalThis, 'praxisNativeLayout', { value: {
        panels: (panels: unknown) => ipcRenderer.send('native-layout:panels', panels),
        onFrame: (callback: (frame: unknown) => void) => { const listener: Listener = (_event, frame) => callback(frame); ipcRenderer.on('native-layout:frame', listener); return () => ipcRenderer.removeListener('native-layout:frame', listener) }
      } })
      Object.defineProperty(globalThis, 'praxisNativeContext', { value: { selection: (value: unknown) => ipcRenderer.send('native-context:selection', value) } })
      Object.defineProperty(globalThis, 'praxisNativeGit', { value: { action: (action: string, value?: string) => ipcRenderer.send('native-git:action', { action, value }) } })
      Object.defineProperty(globalThis, 'praxisNativeActivity', { value: { append: (text: string, kind: string) => ipcRenderer.send('native-activity:command', { action: 'append', text, kind }), action: (action: string) => ipcRenderer.send('native-activity:command', { action }) } })
      Object.defineProperty(globalThis, 'praxisNativeSheets', { value: { open: (kind: string, key?: string) => ipcRenderer.send('native-sheet:open', kind, key) }, writable: false })
      const workspace: NativeWorkspaceBridge = {
        command: command => ipcRenderer.invoke('native-workspace:command', command) as Promise<void>,
        onProjection: (callback: (value: any) => void) => { const listener: Listener = (_event, value) => callback(value); ipcRenderer.on('native-shell:projection', listener); return () => ipcRenderer.removeListener('native-shell:projection', listener) },
        onState: callback => {
          const listener: Listener = (_event, state) => callback(state as import('../shared/native-workspace').NativeWorkspaceSnapshot)
          ipcRenderer.on('native-workspace:state', listener)
          return () => ipcRenderer.removeListener('native-workspace:state', listener)
        }
      }
      Object.defineProperty(globalThis, 'praxisNativeWorkspace', { value: workspace, writable: false })

      const chat: NativeChatBridge = {
        focusComposer: () => ipcRenderer.send('native-composer:focus'),
        command: command => ipcRenderer.send('native-chat:command', command),
        onEffect: callback => {
          const listener: Listener = (_event, value) => callback(value as import('../shared/native-chat-controller').NativeChatEffect)
          ipcRenderer.on('native-chat:effect', listener)
          return () => ipcRenderer.removeListener('native-chat:effect', listener)
        }
      }
      Object.defineProperty(globalThis, 'praxisNativeChat', { value: chat, writable: false })
    }
  }
}
// Native picker/drop actions associate their File objects with trusted local paths.
export const webUtils = { getPathForFile: (file: File) => filePaths.get(file) ?? '' }
