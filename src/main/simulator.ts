import { app, ipcMain, type BrowserWindow } from 'electron'
import { spawn, execFile, type ChildProcess } from 'child_process'
import { createServer, type Server, type ServerResponse } from 'http'
import { readFile, unlink } from 'fs/promises'
import { join } from 'path'
import { tmpdir } from 'os'
import { promisify } from 'util'
import { xcodeFailureReason, simBuildDestination, extractBuildError } from './xcode'
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
// Phase 2: when `interactive`, the page captures tap/swipe/scroll/type on the
// <img>, converts to a 0..1 fraction of the device content (object-fit:contain
// aware), and POSTs to /control — which idb replays on the device.
function pageHtml(interactive: boolean): string {
  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>Simulator</title>
    <style>
      html, body { margin: 0; height: 100%; background: #fff; }
      body { display: flex; align-items: center; justify-content: center; }
      img { max-width: 100%; max-height: 100%; object-fit: contain; display: block; -webkit-user-select: none; }
      #hint { position: fixed; bottom: 8px; left: 50%; transform: translateX(-50%);
        font: 11px -apple-system, system-ui, sans-serif; color: #666; background: rgba(255,255,255,.85);
        border: 1px solid #eee; border-radius: 6px; padding: 3px 8px; pointer-events: none; }
    </style>
  </head>
  <body>
    <img id="screen" src="/stream" alt="iOS Simulator" draggable="false" tabindex="0" />
    ${interactive ? '' : '<div id="hint">View-only — install <code>idb</code> for tap &amp; type</div>'}
    <script>
      var INTERACTIVE = ${interactive ? 'true' : 'false'};
      var img = document.getElementById('screen');
      function post(cmd) {
        if (!INTERACTIVE) return;
        fetch('/control', { method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(cmd) }).catch(function(){});
      }
      // Pixel position on the displayed content → 0..1 fraction (handles the
      // object-fit:contain letterbox), or null when the click is on the letterbox.
      function frac(clientX, clientY) {
        var r = img.getBoundingClientRect();
        var natW = img.naturalWidth || r.width, natH = img.naturalHeight || r.height;
        var scale = Math.min(r.width / natW, r.height / natH);
        var cW = natW * scale, cH = natH * scale;
        var ox = r.left + (r.width - cW) / 2, oy = r.top + (r.height - cH) / 2;
        var x = (clientX - ox) / cW, y = (clientY - oy) / cH;
        if (x < 0 || x > 1 || y < 0 || y > 1) return null;
        return { x: x, y: y };
      }
      var down = null;
      img.addEventListener('pointerdown', function (e) {
        down = frac(e.clientX, e.clientY); img.focus();
      });
      img.addEventListener('pointerup', function (e) {
        if (!down) { down = null; return; }
        var up = frac(e.clientX, e.clientY) || down;
        var dx = up.x - down.x, dy = up.y - down.y;
        if (Math.abs(dx) + Math.abs(dy) > 0.03) {
          post({ type: 'swipe', x: down.x, y: down.y, x2: up.x, y2: up.y });
        } else {
          post({ type: 'tap', x: up.x, y: up.y });
        }
        down = null;
      });
      // Wheel → a short swipe in the opposite direction (natural scroll).
      img.addEventListener('wheel', function (e) {
        var f = frac(e.clientX, e.clientY); if (!f) return;
        e.preventDefault();
        var dy = Math.max(-0.4, Math.min(0.4, -e.deltaY / 600));
        var dx = Math.max(-0.4, Math.min(0.4, -e.deltaX / 600));
        post({ type: 'swipe', x: f.x, y: f.y, x2: f.x + dx, y2: f.y + dy, duration: 0.1 });
      }, { passive: false });
      // Printable keystrokes → text input on the focused field.
      img.addEventListener('keydown', function (e) {
        if (e.metaKey || e.ctrlKey || e.altKey) return;
        if (e.key && e.key.length === 1) { post({ type: 'text', text: e.key }); e.preventDefault(); }
      });
    </script>
  </body>
</html>`
}

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
 * capture is a short-lived `xcrun` process writing a JPEG to a temp file, which
 * we then read back; we skip ticks while one is in flight so a slow capture
 * can't pile up.
 *
 * We capture to a real file rather than `screenshot -` (stdout): some `simctl`
 * versions treat `-` as a literal *filename* and write nothing to stdout, so the
 * stream would never receive a frame and the bridge would time out with
 * "Simulator booted, but no frame was captured." The temp-file path is the one
 * form that behaves the same across Xcode versions.
 */
function simctlFrameSource(udid: string, fps = 6): FrameSource {
  let timer: NodeJS.Timeout | null = null
  let stopped = false
  let inflight = false
  // One reused scratch file per source; `-${process.pid}` keeps concurrent dsgn
  // instances from clobbering each other's frame.
  const file = join(tmpdir(), `dsgn-sim-${udid}-${process.pid}.jpg`)
  return {
    start(onFrame, onError) {
      const fail = (err: unknown): void => {
        inflight = false
        if (!stopped) onError(err instanceof Error ? err : new Error(String(err)))
      }
      const tick = (): void => {
        if (stopped || inflight) return
        inflight = true
        execFile('xcrun', ['simctl', 'io', udid, 'screenshot', '--type=jpeg', file], (err) => {
          if (err) return fail(err)
          readFile(file).then((buf) => {
            inflight = false
            if (!stopped && buf.length) onFrame(buf)
          }, fail)
        })
      }
      timer = setInterval(tick, Math.max(60, Math.round(1000 / fps)))
      tick()
    },
    stop() {
      stopped = true
      if (timer) clearInterval(timer)
      timer = null
      void unlink(file).catch(() => {})
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

// --- input control (Phase 2: tap / scroll / type via idb) -------------------

/** A control command from the bridge page. Coords are FRACTIONS (0..1) of the
 * device content, so the page never needs to know the device's resolution. */
export type ControlCommand =
  | { type: 'tap'; x: number; y: number }
  | { type: 'swipe'; x: number; y: number; x2: number; y2: number; duration?: number }
  | { type: 'text'; text: string }

/** Forwards control commands to the device. `idbController` uses idb; when idb is
 * absent the bridge has no controller and the device stays view-only (degraded). */
interface Controller {
  send(cmd: ControlCommand): Promise<void>
}

const clamp01 = (n: number): number => (n < 0 ? 0 : n > 1 ? 1 : n)

/** Map a 0..1 fraction of the device content to idb point coordinates. */
export function fractionToPoints(
  fx: number,
  fy: number,
  dims: { width: number; height: number }
): { x: number; y: number } {
  return { x: Math.round(clamp01(fx) * dims.width), y: Math.round(clamp01(fy) * dims.height) }
}

/** Device point dimensions from `idb describe --json` (pixels ÷ density). */
async function idbScreenPoints(udid: string): Promise<{ width: number; height: number }> {
  const { stdout } = await execFileP('idb', ['describe', '--udid', udid, '--json'], {
    timeout: 8000
  })
  const d = JSON.parse(stdout.toString()) as {
    screen_dimensions?: { width?: number; height?: number; density?: number }
  }
  const s = d.screen_dimensions ?? {}
  const density = s.density && s.density > 0 ? s.density : 1
  const width = Math.round((s.width ?? 390 * density) / density)
  const height = Math.round((s.height ?? 844 * density) / density)
  return { width, height }
}

function idbController(udid: string): Controller {
  let dims: { width: number; height: number } | null = null
  const idb = (args: string[]): Promise<unknown> =>
    execFileP('idb', ['--udid', udid, ...args], { timeout: 10_000 })
  return {
    async send(cmd) {
      if (!dims) dims = await idbScreenPoints(udid)
      if (cmd.type === 'tap') {
        const p = fractionToPoints(cmd.x, cmd.y, dims)
        await idb(['ui', 'tap', String(p.x), String(p.y)])
      } else if (cmd.type === 'swipe') {
        const a = fractionToPoints(cmd.x, cmd.y, dims)
        const b = fractionToPoints(cmd.x2, cmd.y2, dims)
        await idb([
          'ui', 'swipe', String(a.x), String(a.y), String(b.x), String(b.y),
          '--duration', String(cmd.duration ?? 0.25)
        ])
      } else if (cmd.type === 'text') {
        // Bounded so a flood of keystrokes can't spawn a huge arg.
        await idb(['ui', 'text', cmd.text.slice(0, 500)])
      }
    }
  }
}

/** Validate + normalize an untrusted /control body into a ControlCommand. */
export function parseControlCommand(body: unknown): ControlCommand | null {
  const b = body as Record<string, unknown>
  const num = (v: unknown): number | null => (typeof v === 'number' && isFinite(v) ? v : null)
  if (b?.type === 'tap') {
    const x = num(b.x)
    const y = num(b.y)
    return x != null && y != null ? { type: 'tap', x, y } : null
  }
  if (b?.type === 'swipe') {
    const [x, y, x2, y2] = [b.x, b.y, b.x2, b.y2].map(num)
    if (x != null && y != null && x2 != null && y2 != null) {
      const d = num(b.duration)
      return { type: 'swipe', x, y, x2, y2, ...(d != null ? { duration: d } : {}) }
    }
    return null
  }
  if (b?.type === 'text' && typeof b.text === 'string') {
    return { type: 'text', text: b.text }
  }
  return null
}

// --- element select (Phase 3: tap → idb hit-test → RN source) ----------------

/** A `testID` stamped by the dsgn RN Babel plugin → the source location it maps
 * to. `dsgn:path:line:col` → `path:line:col`, else null. */
export function parseTestId(testId: unknown): { source: string } | null {
  if (typeof testId !== 'string' || !testId.startsWith('dsgn:')) return null
  const source = testId.slice('dsgn:'.length)
  // Shape-check: relpath:line[:col] — refuse anything that isn't a stamp.
  return /^[\w./@-]+:\d+(:\d+)?$/.test(source) ? { source } : null
}

/** Find the first dsgn `testID` stamp anywhere in an idb accessibility node
 * (idb surfaces it under varying keys — AXUniqueId / AXIdentifier / identifier). */
export function findDsgnStamp(node: unknown, depth = 0): string | null {
  if (depth > 6 || node == null) return null
  if (typeof node === 'string') return node.startsWith('dsgn:') ? node : null
  if (Array.isArray(node)) {
    for (const v of node) {
      const f = findDsgnStamp(v, depth + 1)
      if (f) return f
    }
    return null
  }
  if (typeof node === 'object') {
    for (const v of Object.values(node as Record<string, unknown>)) {
      const f = findDsgnStamp(v, depth + 1)
      if (f) return f
    }
  }
  return null
}

/** A picked simulator element (the RN analog of a web SelectedElement pick). */
export interface SimPick {
  source: string
  tag: string
}

/** idb view-hierarchy hit-test: the dsgn-stamped element at a 0..1 device point.
 * Device-gated (needs idb + a booted app); returns null when nothing is stamped. */
async function idbHitTest(udid: string, fx: number, fy: number): Promise<SimPick | null> {
  const dims = await idbScreenPoints(udid)
  const p = fractionToPoints(fx, fy, dims)
  const { stdout } = await execFileP(
    'idb',
    ['ui', 'describe-point', '--udid', udid, '--json', String(p.x), String(p.y)],
    { timeout: 8000 }
  )
  const node = JSON.parse(stdout.toString()) as Record<string, unknown>
  const stamp = findDsgnStamp(node)
  const parsed = stamp ? parseTestId(stamp) : null
  if (!parsed) return null
  const tag = typeof node.type === 'string' ? node.type : 'element'
  return { source: parsed.source, tag }
}

/**
 * The interaction surface attached to a running bridge (Phase 2 control + Phase 3
 * select). Present iff idb is installed; otherwise the device is view-only.
 */
interface Interaction {
  send: (cmd: ControlCommand) => Promise<void>
  isSelectMode: () => boolean
  /** Handle a tap while in select mode (hit-test + emit the pick to the renderer). */
  onSelectTap: (fx: number, fy: number) => void
}

// Set by the renderer's Select toggle (sim path); read by the live interaction.
let simSelectMode = false
// The window to emit picks to, set in registerSimulatorIpc.
let getWin: () => BrowserWindow | null = () => null

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

function startBridge(
  source: FrameSource,
  port: number,
  interaction: Interaction | null
): Promise<Bridge> {
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
      // The bridge binds to 127.0.0.1 only; allow the renderer (a different origin)
      // to reach /control. A text/plain body keeps the POST a "simple" request
      // (no CORS preflight); the handler JSON-parses regardless of content type.
      res.setHeader('Access-Control-Allow-Origin', '*')
      const path = (req.url || '/').split('?')[0]
      if (path === '/') {
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' })
        res.end(pageHtml(interaction != null))
        return
      }
      // Phase 2: replay a tap/swipe/type on the device (bounded body). Without a
      // controller (no idb) the device is view-only → report it, don't error.
      if (path === '/control' && req.method === 'POST') {
        let raw = ''
        let tooBig = false
        req.on('data', (c) => {
          raw += c
          if (raw.length > 4096) {
            tooBig = true
            req.destroy()
          }
        })
        req.on('end', () => {
          if (tooBig) return
          const ok = (extra: object): void => {
            res.writeHead(200, { 'Content-Type': 'application/json' })
            res.end(JSON.stringify(extra))
          }
          if (!interaction) {
            ok({ degraded: true })
            return
          }
          let cmd: ControlCommand | null = null
          try {
            cmd = parseControlCommand(JSON.parse(raw))
          } catch {
            cmd = null
          }
          if (!cmd) {
            res.writeHead(400)
            res.end()
            return
          }
          // A tap in select mode is an element pick (hit-test), not a tap-through.
          if (cmd.type === 'tap' && interaction.isSelectMode()) {
            interaction.onSelectTap(cmd.x, cmd.y)
            ok({ selected: true })
            return
          }
          interaction
            .send(cmd)
            .then(() => ok({ ok: true }))
            .catch((err) => ok({ ok: false, error: msg(err) }))
        })
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
      tail = (tail + text).slice(-8000)
      for (const line of text.split('\n')) if (line.trim()) onLog(line.trimEnd())
      if (settled) return
      if (METRO_READY_RE.test(text)) settle()
      else if (BUILD_FAIL_RE.test(text)) {
        settled = true
        clearTimeout(timer)
        reject(new Error(`The app failed to build/launch.\n${extractBuildError(tail)}`))
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
      reject(
        new Error(`Dev process exited (code ${code}) before launching.\n${extractBuildError(tail)}`)
      )
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
  // Phase 2/3: interaction (tap/scroll/type + element-select) iff idb is installed.
  let interaction: Interaction | null = null
  try {
    await execFileP('idb', ['--help'], { timeout: 4000 })
    const controller = idbController(device.udid)
    interaction = {
      send: (cmd) => controller.send(cmd),
      isSelectMode: () => simSelectMode,
      onSelectTap: (fx, fy) => {
        void idbHitTest(device.udid, fx, fy)
          .then((pick) => {
            if (pick) getWin()?.webContents.send('simulator:element-picked', pick)
          })
          .catch(() => {})
      }
    }
    onLog('idb detected — tap / scroll / type + element-select enabled.')
  } catch {
    onLog('idb not found — preview is view-only (install idb to interact).')
  }
  const bridge = await startBridge(source, port, interaction)
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

// What a test bridge received (for sim-control.mjs / sim-select.mjs assertions).
let testRecorded: ControlCommand[] = []
let testPicks: SimPick[] = []
// A fixed pick the recording interaction emits for a select-mode tap (stands in
// for the device-gated idb hit-test).
const TEST_PICK: SimPick = { source: 'src/App.tsx:10:4', tag: 'View' }

/** Test-only: stand up the bridge with a static stub frame (no simulator needed).
 * `interactive` attaches a RECORDING interaction (Phase-2 transport + Phase-3
 * select routing) instead of the idb-backed one. */
async function startTestBridge(interactive = false): Promise<{ url: string }> {
  stop()
  testRecorded = []
  testPicks = []
  const port = await findFreePort(BRIDGE_PORT_BASE)
  const source = staticFrameSource(STATIC_JPEG)
  const interaction: Interaction | null = interactive
    ? {
        send: async (cmd) => {
          testRecorded.push(cmd)
        },
        isSelectMode: () => simSelectMode,
        onSelectTap: () => {
          testPicks.push(TEST_PICK)
          getWin()?.webContents.send('simulator:element-picked', TEST_PICK)
        }
      }
    : null
  const bridge = await startBridge(source, port, interaction)
  await bridge.firstFrame
  current = { bridge, source }
  return { url: `http://${HOST}:${port}/?dsgnSim=1` }
}

export function registerSimulatorIpc(getWindow: () => BrowserWindow | null): void {
  getWin = getWindow
  const log = (line: string): void => {
    getWindow()?.webContents.send('simulator:log', line)
  }
  ipcMain.handle('simulator:preflight', () => preflight())
  ipcMain.handle('simulator:start', (_e, opts: { root: string; command?: string; udid?: string }) =>
    start(opts, log)
  )
  ipcMain.handle('simulator:stop', async () => stop())
  // Phase 3: arm/disarm element-select for the sim (a tap then becomes a pick).
  ipcMain.handle('simulator:set-select-mode', (_e, active: boolean) => {
    simSelectMode = !!active
  })

  // Test-only hooks — exercise the bridge transport + Phase-2 control + Phase-3
  // select routing off-macOS. Reached via `app.evaluate`, not the renderer API.
  const g = globalThis as {
    __dsgnStartTestBridge?: (interactive?: boolean) => Promise<{ url: string }>
    __dsgnTestControl?: () => ControlCommand[]
    __dsgnTestPicks?: () => SimPick[]
    __dsgnSimMap?: {
      fractionToPoints: typeof fractionToPoints
      parseControlCommand: typeof parseControlCommand
      parseTestId: typeof parseTestId
      findDsgnStamp: typeof findDsgnStamp
    }
  }
  g.__dsgnStartTestBridge = startTestBridge
  g.__dsgnTestControl = () => testRecorded
  g.__dsgnTestPicks = () => testPicks
  g.__dsgnSimMap = { fractionToPoints, parseControlCommand, parseTestId, findDsgnStamp }

  app.on('before-quit', stop)
}
