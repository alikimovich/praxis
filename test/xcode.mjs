/**
 * Unit test for the xcrun-failure classifier (no electron). Run via bun so the
 * .ts import transpiles: bun run test:xcode
 */
import assert from 'node:assert'
import {
  xcodeFailureReason,
  parseVersion,
  cmpVersion,
  simBuildDestination,
  extractBuildError
} from '../src/main/xcode.ts'

// The real bug: Xcode IS installed, but the license wasn't accepted (exit 69).
assert.match(
  xcodeFailureReason({
    code: 69,
    stderr:
      "You have not agreed to the Xcode license agreements. Please run 'sudo xcodebuild -license'."
  }),
  /xcodebuild -license accept/,
  'license-not-accepted → accept-license guidance'
)

// xcrun binary not on PATH / Xcode missing.
assert.match(
  xcodeFailureReason({ code: 'ENOENT', message: 'spawn xcrun ENOENT' }),
  /not installed or not selected/,
  'ENOENT → install/select guidance'
)

// Only the Command Line Tools are selected, so simctl can't be found.
assert.match(
  xcodeFailureReason({
    stderr: 'xcrun: error: unable to find utility "simctl", not a developer tool or in PATH'
  }),
  /not installed or not selected/,
  'CLT-only → install full Xcode guidance'
)

// Anything else surfaces the real message rather than a wrong label.
assert.match(
  xcodeFailureReason({ message: 'boom' }),
  /Could not run the iOS simulator tools: boom/,
  'unknown → generic, surfaces the message'
)

// Never throws on odd input.
assert.equal(typeof xcodeFailureReason(null), 'string', 'null input is handled')

// --- version parsing + compare ---------------------------------------------
assert.deepEqual(parseVersion('26.5'), [26, 5], 'parses major.minor')
assert.deepEqual(parseVersion('iOS 18.4.1'), [18, 4, 1], 'pulls version out of text')
assert.equal(parseVersion('not a version'), null, 'non-version → null')
assert.equal(parseVersion(null), null, 'null → null')
assert.ok(cmpVersion([26, 5], [26, 1]) > 0, '26.5 > 26.1')
assert.ok(cmpVersion([26, 10], [26, 2]) > 0, '26.10 > 26.2 (segment-wise, not float)')
assert.equal(cmpVersion([26, 0], [26]) === 0, true, '26.0 == 26')

// --- build-destination gap (the real iOS 26.5 bug) -------------------------
// SDK 26.5 with only 26.0/26.1/18.x runtimes → no buildable destination.
const gap = simBuildDestination('26.5', ['18.4', '18.5', '26.0', '26.1'])
assert.equal(gap.ok, false, 'SDK ahead of every runtime → not buildable')
assert.match(gap.reason, /xcodebuild -downloadPlatform iOS/, 'hands back the download command')
assert.match(gap.reason, /newest installed is iOS 26\.1/, 'names the newest installed runtime')

// A matching (or newer) runtime is fine.
assert.equal(simBuildDestination('26.5', ['26.1', '26.5']).ok, true, 'exact match → ok')
assert.equal(simBuildDestination('26.5', ['27.0']).ok, true, 'newer runtime → ok')

// Unknown SDK or no runtimes must never block (degrade safe).
assert.equal(simBuildDestination(null, ['26.1']).ok, true, 'unknown SDK → never block')
assert.equal(simBuildDestination('garbage', ['26.1']).ok, true, 'unparseable SDK → never block')
assert.match(
  simBuildDestination('26.5', []).reason,
  /none installed/,
  'no runtimes at all → reason says none installed'
)

// --- build-error extraction (the dependency-graph red herring) -------------
// A realistic log: the real cause (dyld/Abort) is buried, with the noisy
// "Explicit dependency on target" graph dumped both around and after it.
const NOISY_LOG = [
  '    ➜ Explicit dependency on target React-domnativemodule in project Pods',
  '    ➜ Explicit dependency on target React-featureflags in project Pods',
  'Node found at: /opt/homebrew/Cellar/node/24.5.0/bin/node',
  'dyld[24703]: Library not loaded: /opt/homebrew/opt/simdjson/lib/libsimdjson.26.dylib',
  '  Reason: tried: ... (no such file)',
  'Script-46EB2E0001D490.sh: line 9: 24703 Abort trap: 6',
  'Command PhaseScriptExecution failed with a nonzero exit code',
  '    ➜ Explicit dependency on target React-graphics in project Pods',
  '    ➜ Explicit dependency on target React-hermes in project Pods',
  'The following build commands failed:'
].join('\n')

const extracted = extractBuildError(NOISY_LOG)
assert.match(extracted, /Library not loaded/, 'surfaces the real dyld error')
assert.match(extracted, /Abort trap/, 'surfaces the abort')
assert.match(extracted, /Node found at/, 'keeps the node-path context line')
assert.ok(
  !/Explicit dependency on target/.test(extracted),
  'drops the dependency-graph noise'
)

// No high-signal lines → fall back to the tail (never empty on non-empty input).
assert.ok(extractBuildError('just some\nplain output').length > 0, 'falls back to tail')
assert.equal(extractBuildError(''), '', 'empty in → empty out')

console.log('XCODE OK — classification, version compare, build-destination gap, error extraction')
