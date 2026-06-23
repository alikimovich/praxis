import { app, ipcMain, type BrowserWindow } from 'electron'
import { spawn, type ChildProcess } from 'child_process'
import { access, readFile } from 'fs/promises'
import { basename, join } from 'path'
import type { DetectedProject, Framework, PackageManager, RunningDevServer } from '../shared/api'

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
  if (deps['next']) return 'next'
  if (deps['@sveltejs/kit']) return 'sveltekit'
  if (deps['react-scripts']) return 'cra'
  if (deps['vite']) return 'vite'
  return 'unknown'
}

async function detect(root: string): Promise<DetectedProject> {
  const pkgPath = join(root, 'package.json')
  if (!(await exists(pkgPath))) {
    throw new Error('No package.json found in that folder.')
  }
  const pkg = JSON.parse(await readFile(pkgPath, 'utf8'))
  const scripts: Record<string, string> = pkg.scripts ?? {}
  const scriptName = scripts.dev ? 'dev' : scripts.start ? 'start' : ''
  if (!scriptName) {
    throw new Error('No "dev" or "start" script in package.json. Use a custom command.')
  }
  const packageManager = await detectPackageManager(root)
  const framework = detectFramework({ ...pkg.dependencies, ...pkg.devDependencies })
  return {
    root,
    name: pkg.name ?? basename(root),
    framework,
    packageManager,
    scriptName,
    devCommand: `${packageManager} run ${scriptName}`
  }
}

// --- running process -------------------------------------------------------

let current: ChildProcess | null = null

const URL_RE = /(https?:\/\/(?:localhost|127\.0\.0\.1|0\.0\.0\.0)(?::\d+)?[^\s)]*)/i

function normalizeUrl(raw: string): string {
  return raw.replace('0.0.0.0', 'localhost').replace(/[.,)]*$/, '').replace(/\/$/, '')
}

const delay = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms))

/**
 * Poll the URL until it actually serves a response. Dev servers (notably
 * Next.js) print their URL before they're ready to answer requests, which the
 * preview sees as ERR_EMPTY_RESPONSE. fetch() resolves on any HTTP status and
 * only throws on a real connection failure, so a successful fetch == ready.
 */
async function waitForReady(url: string, isSettled: () => boolean): Promise<boolean> {
  for (let i = 0; i < 120; i++) {
    if (isSettled()) return false
    try {
      await fetch(url, { redirect: 'manual' })
      return true
    } catch {
      await delay(500)
    }
  }
  return false
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

function stop(): void {
  if (!current?.pid) {
    current = null
    return
  }
  try {
    // Negative pid kills the whole process group (shell + dev server).
    process.kill(-current.pid, 'SIGTERM')
  } catch {
    current.kill('SIGTERM')
  }
  current = null
}

function start(
  opts: { root: string; command: string },
  onLog: (line: string) => void
): Promise<RunningDevServer> {
  stop() // only one preview server at a time

  return new Promise<RunningDevServer>((resolve, reject) => {
    const child = spawn(opts.command, {
      cwd: opts.root,
      shell: true,
      detached: true, // new process group so we can kill the whole tree
      env: { ...process.env, FORCE_COLOR: '0', BROWSER: 'none' }
    })
    current = child

    let settled = false
    let urlFound: string | null = null
    let tail = ''

    const onData = (buf: Buffer): void => {
      const text = buf.toString()
      tail = (tail + text).slice(-4000)
      for (const line of text.split('\n')) {
        if (line.trim()) onLog(line.trimEnd())
      }
      if (settled || urlFound) return
      const match = text.match(URL_RE)
      if (match) {
        urlFound = normalizeUrl(match[1])
        onLog(`Found ${urlFound} — waiting for it to respond…`)
        void waitForReady(urlFound, () => settled).then((ready) => {
          if (settled) return
          settled = true
          clearTimeout(timer)
          resolve({ url: urlFound!, pid: child.pid! })
          if (!ready) onLog('Server did not respond yet; loading anyway.')
        })
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
      stop()
      reject(new Error(`Timed out waiting for a localhost URL.\n${tail.slice(-600)}`))
    }, 90_000)
  })
}

export function registerDevServerIpc(getWindow: () => BrowserWindow | null): void {
  ipcMain.handle('project:detect', (_e, root: string) => detect(root))

  ipcMain.handle('devserver:start', (_e, opts: { root: string; command: string }) =>
    start(opts, (line) => getWindow()?.webContents.send('devserver:log', line))
  )

  ipcMain.handle('devserver:stop', async () => stop())

  // Never leave a spawned dev server orphaned when dsgn quits.
  app.on('before-quit', stop)
}
