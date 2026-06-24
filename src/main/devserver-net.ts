import type { Framework } from '../shared/api'

/**
 * Pure networking helpers for the dev-server runner (no electron/child_process —
 * so they're unit-testable). Cover URL parsing, IPv4/IPv6 reachability, and
 * detecting an already-running dev server to attach to.
 */

export const URL_RE = /(https?:\/\/(?:localhost|127\.0\.0\.1|0\.0\.0\.0)(?::\d+)?[^\s)]*)/i

export function normalizeUrl(raw: string): string {
  return raw.replace('0.0.0.0', 'localhost').replace(/[.,)]*$/, '').replace(/\/$/, '')
}

const delay = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms))

/** GET the URL with a timeout; returns the HTTP status, or null if unreachable. */
export async function probe(url: string, ms = 1500): Promise<number | null> {
  const ctrl = new AbortController()
  const t = setTimeout(() => ctrl.abort(), ms)
  try {
    const res = await fetch(url, { redirect: 'manual', signal: ctrl.signal })
    return res.status
  } catch {
    return null
  } finally {
    clearTimeout(t)
  }
}

/**
 * Loopback host variants for a localhost-ish URL, preferring IPv4. A dev server
 * that binds to `localhost` can end up IPv6-only (`[::1]`) while the preview
 * resolves `localhost` to IPv4 (`127.0.0.1`) — so we try the concrete hosts and
 * use whichever actually answers, instead of trusting `localhost`.
 */
export function hostVariants(url: string): string[] {
  const m = /^(https?:\/\/)(\[[^\]]+\]|[^/:]+)(:\d+)?(\/.*)?$/.exec(url)
  if (!m) return [url]
  const [, proto, host, port = '', path = ''] = m
  if (!['localhost', '127.0.0.1', '0.0.0.0', '[::1]', '::1'].includes(host)) return [url]
  const build = (h: string): string => `${proto}${h}${port}${path}`.replace(/\/$/, '')
  return [build('127.0.0.1'), build('localhost'), build('[::1]')]
}

/** Poll the candidate URLs until one answers; returns the reachable one (or null). */
export async function waitForReachable(
  urls: string[],
  isSettled: () => boolean
): Promise<string | null> {
  for (let i = 0; i < 120; i++) {
    if (isSettled()) return null
    for (const u of urls) {
      if (isSettled()) return null
      if ((await probe(u)) != null) return u
    }
    await delay(500)
  }
  return null
}

/**
 * Ports a framework's dev server is most likely already serving on. Only known
 * frameworks have a meaningful default — for 'unknown' we don't guess (avoids
 * attaching to an unrelated app that happens to hold 5173/3000).
 */
export function defaultPorts(framework?: Framework): number[] {
  switch (framework) {
    case 'next':
    case 'cra':
      return [3000]
    case 'sveltekit':
    case 'vite':
      return [5173]
    default:
      return []
  }
}

const rendererPort = ((): string => {
  try {
    return process.env.ELECTRON_RENDERER_URL ? new URL(process.env.ELECTRON_RENDERER_URL).port : ''
  } catch {
    return ''
  }
})()

/**
 * If the user already runs this project's dev server, find it so we can attach
 * instead of spawning a competitor — two dev servers on one project clash (e.g.
 * over SvelteKit's .svelte-kit/) and the duplicate errors. We only attach to a
 * HEALTHY server (status < 400), and never to dsgn's own renderer.
 */
export async function findRunningServer(
  framework?: Framework,
  probeFn: (url: string, ms?: number) => Promise<number | null> = probe
): Promise<string | null> {
  for (const port of defaultPorts(framework)) {
    if (String(port) === rendererPort) continue
    for (const host of ['127.0.0.1', '[::1]']) {
      const status = await probeFn(`http://${host}:${port}`, 1000)
      if (status != null && status < 400) return `http://${host}:${port}`
    }
  }
  return null
}
