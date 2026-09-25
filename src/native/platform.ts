/** Native application services and the isolated WebKit message boundary. */

import { execFile, spawnSync } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { EventEmitter } from 'node:events'
import { homedir, tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { promisify } from 'node:util'
import * as channels from '../shared/preview-channels'
import { bridge } from './bridge'

export const app = Object.assign(new EventEmitter(), {
  getPath(name: string) {
    if (name === 'temp') return tmpdir()
    if (name === 'userData')
      return (
        process.env.PRAXIS_USER_DATA || join(homedir(), 'Library/Application Support/Praxis Native')
      )
    throw new Error(`Unsupported native path: ${name}`)
  },
  getAppPath: () => resolve(__dirname, '../..')
})
export interface NativeIpcEvent { sender: NativeWebContents }
type Handler = (event: NativeIpcEvent, ...args: any[]) => any
const requests = new Map<string, Handler>()
/** Trusted in-process observation; preview IPC cannot emit these events. */
export const serviceEvents = new EventEmitter()
export const ipcMain = Object.assign(new EventEmitter(), {
  handle(channel: string, handler: Handler) {
    if (requests.has(channel)) throw new Error(`Duplicate native IPC handler: ${channel}`)
    requests.set(channel, handler)
  }
})
export const previewSendChannels = new Set([
  channels.PREVIEW_PICKED,
  channels.PREVIEW_CANCELLED,
  channels.PREVIEW_TOGGLE_SELECT,
  channels.PREVIEW_TOOLBAR_ACTION,
  channels.PREVIEW_READINESS,
  channels.PREVIEW_TEXT_EDIT,
  channels.PREVIEW_PIN_CLICK,
  channels.PREVIEW_COMMENT_MODE,
  channels.PREVIEW_COMMENT,
  channels.STYLES_READ_REPLY,
  channels.LAYERS_READ_REPLY,
  channels.LAYERS_CHANGED,
  channels.PREVIEW_MOVE_NODE
])
export async function dispatchIPC(view: string, message: any) {
  if (!message || typeof message.channel !== 'string' || !Array.isArray(message.args))
    throw new Error('Invalid IPC message')
  if (view === 'preview' && (message.type !== 'send' || !previewSendChannels.has(message.channel)))
    throw new Error('Preview cannot invoke application commands')
  const sender = views.get(view)?.webContents
  if (!sender) throw new Error('Unknown IPC sender')
  const event = { sender }
  // JSON otherwise changes omitted optional arguments into null, defeating JS
  // default parameters in the shared handlers (for example newChat(root)).
  const undefinedArgs = new Set(Array.isArray(message.undefinedArgs) ? message.undefinedArgs : [])
  const args = message.args.map((value: unknown, index: number) =>
    undefinedArgs.has(index) ? undefined : value
  )
  if (message.type === 'invoke') {
    const handler = requests.get(message.channel)
    if (!handler) throw new Error(`Unsupported native command: ${message.channel}`)
    const result = await handler(event, ...args)
    serviceEvents.emit('command', message.channel, args, result)
    return result
  }
  ipcMain.emit(message.channel, event, ...args)
}

const run = promisify(execFile)
export const shell = {
  async openExternal(url: string) {
    if (!/^https?:\/\//i.test(url)) throw new Error('Only HTTP(S) external links are supported')
    await run('/usr/bin/open', [url])
  },
  async openPath(path: string) {
    try {
      await run('/usr/bin/open', [resolve(path)])
      return ''
    } catch (error) {
      return String(error)
    }
  },
  async trashItem(path: string) {
    await bridge().request('trash', { path: resolve(path) })
  }
}

// AES-GCM with a random key held in the macOS Keychain. No secrets in argv.
function crypt(operation: string, value: Buffer) {
  const executable = process.env.PRAXIS_NATIVE_HOST
  if (!executable) throw new Error('Native Keychain helper unavailable')
  const result = spawnSync(executable, ['--crypto', operation], {
    input: value,
    maxBuffer: 16 * 1024 * 1024
  })
  if (result.status !== 0)
    throw new Error('macOS Keychain encryption unavailable; unlock the keychain and retry.')
  return result.stdout
}
export const safeStorage = {
  isEncryptionAvailable: () => process.platform === 'darwin',
  getSelectedStorageBackend: () => 'keychain',
  encryptString: (text: string) => crypt('encrypt', Buffer.from(text)),
  decryptString: (blob: Buffer) => crypt('decrypt', blob).toString('utf8')
}

export class NativeImage {
  constructor(private result: { png: string; jpeg: string; width: number; height: number }) {}
  isEmpty() {
    return !this.result.png
  }
  getSize() {
    return { width: this.result.width, height: this.result.height }
  }
  toPNG() {
    return Buffer.from(this.result.png, 'base64')
  }
  toJPEG(_quality?: number) {
    return Buffer.from(this.result.jpeg, 'base64')
  }
  toDataURL() {
    return `data:image/png;base64,${this.result.png}`
  }
  // Swift generates a bounded JPEG alongside the full PNG for agent/feedback use.
  resize(_options?: { width?: number; height?: number }) {
    return this
  }
}
export class NativeView {
  url = ''
  destroyed = false
  webContents: {
    isDestroyed: () => boolean
    getURL: () => string
    send: (channel: string, ...args: any[]) => void
    loadURL: (url: string) => void
    capturePage: () => Promise<NativeImage>
    executeJavaScript: (code: string) => Promise<any>
    insertCSS: (css: string) => Promise<string>
    removeInsertedCSS: (key: string) => Promise<any>
  }
  constructor(readonly id: string) {
    views.set(id, this)
    this.webContents = {
      isDestroyed: () => this.destroyed,
      getURL: () => this.url,
      send: (channel: string, ...args: unknown[]) => {
        if (id === 'main') serviceEvents.emit('event', channel, ...args)
        else bridge().send('deliver', { view: id, message: { type: 'event', channel, args } })
      },
      loadURL: (url: string) => {
        this.url = url
        bridge().send('load', { view: id, url })
      },
      capturePage: async () => new NativeImage(id === 'main' ? await bridge().request('captureShellImage') : await bridge().request('capture', { view: id })),
      executeJavaScript: (code: string) => bridge().request('evaluate', { view: id, code }),
      insertCSS: async (css: string) => {
        const key = randomUUID()
        await bridge().request('evaluate', {
          view: id,
          isolated: true,
          code: `(()=>{const s=document.createElement('style');s.id=${JSON.stringify(key)};s.textContent=${JSON.stringify(css)};document.documentElement.append(s)})()`
        })
        return key
      },
      removeInsertedCSS: (key: string) =>
        bridge().request('evaluate', {
          view: id,
          isolated: true,
          code: `document.getElementById(${JSON.stringify(key)})?.remove()`
        })
    }
  }
  setBounds(bounds: object) {
    bridge().send('bounds', { view: this.id, bounds })
  }
  setBorderRadius(radius: number) {
    bridge().send('radius', { view: this.id, radius })
  }
  setVisible(visible: boolean) {
    bridge().send('visible', { view: this.id, visible })
  }
}
export const views = new Map<string, NativeView>()
export type NativeWebContents = NativeView['webContents']

export const protocolHandlers = new Map<string, (request: Request) => Promise<Response>>()
export const protocol = {
  registerSchemesAsPrivileged(_schemes: unknown[]) {},
  handle(scheme: string, handler: (request: Request) => Promise<Response>) {
    protocolHandlers.set(scheme, handler)
  }
}
