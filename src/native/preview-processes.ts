import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { realpath } from 'node:fs/promises'

const exec = promisify(execFile)
export interface PreviewProcess { pid: number; root: string; command: string; started: string; addresses: string[] }
async function output(file: string, args: string[]) {
  try { return (await exec(file, args, { timeout: 8000, maxBuffer: 1024 * 1024 })).stdout }
  catch (error: any) {
    // lsof/ps use exit 1 when no matching process exists.
    if (error.code === 1 && !error.stderr?.trim()) return ''
    throw new Error(`Could not inspect running servers: ${error.stderr || error.message}`)
  }
}
export function parseListeners(raw: string) {
  const processes = new Map<number, string[]>()
  let pid = 0
  for (const line of raw.split('\n')) {
    if (line.startsWith('p')) { pid = Number(line.slice(1)); if (Number.isInteger(pid) && pid > 1) processes.set(pid, []) }
    if (line.startsWith('n') && processes.has(pid)) processes.get(pid)!.push(line.slice(1))
  }
  return processes
}
async function inspect(root: string, pid: number): Promise<PreviewProcess | null> {
  if (!Number.isInteger(pid) || pid <= 1 || pid === process.pid || pid === process.ppid) return null
  const uid = process.getuid?.()
  if (uid === undefined) throw new Error('Server recovery requires macOS process inspection.')
  const addresses = parseListeners(await output('/usr/sbin/lsof', ['-nP', '-a', '-u', String(uid), '-p', String(pid), '-iTCP', '-sTCP:LISTEN', '-Fpn'])).get(pid)
  if (!addresses?.length) return null
  const cwd = (await output('/usr/sbin/lsof', ['-a', '-p', String(pid), '-d', 'cwd', '-Fn'])).split('\n').find(line => line.startsWith('n'))?.slice(1)
  if (!cwd || await realpath(cwd).catch(() => '') !== root) return null
  const started = (await output('/bin/ps', ['-p', String(pid), '-o', 'lstart='])).trim()
  const command = (await output('/bin/ps', ['-p', String(pid), '-o', 'command='])).trim()
  return started && command ? { pid, root, started, command, addresses: [...new Set(addresses)].sort() } : null
}
export async function findPreviewProcesses(root: string): Promise<PreviewProcess[]> {
  const canonical = await realpath(root)
  const uid = process.getuid?.()
  if (process.platform !== 'darwin' || uid === undefined) throw new Error('Server recovery is available on macOS.')
  const listeners = parseListeners(await output('/usr/sbin/lsof', ['-nP', '-a', '-u', String(uid), '-iTCP', '-sTCP:LISTEN', '-Fpn']))
  const matches = await Promise.all([...listeners.keys()].map(pid => inspect(canonical, pid)))
  return matches.filter((value): value is PreviewProcess => value !== null)
}
export function samePreviewProcess(a: PreviewProcess, b: PreviewProcess | null) {
  return b !== null && a.pid === b.pid && a.root === b.root && a.started === b.started && a.command === b.command && JSON.stringify(a.addresses) === JSON.stringify(b.addresses)
}
export async function stopPreviewProcess(server: PreviewProcess) {
  // Recheck OS identity, ownership, cwd and listeners immediately before signaling.
  if (!samePreviewProcess(server, await inspect(server.root, server.pid))) throw new Error('This server changed or exited. Refresh the server list before trying again.')
  process.kill(server.pid, 'SIGTERM')
  for (let i = 0; i < 30; i++) {
    await new Promise(resolve => setTimeout(resolve, 200))
    if (!await inspect(server.root, server.pid)) return
  }
  throw new Error('The server did not stop. Review Activity or stop it in its terminal, then retry. Praxis did not force-kill it.')
}
