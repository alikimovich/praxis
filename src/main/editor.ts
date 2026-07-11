import { type ChildProcess, spawn } from 'node:child_process'
import { createWriteStream } from 'node:fs'
import { mkdir, rename, rm, writeFile } from 'node:fs/promises'
import { createServer } from 'node:net'
import { join } from 'node:path'
import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import { app, type BrowserWindow, ipcMain } from 'electron'
import type { EditorStatus } from '../shared/api'
import {
  assetDirName,
  CODE_SERVER_VERSION,
  exists,
  urlFor as netUrlFor,
  resolveOverride
} from './editor-net'

/**
 * "Code mode" lifecycle: vendor (download-on-demand) and run a SINGLE
 * code-server instance for the whole app, and hand each project its own
 * `?folder=` URL against that one server. Deliberately independent of
 * devserver.ts (its own port allocator + child tracking) so the editor and the
 * previewed dev servers can't stall or kill each other.
 *
 * The native `WebContentsView` that actually paints code-server lives in
 * index.ts (like the preview/panel views); this module only owns the process,
 * the download, and the URL. index.ts asks for a URL (`editor:open`) and loads
 * it into the view itself, keeping main the owner of what gets loaded.
 *
 * Pure helpers (platform/arch → asset name, the `?folder=` URL, the
 * DSGN_CODE_SERVER_BIN override check) live in editor-net.ts, which has no
 * `electron` import so it loads under plain bun for test/editor-url.mjs — the
 * same split devserver.ts uses with devserver-net.ts.
 */

// No checksum for the spike. Structured so a single const could add one: set
// this to the hex sha256 of the tarball and verifyChecksum() would enforce it.
const CODE_SERVER_SHA256: string | null = null

const EDITOR_HOST = '127.0.0.1'
// Sits well clear of the dev-server base (devserver.ts uses 7777) so the two
// allocators never fight over the same low ports.
const EDITOR_PORT_BASE = 8888
// How long we'll poll for code-server to start serving before giving up.
const READY_BUDGET_MS = 15000

// ── paths ────────────────────────────────────────────────────────────────────

/** <userData>/dsgn/vendor — where extracted code-server builds live. */
function vendorDir(): string {
  return join(app.getPath('userData'), 'dsgn', 'vendor')
}

/** <userData>/dsgn/code-server — code-server's own user-data/extensions/config,
 *  kept out of the user's real ~/.config so we never touch it. */
function dataDir(): string {
  return join(app.getPath('userData'), 'dsgn', 'code-server')
}

// ── status plumbing ──────────────────────────────────────────────────────────

let getWindow: (() => BrowserWindow | null) | null = null

function setStatus(status: EditorStatus): void {
  getWindow?.()?.webContents.send('editor:status', status)
}

// ── port allocator (independent copy of devserver's pattern) ─────────────────

const reserved = new Set<number>()
let portChain: Promise<unknown> = Promise.resolve()

function isPortFree(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const srv = createServer()
    srv.once('error', () => resolve(false))
    srv.once('listening', () => srv.close(() => resolve(true)))
    srv.listen(port, EDITOR_HOST)
  })
}

async function findFreePort(base: number): Promise<number> {
  for (let p = base; p < base + 200 && p <= 65535; p++) {
    if (await isPortFree(p)) return p
  }
  throw new Error(`No free port found from ${base}.`)
}

function allocatePort(): Promise<number> {
  const next = portChain.then(async () => {
    let from = EDITOR_PORT_BASE
    for (;;) {
      const free = await findFreePort(from)
      if (!reserved.has(free)) {
        reserved.add(free)
        return free
      }
      from = free + 1
    }
  })
  portChain = next.catch(() => undefined)
  return next
}

// ── binary resolution (env override → vendored → download) ───────────────────

/** Resolve a runnable code-server binary, downloading + extracting it on demand.
 *  Order: DSGN_CODE_SERVER_BIN override → vendored path → download. */
async function resolveBinary(): Promise<string> {
  const override = await resolveOverride()
  if (override) return override

  const dirName = assetDirName()
  if (!dirName) throw new Error('unsupported platform')

  const binPath = join(vendorDir(), dirName, 'bin', 'code-server')
  if (await exists(binPath)) return binPath

  await download(dirName)
  if (!(await exists(binPath))) {
    throw new Error('code-server binary missing after extraction')
  }
  return binPath
}

/** Fetch + extract the pinned release tarball into <vendor>/<dirName>.
 *  Extraction lands in a scratch dir first and the completed tree is renamed
 *  into place atomically, so an interrupted/corrupt extraction can never leave a
 *  half-written vendor/<dirName> (with a stray bin/code-server) that a later
 *  resolveBinary() would mistake for a complete install. */
async function download(dirName: string): Promise<void> {
  const vendor = vendorDir()
  const tmpDir = join(vendor, '.tmp')
  const stageDir = join(tmpDir, 'extract')
  await mkdir(stageDir, { recursive: true })
  const tarPath = join(tmpDir, `${dirName}.tar.gz`)
  const url = `https://github.com/coder/code-server/releases/download/v${CODE_SERVER_VERSION}/${dirName}.tar.gz`

  setStatus({ state: 'downloading', progress: 0 })
  try {
    const res = await fetch(url, { redirect: 'follow' })
    if (!res.ok || !res.body) {
      throw new Error(`download failed (HTTP ${res.status})`)
    }
    const total = Number(res.headers.get('content-length')) || 0
    let received = 0
    const nodeStream = Readable.fromWeb(res.body as Parameters<typeof Readable.fromWeb>[0])
    nodeStream.on('data', (chunk: Buffer) => {
      received += chunk.length
      if (total > 0) setStatus({ state: 'downloading', progress: Math.min(1, received / total) })
    })
    await pipeline(nodeStream, createWriteStream(tarPath))

    await verifyChecksum(tarPath)
    // Extract into the scratch dir; only a fully-unpacked tree is promoted.
    await extractTar(tarPath, stageDir)
    const staged = join(stageDir, dirName)
    if (!(await exists(join(staged, 'bin', 'code-server')))) {
      throw new Error('code-server binary missing after extraction')
    }
    const dest = join(vendor, dirName)
    // Clear any pre-existing (possibly partial) install so the rename lands.
    await rm(dest, { recursive: true, force: true }).catch(() => undefined)
    await rename(staged, dest)
  } finally {
    await rm(tmpDir, { recursive: true, force: true }).catch(() => undefined)
  }
}

/** Enforce the pinned checksum when one is set (no-op for the spike). */
async function verifyChecksum(_tarPath: string): Promise<void> {
  if (!CODE_SERVER_SHA256) return
  // Structured for a one-line future addition:
  //   const hash = createHash('sha256'); ...; if (hex !== CODE_SERVER_SHA256) throw ...
}

function extractTar(tarPath: string, destDir: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn('tar', ['xzf', tarPath, '-C', destDir])
    child.once('error', reject)
    child.once('exit', (code) =>
      code === 0 ? resolve() : reject(new Error(`tar exited with code ${code}`))
    )
  })
}

// ── single code-server instance ──────────────────────────────────────────────

let child: ChildProcess | null = null
let port: number | null = null
let startPromise: Promise<number> | null = null

/** Ensure the single instance is vendored + running; returns its port.
 *  Idempotent and concurrency-safe (in-flight starts share one promise). */
function ensureStarted(): Promise<number> {
  if (child && port && !child.killed) return Promise.resolve(port)
  if (startPromise) return startPromise
  startPromise = doStart().finally(() => {
    startPromise = null
  })
  return startPromise
}

async function doStart(): Promise<number> {
  const bin = await resolveBinary()
  setStatus({ state: 'starting' })

  const p = await allocatePort()
  const userDataDir = join(dataDir(), 'user-data')
  const extensionsDir = join(dataDir(), 'extensions')
  const configPath = join(dataDir(), 'config.yaml')
  await mkdir(userDataDir, { recursive: true })
  await mkdir(extensionsDir, { recursive: true })
  // A bare code-server run writes ~/.config/code-server/config.yaml; pin --config
  // to our own file so we never touch the user's real config. Flags on the CLI
  // win, so no options are needed — but a comment-only file parses as YAML
  // `null`, which code-server rejects with "invalid config: null", so the doc
  // must still parse to an object.
  await writeFile(configPath, '# Managed by Praxis — options are passed on the CLI.\n{}\n')

  const c = spawn(
    bin,
    [
      '--auth',
      'none',
      '--bind-addr',
      `${EDITOR_HOST}:${p}`,
      '--disable-telemetry',
      '--disable-update-check',
      '--disable-workspace-trust',
      '--user-data-dir',
      userDataDir,
      '--extensions-dir',
      extensionsDir,
      '--config',
      configPath
    ],
    { detached: true, env: { ...process.env } }
  )
  child = c
  port = p
  // Keep the maps/reserved port honest if code-server dies on its own.
  c.on('exit', () => {
    reserved.delete(p)
    if (child === c) {
      child = null
      port = null
    }
  })

  try {
    await waitReady(p)
  } catch (err) {
    killChild(c)
    if (child === c) {
      child = null
      port = null
    }
    reserved.delete(p)
    throw err
  }
  setStatus({ state: 'ready' })
  return p
}

const delay = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms))

/** Poll the root URL until code-server serves (any HTTP status), or time out. */
async function waitReady(p: number): Promise<void> {
  const deadline = Date.now() + READY_BUDGET_MS
  const url = `http://${EDITOR_HOST}:${p}/`
  for (;;) {
    if (await probeReady(url)) return
    if (Date.now() > deadline) throw new Error('code-server did not become ready in time')
    await delay(300)
  }
}

async function probeReady(url: string, ms = 1500): Promise<boolean> {
  const ctrl = new AbortController()
  const t = setTimeout(() => ctrl.abort(), ms)
  try {
    const res = await fetch(url, { redirect: 'manual', signal: ctrl.signal })
    return res.status > 0
  } catch {
    return false
  } finally {
    clearTimeout(t)
  }
}

function killChild(c: ChildProcess): void {
  if (!c.pid) return
  try {
    // Negative pid kills the whole process group.
    process.kill(-c.pid, 'SIGTERM')
  } catch {
    c.kill('SIGTERM')
  }
}

function stopAll(): void {
  if (child) killChild(child)
  child = null
  port = null
}

/** Per-project workspace URL against the single server. */
function urlFor(p: number, root: string): string {
  return netUrlFor(EDITOR_HOST, p, root)
}

// ── IPC ──────────────────────────────────────────────────────────────────────

export function registerEditorIpc(getWin: () => BrowserWindow | null): void {
  getWindow = getWin

  ipcMain.handle('editor:open', async (_e, root: string) => {
    try {
      const p = await ensureStarted()
      return { ok: true, url: urlFor(p, root) }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      setStatus({ state: 'error', message })
      return { ok: false, error: message }
    }
  })

  app.on('before-quit', stopAll)
}
