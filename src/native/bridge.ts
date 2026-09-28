import { type ChildProcessWithoutNullStreams, spawn } from 'node:child_process'
import { EventEmitter } from 'node:events'
import type { Writable } from 'node:stream'
import { createInterface } from 'node:readline'

export class NativeBridge extends EventEmitter {
  child?: ChildProcessWithoutNullStreams
  private output: Writable
  readonly closed: Promise<void>
  private sequence = 0
  private pending = new Map<
    number,
    {
      resolve: (value: any) => void
      reject: (error: Error) => void
      timer: ReturnType<typeof setTimeout>
    }
  >()
  constructor(executable: string, directory: string, profile: string) {
    super()
    const supervised = process.env.TREZI_SERVICE_SUPERVISED === '1'
    this.child = supervised ? undefined : spawn(executable, [directory, profile], { stdio: 'pipe' })
    const input = this.child?.stdout ?? process.stdin
    this.output = this.child?.stdin ?? process.stdout
    const lines = createInterface({ input })
    // In service mode EOF is sent only after the host's final events drain.
    this.closed = new Promise(resolve => {
      if (this.child) this.child.once('close', () => resolve())
      else lines.once('close', () => resolve())
    })
    this.output.on('error', (error) => {
      if ((error as NodeJS.ErrnoException).code !== 'EPIPE') this.emit('host-error', error)
    })
    this.child?.stderr.pipe(process.stderr)
    lines.on('line', (line) => {
      try {
        const message = JSON.parse(line)
        if (message.event === 'reply') {
          const request = this.pending.get(message.id)
          if (!request) return
          clearTimeout(request.timer)
          this.pending.delete(message.id)
          if (message.error) request.reject(new Error(message.error))
          else request.resolve(message.value)
        } else this.emit(message.event, message)
      } catch (error) {
        console.error('Invalid native host message:', error)
      }
    })
    this.child?.on('error', (error) => this.emit('host-error', error))
    const disconnected = () => {
      for (const request of this.pending.values()) {
        clearTimeout(request.timer)
        request.reject(new Error('Native host closed'))
      }
      this.pending.clear()
      this.emit('closed')
    }
    if (this.child) this.child.once('exit', disconnected)
    else lines.once('close', disconnected)
  }
  send(method: string, data: object = {}) {
    if (this.output.destroyed) return
    this.output.write(`${JSON.stringify({ method, ...data })}\n`)
  }
  request(method: string, data: object = {}, timeout = 30_000): Promise<any> {
    const id = ++this.sequence
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id)
        reject(new Error(`Native ${method} timed out`))
      }, timeout)
      this.pending.set(id, { resolve, reject, timer })
      this.send(method, { ...data, id })
    })
  }
}

let connection: NativeBridge
export function setBridge(value: NativeBridge) {
  connection = value
}
export function bridge() {
  if (!connection) throw new Error('Native host is not connected')
  return connection
}
