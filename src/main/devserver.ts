import { trackDevServer, stopDevServer } from './devserver-processes'
import { previewServers } from './preview-evidence'
import { type ChildProcess } from 'child_process'
import { spawnManagedCommand } from './managed-child'
import { app, type NativeView, ipcMain as nativeIpcMain } from '../native/platform'
import { installProjectDependencies } from './project-dependencies'
import type { Server } from 'http'
import type { DevServerInfo, Framework, RunningDevServer } from '../shared/api'
import { projectKey } from '../shared/projectKey'
import {
  findFreePort,
  hostVariants,
  normalizeUrl,
  stripAnsi,
  URL_RE,
  waitForReachable
} from './devserver-net'
import { editingOwner } from './editing-model'
import { startStaticServer } from './static-server'
import { detectProject, interpretFailure, PREVIEW_HOST, PREVIEW_PORT_BASE, withPort } from './project-detect'
import type { RpcHandlerRegistry } from './rpc-router'
import { registerServiceDevServer } from './devserver-service'
import type { ProjectRuntime } from '../native/runtime-service'

let ipcMain: RpcHandlerRegistry = nativeIpcMain

/**
 * Dev-server runner: the legacy owner (`TREZI_BACKEND_OWNER=legacy`). Under the
 * Swift launch the service owns project runtimes (S06) and the routes below are
 * served by `devserver-service.ts`; only detection's sidecar migration stays here.
 */

// --- running processes (one per open project) ------------------------------

// v5: keyed by projectKey(root) so several projects' dev servers run at once.
// Single-active behavior is preserved by the renderer stopping the previous
// project before opening another (until the workspace rail manages many).
const servers = new Map<string, ChildProcess>()
const startGenerations = new Map<string, number>()

// Static sites are served in-process (see static-server.ts), so they aren't
// child processes — track their http.Server separately, keyed the same way.
const staticServers = new Map<string, Server>()

// The resolved RunningDevServer (url/pid/attached) for each live server (child
// process OR in-process static), so a reattaching renderer (e.g. after a reload)
// can recover the URL instead of blindly respawning on a fresh port via start().
// Kept in lockstep with `servers`/`staticServers` — set wherever a server is
// added, cleared wherever one is dropped.
const running = previewServers

// Ports handed out but not necessarily bound yet. Concurrent starts (e.g. the
// rail opening several projects at once) would otherwise all probe the same free
// base and collide, since findFreePort only checks bindability at that instant.
const reserved = new Set<number>()
// Serialize allocation so the reserve is atomic across findFreePort's await.
let portChain: Promise<unknown> = Promise.resolve()

function allocatePort(): Promise<number> {
  const next = portChain.then(async () => {
    let from = PREVIEW_PORT_BASE
    for (;;) {
      const free = await findFreePort(from)
      if (!reserved.has(free)) {
        reserved.add(free)
        return free
      }
      from = free + 1 // a concurrent start already claimed this one — skip it
    }
  })
  portChain = next.catch(() => undefined)
  return next
}

function killChild(child: ChildProcess): void {
  void stopDevServer(child)
}

/** Stop the dev server for one project (no-op if it isn't running). */
function stop(root: string): void {
  const key = projectKey(root)
  startGenerations.set(key, (startGenerations.get(key) ?? 0) + 1)
  const child = servers.get(key)
  if (child) {
    servers.delete(key)
    killChild(child)
  }
  const staticServer = staticServers.get(key)
  if (staticServer) {
    staticServers.delete(key)
    staticServer.close()
  }
  running.delete(key)
}

/** Stop every running dev server (app quit). */
function stopAll(): void {
  for (const [key, generation] of startGenerations) startGenerations.set(key, generation + 1)
  for (const child of servers.values()) killChild(child)
  servers.clear()
  for (const s of staticServers.values()) s.close()
  staticServers.clear()
  running.clear()
}

async function start(
  opts: { root: string; command: string; framework?: Framework; installDependencies?: boolean },
  onLog: (line: string) => void
): Promise<RunningDevServer> {
  stop(opts.root) // drop a prior server for THIS project (restart); leave others

  const key = projectKey(opts.root)
  const generation = startGenerations.get(key)
  if (opts.installDependencies) await installProjectDependencies(opts.root, onLog)
  if (startGenerations.get(key) !== generation) throw new Error('Preview start was cancelled.')

  // Give the preview its own free port (no collisions, no stale attaches).
  // allocatePort reserves it so concurrent starts can't pick the same one.
  const port = await allocatePort()
  if (startGenerations.get(key) !== generation) {
    reserved.delete(port)
    throw new Error('Preview start was cancelled.')
  }
  onLog(`Assigned free port ${port} (binding ${PREVIEW_HOST}).`)

  // Static sites (vanilla HTML/JS) have no command to spawn — serve them from
  // trezi's built-in in-process static server. A custom command override skips
  // this (the user gave us something explicit to run instead).
  if (opts.framework === 'static' && !opts.command) {
    return startStaticSite(opts.root, port, onLog)
  }

  const command = withPort(opts.command, opts.framework, port)
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    FORCE_COLOR: '0',
    BROWSER: 'none',
    PORT: String(port),
    HOST: PREVIEW_HOST,
    HOSTNAME: PREVIEW_HOST
  }
  return spawnDevServer({ root: opts.root, command, env, port }, onLog)
}

/** Serve a static site in-process and register it like a spawned dev server. */
async function startStaticSite(
  root: string,
  port: number,
  onLog: (line: string) => void
): Promise<RunningDevServer> {
  const key = projectKey(root)
  try {
    const { server, running: info } = await startStaticServer(
      { root, port, host: PREVIEW_HOST },
      onLog
    )
    staticServers.set(key, server)
    running.set(key, info)
    // Keep the maps + reserved port honest if the server closes on its own.
    server.on('close', () => {
      reserved.delete(port)
      if (staticServers.get(key) === server) {
        staticServers.delete(key)
        running.delete(key)
      }
    })
    return info
  } catch (err) {
    reserved.delete(port)
    throw new Error(
      `Failed to start static server: ${err instanceof Error ? err.message : String(err)}`
    )
  }
}

function spawnDevServer(
  opts: { root: string; command: string; env: NodeJS.ProcessEnv; port: number },
  onLog: (line: string) => void
): Promise<RunningDevServer> {
  return new Promise<RunningDevServer>((resolve, reject) => {
    // INVARIANT: `shell: true` is BY DESIGN — this launches the target project's
    // own dev server, and such a command needs the shell for `&&`, env prefixes
    // and PATH lookup. It stays safe only while the command STRING has exactly
    // two possible origins: our own detection literals (`<pm> run dev|start`,
    // `npx expo start`) or a command the user typed as the custom-command
    // override. It must NEVER be built from previewed-page content, agent output,
    // or strings read out of the target repo's files — a repo would then execute
    // arbitrary shell just by being opened, before the user runs anything.
    const child = spawnManagedCommand(opts.command, {
      cwd: opts.root,
      env: opts.env
    })
    trackDevServer(child)
    const key = projectKey(opts.root)
    servers.set(key, child)
    // Keep the map + reserved ports honest if the server dies on its own.
    child.on('exit', () => {
      reserved.delete(opts.port)
      if (servers.get(key) === child) {
        servers.delete(key)
        running.delete(key)
      }
    })

    let settled = false
    let urlFound: string | null = null
    let tail = ''

    const settleWith = (url: string, note?: string): void => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      if (note) onLog(note)
      const info: RunningDevServer = { url, pid: child.pid!, attached: false }
      running.set(key, info)
      resolve(info)
    }

    // Primary: the server should come up on the exact port we assigned.
    const forcedUrl = `http://${PREVIEW_HOST}:${opts.port}`
    void (async () => {
      if (await waitForReachable([forcedUrl], () => settled))
        settleWith(forcedUrl, `Serving at ${forcedUrl}.`)
    })()

    const onData = (buf: Buffer): void => {
      const text = stripAnsi(buf.toString())
      tail = (tail + text).slice(-4000)
      for (const line of text.split('\n')) {
        if (line.trim()) onLog(line.trimEnd())
      }
      // Fallback: a framework that ignored our --port/PORT printed its own URL.
      if (settled || urlFound) return
      const match = text.match(URL_RE)
      if (match) {
        urlFound = normalizeUrl(match[1])
        void (async () => {
          const reachable = await waitForReachable(hostVariants(urlFound), () => settled)
          if (reachable)
            settleWith(reachable, reachable !== forcedUrl ? `Serving at ${reachable}.` : undefined)
        })()
      }
    }

    child.stdout?.on('data', onData)
    child.stderr?.on('data', onData)

    child.on('error', (err) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      reject(new Error(`Failed to start dev server: ${err.message}`))
    })

    child.on('exit', (code) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      reject(new Error(interpretFailure(code, tail)))
    })

    const timer = setTimeout(() => {
      if (settled) return
      settled = true
      // Kill THIS child, not whatever's in the map for this key — a restart may
      // have replaced it, and stop(root) would kill the newer server instead.
      killChild(child)
      reserved.delete(opts.port)
      if (servers.get(key) === child) {
        servers.delete(key)
        running.delete(key)
      }
      reject(new Error(`Timed out waiting for a localhost URL.\n${tail.slice(-600)}`))
    }, 90_000)
  })
}

export function registerDevServerIpc(
  getWindow: () => NativeView | null,
  router: RpcHandlerRegistry = nativeIpcMain,
  runtime?: ProjectRuntime
): void {
  ipcMain = router
  ipcMain.handle('project:detect', async (_e, root: string) => {
    // Move pre-rename `.dsgn/` data (annotations/tokens) into `.trezi/` before
    // anything reads the sidecar. No-op except right after the 2026-07 rename.
    for (const legacy of await editingOwner().migrateSidecar(root))
      console.warn(`Trezi metadata collision: keeping the existing file; legacy copy retained at ${legacy}`)
    return runtime ? runtime.detect(root) : detectProject(root)
  })
  if (runtime) {
    registerServiceDevServer(ipcMain, runtime, (line) => {
      const wc = getWindow()?.webContents
      if (wc && !wc.isDestroyed()) wc.send('devserver:log', line)
    })
    return
  }

  ipcMain.handle(
    'devserver:start',
    (_e, opts: { root: string; command: string; framework?: Framework; installDependencies?: boolean }) =>
      // The dev server's stdout/stderr `onData` keeps firing after the renderer
      // process is killed (OS display sleep / GPU loss): the window outlives its
      // webContents, so guard isDestroyed() or `.send()` throws an uncaught
      // "Object has been destroyed" — the crash dialog seen on wake.
      start(opts, (line) => {
        const wc = getWindow()?.webContents
        if (wc && !wc.isDestroyed()) wc.send('devserver:log', line)
      })
  )

  ipcMain.handle('devserver:stop', async (_e, root: string) => stop(root))

  // Is this project's dev server still running? (A warm/backgrounded server can
  // die; the renderer probes before navigating the preview to its stale URL.)
  ipcMain.handle('devserver:running', (_e, root: string) => {
    const key = projectKey(root)
    return servers.has(key) || staticServers.has(key)
  })

  // Like devserver:running, but also hands back the URL/pid — lets a reattaching
  // renderer (e.g. after a hard reload) recover the live preview URL instead of
  // going through start() again, which always stop()s and respawns on a fresh port.
  ipcMain.handle('devserver:info', (_e, root: string): DevServerInfo => {
    const key = projectKey(root)
    const server = running.get(key)
    return server ? { running: true, server } : { running: false }
  })

  // Never leave a spawned dev server orphaned when trezi quits.
  app.on('before-quit', stopAll)
}
