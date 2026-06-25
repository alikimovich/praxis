/**
 * Canonical identity for an open project, derived from its absolute root path.
 *
 * Every multi-project map (dev servers, agent sessions, preview state, the
 * renderer workspace) keys on this so main and the renderer agree on "which
 * project" without a filesystem round-trip. Kept pure + string-only (no node
 * `path`, no `process`) so it's safe to import from any process.
 *
 * Normalizes separators and trailing slashes and is idempotent. It does NOT
 * resolve `..` or symlinks — the open-dialog already hands back a resolved
 * absolute path, so string canonicalization is enough to dedupe the same repo
 * opened twice.
 */
export function projectKey(root: string): string {
  const k = root.trim().replace(/\\/g, '/').replace(/\/+$/, '')
  return k === '' ? '/' : k
}
