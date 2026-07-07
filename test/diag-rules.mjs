/**
 * Unit test for the rule-based failure matcher (no electron). Run via bun:
 *   bun run test:diag-rules
 */
import assert from 'node:assert'
import { matchKnownError } from '../src/main/diag-rules.ts'

// The broken-node build failure (stale Homebrew keg pinned in .xcode.env.local).
const NODE_FAIL = [
  'Node found at: /opt/homebrew/Cellar/node/24.5.0/bin/node',
  'dyld[24703]: Library not loaded: /opt/homebrew/opt/simdjson/lib/libsimdjson.26.dylib',
  'Script-46EB2.sh: line 9: 24703 Abort trap: 6',
  'Command PhaseScriptExecution failed with a nonzero exit code'
].join('\n')

const m = matchKnownError(NODE_FAIL)
assert.ok(m, 'broken-node log should match a rule')
assert.match(m.summary, /Node binary/i, 'summary names the node binary')
assert.ok(Array.isArray(m.steps) && m.steps.length > 0, 'has fix steps')

const repo = m.steps.find((s) => s.scope === 'repo')
assert.ok(repo, 'has a repo-scoped (applyable) step')
assert.match(repo.command, /NODE_BINARY/, 'repo fix rewrites NODE_BINARY')
assert.match(repo.command, /\.xcode\.env\.local/, 'targets the local override file')
assert.ok(
  m.steps.some((s) => s.scope === 'host'),
  'offers the optional host cleanup (copy-only)'
)

// Don't fire on unrelated dyld noise that has nothing to do with node.
assert.equal(
  matchKnownError('dyld: Library not loaded: /usr/lib/libfoo.dylib (some C++ app)'),
  null,
  'non-node dyld error → no false match (falls through to AI)'
)
// Empty / unknown → null (AI fallback).
assert.equal(matchKnownError(''), null, 'empty → null')
assert.equal(matchKnownError('EACCES: permission denied, mkdir /foo'), null, 'unknown → null')

console.log('DIAG-RULES OK — broken NODE_BINARY matched, no false positives')
