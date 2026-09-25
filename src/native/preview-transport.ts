// Preview-only IPC transport, injected exclusively into the isolated WKContentWorld.
type Listener = (event: object, ...args: any[]) => void
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
