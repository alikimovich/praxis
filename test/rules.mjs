/**
 * dsgn agent rules (v8 R) — pure unit test of the rules builder. Runs under bun
 * (no electron), like project-key/xcode/git.
 *
 * Run with: bun test/rules.mjs
 */
import { dsgnRules, DSGN_RULES_VERSION } from '../src/main/rules.ts'

let failed = 0
const assert = (cond, msg) => {
  if (!cond) {
    console.error(`FAIL: ${msg}`)
    failed++
  }
}

const r = dsgnRules()
assert(typeof r === 'string' && r.length > 0, 'rules render to a non-empty string')
assert(typeof DSGN_RULES_VERSION === 'number', 'version is a number')
assert(r.includes(`v${DSGN_RULES_VERSION}`), 'rules carry the version marker')
// R1 — scope of an element edit.
assert(/scope of an element edit/i.test(r), 'R1: scope-of-edit heading present')
assert(/\blocal\b/i.test(r) && /project-wide/i.test(r), 'R1: local vs project-wide distinction')
assert(/search first|grep/i.test(r), 'R1: search-first guidance')
assert(/report/i.test(r), 'R1: report-what-changed guidance')
// R2: browser inspection → agent-browser, never Chrome DevTools unless asked.
assert(/agent-browser/i.test(r), 'R2: directs the agent to agent-browser')
assert(/devtools/i.test(r) && /unless the user explicitly asks/i.test(r), 'R2: no DevTools unless asked')
// Deterministic (same output every call — safe to inject per turn).
assert(dsgnRules() === r, 'dsgnRules is deterministic')

if (failed) {
  console.error(`RULES FAILED — ${failed} assertion(s)`)
  process.exit(1)
}
console.log(`RULES OK — v${DSGN_RULES_VERSION} builder, R1 scope rule present, deterministic`)
