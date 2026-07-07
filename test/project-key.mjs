/**
 * projectKey() unit test (pure — no Electron). The canonical key every
 * multi-project map keys on, so main and renderer dedupe the same repo.
 *
 * Run with: bun run test:projkey
 */
import { projectKey } from '../src/shared/projectKey.ts'

let failed = 0
const eq = (a, b, msg) => {
  if (a !== b) {
    console.error(`FAIL: ${msg} — got ${JSON.stringify(a)}, want ${JSON.stringify(b)}`)
    failed++
  }
}

// Idempotent: keying a key is a no-op.
const p = '/Users/me/dev/app'
eq(projectKey(p), p, 'plain absolute path unchanged')
eq(projectKey(projectKey(p)), projectKey(p), 'idempotent')

// Trailing slashes collapse to one key.
eq(projectKey('/Users/me/dev/app/'), p, 'trailing slash dropped')
eq(projectKey('/Users/me/dev/app///'), p, 'multiple trailing slashes dropped')

// Separators normalized (Windows-style backslashes).
eq(projectKey('C:\\Users\\me\\app'), 'C:/Users/me/app', 'backslashes normalized')

// Whitespace trimmed.
eq(projectKey('  /Users/me/dev/app  '), p, 'surrounding whitespace trimmed')

// Root stays root.
eq(projectKey('/'), '/', 'root preserved')
eq(projectKey('//'), '/', 'double-root collapses')

if (failed) {
  console.error(`PROJECT-KEY FAILED: ${failed} assertion(s)`)
  process.exitCode = 1
} else {
  console.log('PROJECT-KEY OK — canonical, idempotent, separator/slash-normalized')
}
