import { access } from 'node:fs/promises'

/**
 * Pure helpers for "Code mode" (editor.ts) — no `electron` import, so this
 * module loads under plain bun/node for unit tests (see devserver-net.ts for
 * the same split on the preview side). Anything that touches `app.getPath`,
 * spawns code-server, or hits the network for the tarball lives in editor.ts
 * instead.
 */

// Pinned build (code-server 4.127.0 == VS Code 1.127.0, MIT). Bump this and
// editor.ts's CODE_SERVER_SHA256 together if the pin ever moves.
export const CODE_SERVER_VERSION = '4.127.0'

/** Map a platform/arch pair to code-server's `<platform>-<arch>` asset suffix,
 *  or null when we don't ship a build for it. Defaults to the current host;
 *  parameters exist so tests can probe every platform/arch combo without
 *  monkey-patching `process`. */
export function assetPlatformArch(
  platform: string = process.platform,
  arch: string = process.arch
): { platform: string; arch: string } | null {
  const p = platform === 'darwin' ? 'macos' : platform === 'linux' ? 'linux' : null
  if (!p) return null
  const a = arch === 'arm64' ? 'arm64' : arch === 'x64' ? 'amd64' : null
  if (!a) return null
  return { platform: p, arch: a }
}

/** Full `code-server-<version>-<platform>-<arch>` release/vendor dir name, or
 *  null for an unsupported platform/arch. */
export function assetDirName(
  platform: string = process.platform,
  arch: string = process.arch
): string | null {
  const pa = assetPlatformArch(platform, arch)
  if (!pa) return null
  return `code-server-${CODE_SERVER_VERSION}-${pa.platform}-${pa.arch}`
}

/** Per-project workspace URL against the single server. `root` is
 *  encodeURIComponent'd — it can contain spaces/unicode/anything a real
 *  filesystem path allows. */
export function urlFor(host: string, port: number, root: string): string {
  return `http://${host}:${port}/?folder=${encodeURIComponent(root)}`
}

export async function exists(path: string): Promise<boolean> {
  try {
    await access(path)
    return true
  } catch {
    return false
  }
}

/** DSGN_CODE_SERVER_BIN override: takes precedence over the vendored/download
 *  path whenever set. Returns null when unset (caller falls through to the
 *  vendored path); throws when set but the path doesn't exist — an explicit
 *  override that's wrong should fail loudly, not silently re-download. */
export async function resolveOverride(
  env: NodeJS.ProcessEnv = process.env
): Promise<string | null> {
  const override = env.DSGN_CODE_SERVER_BIN
  if (!override) return null
  if (!(await exists(override))) {
    throw new Error(`DSGN_CODE_SERVER_BIN does not exist: ${override}`)
  }
  return override
}
