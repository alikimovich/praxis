/**
 * Unit test for the xcrun-failure classifier (no electron). Run via bun so the
 * .ts import transpiles: bun run test:xcode
 */
import assert from 'node:assert'
import { xcodeFailureReason } from '../src/main/xcode.ts'

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

console.log('XCODE OK — license / not-found / generic classification')
