/**
 * Unit test for "Code mode"'s pure helpers (no Electron, no network, no real
 * code-server) — src/main/editor-net.ts. editor.ts itself imports `electron`
 * at module scope, which only resolves inside a real Electron process (under
 * plain bun it's a path string, not `{ app, ipcMain }`), so the testable
 * surface is split out exactly like devserver.ts/devserver-net.ts. See
 * editor.ts's file-header comment for the split rationale.
 *
 * Run with: bun run test:editor-url
 */
import assert from 'node:assert'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  assetDirName,
  assetPlatformArch,
  CODE_SERVER_VERSION,
  resolveOverride,
  urlFor
} from '../src/main/editor-net.ts'

// ── urlFor: `?folder=` encoding ──────────────────────────────────────────────

assert.equal(
  urlFor('127.0.0.1', 8888, '/Users/me/app'),
  'http://127.0.0.1:8888/?folder=%2FUsers%2Fme%2Fapp',
  'plain absolute path'
)

// Spaces must not survive as literal spaces (a raw space in a URL is invalid
// and would truncate the query string in some HTTP clients).
assert.equal(
  urlFor('127.0.0.1', 8888, '/Users/me/my app'),
  'http://127.0.0.1:8888/?folder=%2FUsers%2Fme%2Fmy%20app',
  'space encoded as %20'
)

// Unicode roots (a project directory named in, say, Cyrillic or with combining
// marks) must round-trip through encodeURIComponent, not get mangled/dropped.
const unicodeRoot = '/Users/me/приложение/café'
const unicodeUrl = urlFor('127.0.0.1', 8888, unicodeRoot)
assert.equal(
  unicodeUrl,
  `http://127.0.0.1:8888/?folder=${encodeURIComponent(unicodeRoot)}`,
  'unicode root encoded'
)
assert.equal(
  decodeURIComponent(new URL(unicodeUrl).searchParams.get('folder')),
  unicodeRoot,
  'unicode root round-trips through decode'
)

// Reserved URL characters in a path (&, #, ?, %) must not leak through and
// corrupt the query string.
const trickyRoot = '/Users/me/a&b#c?d%e'
const trickyUrl = urlFor('127.0.0.1', 8888, trickyRoot)
assert.equal(new URL(trickyUrl).searchParams.get('folder'), trickyRoot, 'reserved chars round-trip')

// Host/port are interpolated verbatim (not encoded) — they come from our own
// port allocator, never user input.
assert.equal(
  urlFor('127.0.0.1', 12345, '/x'),
  'http://127.0.0.1:12345/?folder=%2Fx',
  'port interpolated'
)

// ── assetPlatformArch / assetDirName: platform/arch → release asset name ───

assert.deepEqual(
  assetPlatformArch('darwin', 'arm64'),
  { platform: 'macos', arch: 'arm64' },
  'darwin/arm64'
)
assert.deepEqual(
  assetPlatformArch('darwin', 'x64'),
  { platform: 'macos', arch: 'amd64' },
  'darwin/x64'
)
assert.deepEqual(
  assetPlatformArch('linux', 'arm64'),
  { platform: 'linux', arch: 'arm64' },
  'linux/arm64'
)
assert.deepEqual(
  assetPlatformArch('linux', 'x64'),
  { platform: 'linux', arch: 'amd64' },
  'linux/x64'
)

// Unsupported platform/arch → null (the caller turns this into an
// 'unsupported platform' status, never a crash).
assert.equal(assetPlatformArch('win32', 'x64'), null, 'win32 unsupported')
assert.equal(assetPlatformArch('darwin', 'ia32'), null, 'ia32 unsupported')
assert.equal(assetPlatformArch('freebsd', 'arm64'), null, 'freebsd unsupported')

for (const [platform, arch, want] of [
  ['darwin', 'arm64', `code-server-${CODE_SERVER_VERSION}-macos-arm64`],
  ['darwin', 'x64', `code-server-${CODE_SERVER_VERSION}-macos-amd64`],
  ['linux', 'arm64', `code-server-${CODE_SERVER_VERSION}-linux-arm64`],
  ['linux', 'x64', `code-server-${CODE_SERVER_VERSION}-linux-amd64`]
]) {
  assert.equal(assetDirName(platform, arch), want, `assetDirName(${platform}, ${arch})`)
}
assert.equal(assetDirName('win32', 'x64'), null, 'assetDirName unsupported platform → null')

// Defaults to the CURRENT host when called with no args (what editor.ts's
// call sites actually rely on).
assert.deepEqual(
  assetPlatformArch(),
  assetPlatformArch(process.platform, process.arch),
  'no-arg call defaults to process.platform/arch'
)

// ── resolveOverride: DSGN_CODE_SERVER_BIN precedence ─────────────────────────

// Unset → null (falls through to the vendored/download path).
assert.equal(await resolveOverride({}), null, 'no env var → null')
assert.equal(await resolveOverride({ DSGN_CODE_SERVER_BIN: '' }), null, 'empty env var → null')

// Set + missing → throws (an explicit-but-wrong override fails loudly rather
// than silently falling back to a download).
const missingPath = join(mkdtempSync(join(tmpdir(), 'dsgn-editor-url-')), 'does-not-exist')
await assert.rejects(
  () => resolveOverride({ DSGN_CODE_SERVER_BIN: missingPath }),
  /DSGN_CODE_SERVER_BIN does not exist/,
  'missing override path throws'
)

// Set + exists → wins outright, returned verbatim (precedence over vendored
// path/download — this test never touches the network).
const scratch = mkdtempSync(join(tmpdir(), 'dsgn-editor-url-'))
const realBin = join(scratch, 'fake-code-server')
writeFileSync(realBin, '#!/bin/sh\necho fake\n')
try {
  assert.equal(
    await resolveOverride({ DSGN_CODE_SERVER_BIN: realBin }),
    realBin,
    'existing override path returned verbatim'
  )
} finally {
  rmSync(scratch, { recursive: true, force: true })
}

console.log(
  'EDITOR-URL OK — urlFor encoding, asset-name mapping, and DSGN_CODE_SERVER_BIN precedence all correct'
)
