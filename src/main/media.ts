import { createHash } from 'crypto'

/**
 * The editor's media capabilities, legacy (rollback) owner. The native source editor
 * shows a project's image / video / audio file by path (AppKit decodes it), so the
 * editor state carries an opaque `trezi-media://f/<token>` URL and only trusted native
 * code turns it back into the path main registered.
 *
 * Under the Swift launch the service's platform owner issues these grants instead
 * (random tokens bound to the source editor, the file's size, identity and hash, and
 * an expiry; see `platform-owner.ts`). The `trezi-media` scheme handler that streamed
 * files to a web renderer is retired with Electron: no WebKit view registers the scheme,
 * so nothing serves file bytes by token.
 */

export const MEDIA_SCHEME = 'trezi-media'

/**
 * token → absolute path. Bounded (LRU-ish by insertion order): the editor opens
 * one file at a time, so this only ever holds the recent history.
 */
const files = new Map<string, string>()
const MAX_TOKENS = 500

/**
 * Register `absPath` and return the URL for it. The token is a hash of the path, so
 * re-opening a file reuses its URL.
 */
export function mediaUrl(absPath: string): string {
  const token = createHash('sha1').update(absPath).digest('hex').slice(0, 24)
  files.delete(token)
  files.set(token, absPath)
  while (files.size > MAX_TOKENS) {
    const oldest = files.keys().next().value
    if (oldest === undefined) break
    files.delete(oldest)
  }
  return `${MEDIA_SCHEME}://f/${token}`
}

/** Trusted native UI only: resolve an already-issued opaque media capability. */
export function nativeMediaPath(url: string): string | undefined {
  try { const parsed = new URL(url); return [`${MEDIA_SCHEME}:`, 'praxis-media:'].includes(parsed.protocol) && parsed.hostname === 'f' ? files.get(parsed.pathname.slice(1)) : undefined } catch { return undefined }
}
