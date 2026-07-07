import { app, ipcMain, type BrowserWindow } from 'electron'
import { spawn, type ChildProcess } from 'child_process'
import { access, readFile } from 'fs/promises'
import { basename, join } from 'path'
import type {
  DetectedProject,
  Framework,
  PackageManager,
  PreviewKind,
  RunningDevServer
} from '../shared/api'
import {
  URL_RE,
  findFreePort,
  hostVariants,
  normalizeUrl,
  stripAnsi,
  waitForReachable
} from './devserver-net'
import { projectKey } from '../shared/projectKey'

// The preview always runs on a free port we pick (from this base) bound to IPv4
// loopback — so it never collides with the framework default (5173/3000), never
// hits the IPv4/IPv6 localhost mismatch, and never attaches to a stale server.
// 7777, not 6666: the IRC ports (6665-6669) are on the browser/fetch
// blocked-ports list, so a preview on 6666 can't be loaded or probed.
const PREVIEW_PORT_BASE = 7777
const PREVIEW_HOST = '127.0.0.1'

/** Append the framework's port/host flags so the dev server binds where we want. */
function withPort(command: string, framework: Framework | undefined, port: number): string {
  switch (framework) {
    case 'vite':
    case 'sveltekit':
      return `${command} -- --port ${port} --host ${PREVIEW_HOST}`
    case 'next':
      return `${command} -- --port ${port} -H ${PREVIEW_HOST}`
    default:
      // CRA + unknown/custom commands read PORT/HOST from the env we set instead.
      return command
  }
}

/**
 * Dev-server runner.
 *
 * Given a project folder: detect the framework + package manager, run the dev
 * command as a child process, parse the printed localhost URL, and return it so
 * the renderer can point the preview at it. A custom-command escape hatch lets
 * the user override the detected command (monorepos, odd setups).
 */

const exists = (p: string): Promise<boolean> =>
  access(p).then(
    () => true,
    () => false
  )

async function detectPackageManager(root: string): Promise<PackageManager> {
  if ((await exists(join(root, 'bun.lockb'))) || (await exists(join(root, 'bun.lock')))) return 'bun'
  if (await exists(join(root, 'pnpm-lock.yaml'))) return 'pnpm'
  if (await exists(join(root, 'yarn.lock'))) return 'yarn'
  return 'npm'
}

function detectFramework(deps: Record<string, string>): Framework {
  // React Native targets are checked first: an Expo repo also lists `react-native`,
  // and either one means "preview in a simulator", not a web dev server.
  if (deps['expo']) return 'expo'
  if (deps['react-native']) return 'react-native'
  if (deps['next']) return 'next'
  if (deps['@sveltejs/kit']) return 'sveltekit'
  if (deps['react-scripts']) return 'cra'
  if (deps['vite']) return 'vite'
  return 'unknown'
}

/** RN/Expo projects preview in the iOS Simulator; everything else is a web URL. */
function previewKindFor(framework: Framework): PreviewKind {
  return framework === 'expo' || framework === 'react-native' ? 'simulator' : 'web'
}

async function detect(root: string): Promise<DetectedProject> {
  const pkgPath = join(root, 'package.json')
  if (!(await exists(pkgPath))) {
    throw new Error('No package.json found in that folder.')
  }
  const pkg = JSON.parse(await readFile(pkgPath, 'utf8'))
  const scripts: Record<string, string> = pkg.scripts ?? {}
  const packageManager = await detectPackageManager(root)
  const framework = detectFramework({ ...pkg.dependencies, ...pkg.devDependencies })
  const previewKind = previewKindFor(framework)

  const scriptName = scripts.dev ? 'dev' : scripts.start ? 'start' : ''
  if (!scriptName && previewKind === 'web') {
    throw new Error('No "dev" or "start" script in package.json. Use a custom command.')
  }
  // RN/Expo: prefer the repo's start script (usually `expo start`), but fall back
  // to `expo start` directly so a repo without one still launches the simulator.
  const devCommand =
    scriptName !== ''
      ? `${packageManager} run ${scriptName}`
      : `${packageManager === 'npm' ? 'npx' : packageManager} expo start`

  return {
    root,
    name: pkg.name ?? basename(root),
    framework,
    packageManager,
    scriptName,
    devCommand,
    previewKind
  }
}

// --- running processes (one per open project) ------------------------------

// v5: keyed by projectKey(root) so several projects' dev servers run at once.
// Single-active behavior is preserved by the renderer stopping the previous
// project before opening another (until the workspace rail manages many).
const servers = new Map<string, ChildProcess>()

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
  if (!child.pid) return
  try {
    // Negative pid kills the whole process group (shell + dev server).
    process.kill(-child.pid, 'SIGTERM')
  } catch {
    child.kill('SIGTERM')
  }
}

/** Stop the dev server for one project (no-op if it isn't running). */
function stop(root: string): void {
  const key = projectKey(root)
  const child = servers.get(key)
  if (!child) return
  servers.delete(key)
  killChild(child)
}

/** Stop every running dev server (app quit). */
function stopAll(): void {
  for (const child of servers.values()) killChild(child)
  servers.clear()
}

const CONFLICT_RE =
  /port \d+ is in use|unable to acquire lock|another instance|EADDRINUSE|address already in use/i

function interpretFailure(code: number | null, tail: string): string {
  if (CONFLICT_RE.test(tail)) {
    return (
      'A dev server is already running for this project. dsgn manages the dev server itself — ' +
      'stop your other instance (e.g. the `dev` running in your terminal) and try again.'
    )
  }
  return `Dev server exited (code ${code}) before printing a URL.\n${tail.slice(-600)}`
}

async function start(
  opts: { root: string; command: string; framework?: Framework },
  onLog: (line: string) => void
): Promise<RunningDevServer> {
  stop(opts.root) // drop a prior server for THIS project (restart); leave others

  // Give the preview its own free port (no collisions, no stale attaches).
  // allocatePort reserves it so concurrent starts can't pick the same one.
  const port = await allocatePort()
  onLog(`Assigned free port ${port} (binding ${PREVIEW_HOST}).`)
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

function spawnDevServer(
  opts: { root: string; command: string; env: NodeJS.ProcessEnv; port: number },
  onLog: (line: string) => void
): Promise<RunningDevServer> {
  return new Promise<RunningDevServer>((resolve, reject) => {
    const child = spawn(opts.command, {
      cwd: opts.root,
      shell: true,
      detached: true, // new process group so we can kill the whole tree
      env: opts.env
    })
    const key = projectKey(opts.root)
    servers.set(key, child)
    // Keep the map + reserved ports honest if the server dies on its own.
    child.on('exit', () => {
      reserved.delete(opts.port)
      if (servers.get(key) === child) servers.delete(key)
    })

    let settled = false
    let urlFound: string | null = null
    let tail = ''

    const settleWith = (url: string, note?: string): void => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      if (note) onLog(note)
      resolve({ url, pid: child.pid!, attached: false })
    }

    // Primary: the server should come up on the exact port we assigned.
    const forcedUrl = `http://${PREVIEW_HOST}:${opts.port}`
    void (async () => {
      if (await waitForReachable([forcedUrl], () => settled)) settleWith(forcedUrl, `Serving at ${forcedUrl}.`)
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
          if (reachable) settleWith(reachable, reachable !== forcedUrl ? `Serving at ${reachable}.` : undefined)
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
      if (servers.get(key) === child) servers.delete(key)
      reject(new Error(`Timed out waiting for a localhost URL.\n${tail.slice(-600)}`))
    }, 90_000)
  })
}

export function registerDevServerIpc(getWindow: () => BrowserWindow | null): void {
  ipcMain.handle('project:detect', (_e, root: string) => detect(root))

  ipcMain.handle(
    'devserver:start',
    (_e, opts: { root: string; command: string; framework?: Framework }) =>
      start(opts, (line) => getWindow()?.webContents.send('devserver:log', line))
  )

  ipcMain.handle('devserver:stop', async (_e, root: string) => stop(root))

  // Is this project's dev server still running? (A warm/backgrounded server can
  // die; the renderer probes before navigating the preview to its stale URL.)
  ipcMain.handle('devserver:running', (_e, root: string) => servers.has(projectKey(root)))

  // Never leave a spawned dev server orphaned when dsgn quits.
  app.on('before-quit', stopAll)
}
