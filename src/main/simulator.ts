import { app, ipcMain, type BrowserWindow } from 'electron'
import { spawn, execFile, type ChildProcess } from 'child_process'
import { createServer, type Server, type ServerResponse } from 'http'
import { readFile } from 'fs/promises'
import { join } from 'path'
import { promisify } from 'util'
import { xcodeFailureReason, simBuildDestination } from './xcode'
import { findFreePort, stripAnsi } from './devserver-net'
import type { RunningSimulator, SimDevice, SimPreflight } from '../shared/api'

/**
 * iOS-Simulator preview runner — the React Native / Expo counterpart to
 * `devserver.ts`. It boots a simulator, starts Metro + launches the app, and
 * stands up a tiny local "sim bridge": an HTTP server that captures the booted
 * device's screen (via `xcrun simctl io … screenshot`) and serves it as an
 * MJPEG stream behind a one-`<img>` page. The renderer then points the existing
 * preview `WebContentsView` at that page — so the simulator is "just another
 * local URL" and every geometry/load/retry seam is reused unchanged.
 *
 * macOS-only: `preflight()` gates everything and returns a human `reason` (never
 * throws) so a non-Mac host shows a clean card instead of crashing. Frame
 * capture deliberately uses only `xcrun simctl` (ships with Xcode, zero extra
 * install); `idb` is detected for the Phase-2 interaction path but not required.
 */

const execFileP = promisify(execFile)
const HOST = '127.0.0.1'
// Above the web-preview base (7777) so the bridge never contends with a dev server.
const BRIDGE_PORT_BASE = 7800
const MJPEG_BOUNDARY = 'dsgnframe'

// --- the served device page -------------------------------------------------

// Flagged `?dsgnSim=1` (read by src/preview/preload.ts to skip the web overlay).
const PAGE_HTML = `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>Simulator</title>
    <style>
      html, body { margin: 0; height: 100%; background: #fff; }
      body { display: flex; align-items: center; justify-content: center; }
      img { max-width: 100%; max-height: 100%; object-fit: contain; display: block; }
    </style>
  </head>
  <body>
    <img id="screen" src="/stream" alt="iOS Simulator" draggable="false" />
  </body>
</html>`

// A 1×1 white JPEG — the stub frame for the test bridge (exercises the whole
// transport without a real simulator). Not used on the production path.
const STATIC_JPEG = Buffer.from(
  '/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRof' +
    'Hh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAALCAABAAEBAREA/8QAFAAB' +
    'AAAAAAAAAAAAAAAAAAAAAP/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AfwD/2Q==',
  'base64'
)

// --- frame sources ----------------------------------------------------------

/** Pushes JPEG frames to `onFrame` until `stop()`. Swappable (simctl now; idb/recordVideo later). */
interface FrameSource {
  start(onFrame: (jpeg: Buffer) => void, onError: (err: Error) => void): void
  stop(): void
}

/**
 * Poll the booted device with `simctl io … screenshot` at a modest fps. Each
 * capture is a short-lived `xcrun` process writing a JPEG to stdout; we skip
 * ticks while one is in flight so a slow capture can't pile up.
 */
function simctlFrameSource(udid: string, fps = 6): FrameSource {
  let timer: NodeJS.Timeout | null = null
  let stopped = false
  let inflight = false
  return {
    start(onFrame, onError) {
      const tick = (): void => {
        if (stopped || inflight) return
        inflight = true
        execFile(
          'xcrun',
          ['simctl', 'io', udid, 'screenshot', '--type=jpeg', '-'],
          { encoding: 'buffer', maxBuffer: 64 * 1024 * 1024 },
          (err, stdout) => {
            inflight = false
            if (stopped) return
            if (err) onError(err instanceof Error ? err : new Error(String(err)))
            else if (stdout && stdout.length) onFrame(stdout as Buffer)
          }
        )
      }
      timer = setInterval(tick, Math.max(60, Math.round(1000 / fps)))
      tick()
    },
    stop() {
      stopped = true
      if (timer) clearInterval(timer)
      timer = null
    }
  }
}

/** Emits a fixed JPEG on a timer — used only by the test bridge. */
function staticFrameSource(jpeg: Buffer): FrameSource {
  let timer: NodeJS.Timeout | null = null
  return {
    start(onFrame) {
      onFrame(jpeg)
      timer = setInterval(() => onFrame(jpeg), 500)
    },
    stop() {
      if (timer) clearInterval(timer)
      timer = null
    }
  }
}

// --- the bridge HTTP server -------------------------------------------------

interface Bridge {
  server: Server
  /** Resolves when the first real frame is captured (the readiness signal). */
  firstFrame: Promise<void>
  close(): void
}

function writeFrameTo(res: ServerResponse, jpeg: Buffer): void {
  res.write(
    `--${MJPEG_BOUNDARY}\r\nContent-Type: image/jpeg\r\nContent-Length: ${jpeg.length}\r\n\r\n`
  )
  res.write(jpeg)
  res.write('\r\n')
}

function startBridge(source: FrameSource, port: number): Promise<Bridge> {
  return new Promise<Bridge>((resolve, reject) => {
    let latest: Buffer | null = null
    let gotFrame = false
    const clients = new Set<ServerResponse>()

    let resolveFirst!: () => void
    let rejectFirst!: (e: Error) => void
    const firstFrame = new Promise<void>((res, rej) => {
      resolveFirst = res
      rejectFirst = rej
    })
    const firstTimer = setTimeout(() => {
      if (!gotFrame) rejectFirst(new Error('Simulator booted, but no frame was captured.'))
    }, 30_000)

    const onFrame = (jpeg: Buffer): void => {
      latest = jpeg
      if (!gotFrame) {
        gotFrame = true
        clearTimeout(firstTimer)
        resolveFirst()
      }
      for (const res of clients) writeFrameTo(res, jpeg)
    }

    const server = createServer((req, res) => {
      const path = (req.url || '/').split('?')[0]
      if (path === '/') {
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' })
        res.end(PAGE_HTML)
        return
      }
      if (path === '/stream') {
        res.writeHead(200, {
          'Content-Type': `multipart/x-mixed-replace; boundary=${MJPEG_BOUNDARY}`,
          'Cache-Control': 'no-store',
          Pragma: 'no-cache',
          Connection: 'keep-alive'
        })
        clients.add(res)
        if (latest) writeFrameTo(res, latest) // paint the current frame immediately
        req.on('close', () => clients.delete(res))
        return
      }
      res.writeHead(404)
      res.end()
    })

    server.once('error', (err) => {
      clearTimeout(firstTimer)
      reject(err)
    })
    server.listen(port, HOST, () => {
      source.start(onFrame, (err) => {
        if (!gotFrame) {
          clearTimeout(firstTimer)
          rejectFirst(err)
        }
      })
      resolve({
        server,
        firstFrame,
        close: () => {
          clearTimeout(firstTimer)
          source.stop()
          for (const c of clients) c.end()
          clients.clear()
          server.close()
        }
      })
    })
  })
}

// --- preflight --------------------------------------------------------------

const msg = (e: unknown): string => (e instanceof Error ? e.message : String(e))

async function xcrun(args: string[], timeout = 8000): Promise<string> {
  const { stdout } = await execFileP('xcrun', args, { timeout, maxBuffer: 32 * 1024 * 1024 })
  return stdout.toString()
}

interface SimctlRuntime {
  name: string
  identifier: string
  version?: string
  isAvailable?: boolean
}
interface SimctlDevice {
  udid: string
  name: string
  isAvailable?: boolean
  state?: string
}

export async function preflight(): Promise<SimPreflight> {
  const isMac = process.platform === 'darwin'
  const base: SimPreflight = {
    ok: false,
    isMac,
    hasXcode: false,
    hasIdb: false,
    runtimes: [],
    devices: []
  }
  if (!isMac) {
    return {
      ...base,
      reason:
        'Simulator preview is macOS-only — open this React Native / Expo project on a Mac with Xcode.'
    }
  }
  try {
    await xcrun(['simctl', 'help'])
    base.hasXcode = true
  } catch (err) {
    return { ...base, reason: xcodeFailureReason(err) }
  }
  // idb is optional (enables Phase-2 tap/scroll); mirroring works without it.
  try {
    await execFileP('idb', ['--help'], { timeout: 4000 })
    base.hasIdb = true
  } catch {
    base.hasIdb = false
  }
  const runtimeVersions: string[] = []
  try {
    const runtimes = (JSON.parse(await xcrun(['simctl', 'list', 'runtimes', '-j'])).runtimes ??
      []) as SimctlRuntime[]
    const ios = runtimes.filter((r) => r.isAvailable !== false && /iOS/i.test(r.name))
    base.runtimes = ios.map((r) => r.name)
    for (const r of ios) if (r.version) runtimeVersions.push(r.version)

    const devicesByRuntime = (JSON.parse(await xcrun(['simctl', 'list', 'devices', 'available', '-j']))
      .devices ?? {}) as Record<string, SimctlDevice[]>
    const devices: SimDevice[] = []
    for (const [runtime, list] of Object.entries(devicesByRuntime)) {
      if (!/iOS/i.test(runtime)) continue
      for (const d of list) {
        if (d.isAvailable !== false && /iPhone|iPad/i.test(d.name)) {
          devices.push({ udid: d.udid, name: d.name, runtime })
        }
      }
    }
    base.devices = devices
  } catch (err) {
    return { ...base, reason: `Couldn't list simulators: ${msg(err)}` }
  }
  if (base.runtimes.length === 0) {
    return { ...base, reason: 'No iOS runtimes installed. Add one in Xcode → Settings → Platforms.' }
  }
  if (base.devices.length === 0) {
    return {
      ...base,
      reason: 'No iPhone/iPad simulators found. Create one in Xcode → Settings → Platforms.'
    }
  }
  // Devices exist, but a modern Xcode SDK may still refuse them as build
  // destinations if no runtime matches its iOS version — catch that here, before
  // booting + a doomed multi-minute build. The SDK probe is best-effort: if it
  // can't be read, we don't block (simBuildDestination treats null SDK as ok).
  let sdkVersion: string | null = null
  try {
    sdkVersion = (await xcrun(['--sdk', 'iphonesimulator', '--show-sdk-version'])).trim()
  } catch {
    sdkVersion = null
  }
  const buildable = simBuildDestination(sdkVersion, runtimeVersions)
  if (!buildable.ok) {
    return { ...base, reason: buildable.reason }
  }
  return { ...base, ok: true }
}

// --- boot + launch ----------------------------------------------------------

async function bootedUdid(): Promise<string | null> {
  try {
    const byRuntime = (JSON.parse(await xcrun(['simctl', 'list', 'devices', 'booted', '-j'])).devices ??
      {}) as Record<string, SimctlDevice[]>
    for (const list of Object.values(byRuntime)) {
      if (list.length) return list[0].udid
    }
  } catch {
    /* ignore */
  }
  return null
}

async function pickDevice(preferred?: string): Promise<SimDevice> {
  const pf = await preflight()
  if (!pf.ok) throw new Error(pf.reason ?? 'No simulator available.')
  if (preferred) {
    const exact = pf.devices.find((d) => d.udid === preferred)
    if (exact) return exact
  }
  const booted = await bootedUdid()
  if (booted) {
    const found = pf.devices.find((d) => d.udid === booted)
    if (found) return found
  }
  const iphones = pf.devices.filter((d) => /iPhone/i.test(d.name))
  const pool = iphones.length ? iphones : pf.devices
  // Highest runtime identifier ≈ newest iOS version.
  return [...pool].sort((a, b) => a.runtime.localeCompare(b.runtime)).pop()!
}

async function boot(udid: string, onLog: (line: string) => void): Promise<void> {
  onLog(`Booting simulator ${udid}…`)
  try {
    await xcrun(['simctl', 'boot', udid], 60_000)
  } catch (err) {
    // "Unable to boot device in current state: Booted" just means it's already up.
    if (!/current state: Booted/i.test(msg(err))) throw err
  }
  await xcrun(['simctl', 'bootstatus', udid, '-b'], 120_000)
  // Bring the Simulator window up so the user sees it too (capture works headless).
  try {
    await execFileP('open', ['-a', 'Simulator'], { timeout: 8000 })
  } catch {
    /* non-fatal */
  }
}

async function readBundleId(root: string): Promise<string> {
  for (const file of ['app.json', 'app.config.json']) {
    try {
      const j = JSON.parse(await readFile(join(root, file), 'utf8'))
      const id = j?.expo?.ios?.bundleIdentifier ?? j?.ios?.bundleIdentifier
      if (typeof id === 'string') return id
    } catch {
      /* not this file */
    }
  }
  return ''
}

// Markers that mean Metro is up / the app is building or bundling — enough to
// proceed to frame capture (the stream then shows the build/splash progress).
const METRO_READY_RE =
  /(Bundling complete|Bundled .* in \d|Logs for your project|Waiting on|Metro waiting|exp:\/\/|› Press|Opening on)/i
const BUILD_FAIL_RE = /(error: |Build failed|Command .* failed|xcodebuild: error)/i

/** Spawn the dev command (e.g. `expo run:ios`), which builds + installs + launches + serves. */
function spawnMetro(
  opts: { root: string; command: string; udid: string },
  onLog: (line: string) => void
): Promise<{ pid: number }> {
  return new Promise<{ pid: number }>((resolve, reject) => {
    const child: ChildProcess = spawn(opts.command, {
      cwd: opts.root,
      shell: true,
      detached: true, // own process group so stop() can kill the whole tree
      env: { ...process.env, FORCE_COLOR: '0', CI: '1', EXPO_NO_TELEMETRY: '1' }
    })
    let settled = false
    let tail = ''

    const settle = (): void => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      resolve({ pid: child.pid! })
    }

    const onData = (buf: Buffer): void => {
      const text = stripAnsi(buf.toString())
      tail = (tail + text).slice(-4000)
      for (const line of text.split('\n')) if (line.trim()) onLog(line.trimEnd())
      if (settled) return
      if (METRO_READY_RE.test(text)) settle()
      else if (BUILD_FAIL_RE.test(text)) {
        settled = true
        clearTimeout(timer)
        reject(new Error(`The app failed to build/launch.\n${tail.slice(-800)}`))
      }
    }
    child.stdout?.on('data', onData)
    child.stderr?.on('data', onData)
    child.on('error', (err) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      reject(new Error(`Failed to start Metro: ${err.message}`))
    })
    child.on('exit', (code) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      reject(new Error(`Dev process exited (code ${code}) before launching.\n${tail.slice(-800)}`))
    })

    // Native builds can be slow; if we never see a marker, proceed anyway so the
    // stream can show whatever's on screen rather than failing the whole launch.
    const timer = setTimeout(() => {
      if (!settled) {
        onLog('No Metro readiness marker yet — proceeding to capture the screen.')
        settle()
      }
    }, 180_000)
  })
}

// --- lifecycle --------------------------------------------------------------

interface Running {
  metroPid?: number
  bridge: Bridge
  source: FrameSource
  udid?: string
}
let current: Running | null = null

function stop(): void {
  if (!current) return
  const c = current
  current = null
  try {
    c.bridge.close()
  } catch {
    /* ignore */
  }
  if (c.metroPid) {
    try {
      process.kill(-c.metroPid, 'SIGTERM') // whole process group
    } catch {
      try {
        process.kill(c.metroPid, 'SIGTERM')
      } catch {
        /* already gone */
      }
    }
  }
  // The simulator is left booted for fast re-open (cheap; user can quit it).
}

async function start(
  opts: { root: string; command?: string; udid?: string },
  onLog: (line: string) => void
): Promise<RunningSimulator> {
  stop()
  const device = await pickDevice(opts.udid)
  onLog(`Using ${device.name} · ${device.runtime}`)
  await boot(device.udid, onLog)

  const command = opts.command?.trim() || 'npx expo run:ios'
  onLog(`Launching app: ${command}`)
  const { pid } = await spawnMetro({ root: opts.root, command, udid: device.udid }, onLog)
  const bundleId = await readBundleId(opts.root)

  const port = await findFreePort(BRIDGE_PORT_BASE)
  const source = simctlFrameSource(device.udid)
  const bridge = await startBridge(source, port)
  current = { metroPid: pid, bridge, source, udid: device.udid }
  try {
    await bridge.firstFrame // readiness: a real frame rendered
  } catch (err) {
    stop()
    throw err
  }
  const url = `http://${HOST}:${port}/?dsgnSim=1`
  onLog(`Simulator preview ready at ${url}`)
  return { url, pid, udid: device.udid, bundleId, previewKind: 'simulator' }
}

/** Test-only: stand up the bridge with a static stub frame (no simulator needed). */
async function startTestBridge(): Promise<{ url: string }> {
  stop()
  const port = await findFreePort(BRIDGE_PORT_BASE)
  const source = staticFrameSource(STATIC_JPEG)
  const bridge = await startBridge(source, port)
  await bridge.firstFrame
  current = { bridge, source }
  return { url: `http://${HOST}:${port}/?dsgnSim=1` }
}

export function registerSimulatorIpc(getWindow: () => BrowserWindow | null): void {
  const log = (line: string): void => {
    getWindow()?.webContents.send('simulator:log', line)
  }
  ipcMain.handle('simulator:preflight', () => preflight())
  ipcMain.handle('simulator:start', (_e, opts: { root: string; command?: string; udid?: string }) =>
    start(opts, log)
  )
  ipcMain.handle('simulator:stop', async () => stop())

  // Test-only hook (sim-frame.mjs) — exercises the bridge → MJPEG → WebContentsView
  // transport with a stub frame, off-macOS. Reached via `app.evaluate` in the test
  // harness, not exposed on the renderer API.
  ;(globalThis as { __dsgnStartTestBridge?: () => Promise<{ url: string }> }).__dsgnStartTestBridge =
    startTestBridge

  app.on('before-quit', stop)
}
