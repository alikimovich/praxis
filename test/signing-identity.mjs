// LKM-137 code signing (`scripts/signing.mjs`): which identity a build signs with, the
// one-line ad hoc fallback, and the designated requirement a rebuild keeps. Every
// `security`/`openssl` call goes to a scripted stand-in, so the result never depends on
// this Mac's keychains and the test never adds an identity to them. Two real parts: an
// ad hoc signature of a scratch copy of /usr/bin/true, and "Trezi Local" created in a
// temporary keychain (skipped, and said so, where no keychain can be created).
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { copyFileSync, mkdtempSync, realpathSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  codesignArgs, createLocalIdentity, designatedRequirement, LOCAL_IDENTITY, parseIdentities, pickIdentity, sign, signingIdentity
} from '../scripts/signing.mjs'

const APPLE = 'A1'.repeat(20), REVOKED = 'B2'.repeat(20), LOCAL = 'C3'.repeat(20), EXPIRED = 'D4'.repeat(20)
const listing = rows => [
  'Policy: Code Signing', '  Matching identities',
  ...rows.map(([hash, name, problem], i) => `  ${i + 1}) ${hash} "${name}"${problem ? ` (${problem})` : ''}`),
  `     ${rows.length} identities found`, '', '  Valid identities only', '     0 valid identities found', ''
].join('\n')

// Parsing `security find-identity -p codesigning`.
const parsed = parseIdentities(listing([[REVOKED, 'Apple Development: Old (TEAM1)', 'CSSMERR_TP_CERT_REVOKED'], [LOCAL, LOCAL_IDENTITY, 'CSSMERR_TP_NOT_TRUSTED'], [APPLE, 'Apple Development: Dev (TEAM2)']]))
assert.deepEqual(parsed, [
  { hash: REVOKED, name: 'Apple Development: Old (TEAM1)', problem: 'CSSMERR_TP_CERT_REVOKED' },
  { hash: LOCAL, name: LOCAL_IDENTITY, problem: 'CSSMERR_TP_NOT_TRUSTED' },
  { hash: APPLE, name: 'Apple Development: Dev (TEAM2)', problem: null }
])
assert.deepEqual(parseIdentities(''), [])

// The choice: a valid Apple Development identity, else "Trezi Local" (untrusted is fine,
// expired is not), else none; TREZI_SIGN_IDENTITY overrides.
assert.deepEqual(pickIdentity(parsed), { kind: 'apple', hash: APPLE, name: 'Apple Development: Dev (TEAM2)' })
assert.deepEqual(pickIdentity(parsed.slice(0, 2)), { kind: 'local', hash: LOCAL, name: LOCAL_IDENTITY }, 'a revoked Apple identity is skipped')
assert.equal(pickIdentity([{ hash: EXPIRED, name: LOCAL_IDENTITY, problem: 'CSSMERR_TP_CERT_EXPIRED' }]), null)
assert.equal(pickIdentity([]), null)
assert.deepEqual(pickIdentity(parsed, '-'), { kind: 'adhoc' })
assert.deepEqual(pickIdentity(parsed, LOCAL_IDENTITY), { kind: 'named', hash: LOCAL, name: LOCAL_IDENTITY })
assert.deepEqual(pickIdentity(parsed, APPLE.toLowerCase()), { kind: 'named', hash: APPLE, name: 'Apple Development: Dev (TEAM2)' })
assert.equal(pickIdentity(parsed, 'Nobody'), null)
console.log('SIGNING-IDENTITY pick PASS')

// signingIdentity against a scripted keychain. `state.rows` is what find-identity lists;
// a successful import adds "Trezi Local".
function world({ rows = [], fail = null, imports = true } = {}) {
  const calls = [], warnings = []
  const run = (command, args) => {
    const step = `${command.split('/').pop()} ${args[0]}`
    calls.push(step)
    if (step === fail) return { status: 1, stdout: '', stderr: `${step}: refused\n` }
    if (step === 'security find-identity') return { status: 0, stdout: listing(rows), stderr: '' }
    if (step === 'security import' && imports) rows = [...rows, [LOCAL, LOCAL_IDENTITY, 'CSSMERR_TP_NOT_TRUSTED']]
    return { status: 0, stdout: '', stderr: '' }
  }
  return { calls, warnings, options: { env: {}, keychain: '/tmp/login.keychain-db', run, warn: line => warnings.push(line) } }
}
const choose = (w, extra = {}) => signingIdentity({ ...w.options, ...extra })
const adhocWarning = /^warning: signing Trezi ad hoc \(.+\); macOS will ask again for Keychain and privacy access after each rebuild\. See README "Code signing"\.$/

{ // An existing identity is used as is; nothing is created.
  const w = world({ rows: [[LOCAL, LOCAL_IDENTITY, 'CSSMERR_TP_NOT_TRUSTED']] })
  assert.deepEqual(choose(w), { kind: 'local', hash: LOCAL, name: LOCAL_IDENTITY })
  assert.deepEqual(w.calls, ['security find-identity']); assert.deepEqual(w.warnings, [])
}
{ // Apple Development wins over Trezi Local.
  const w = world({ rows: [[LOCAL, LOCAL_IDENTITY, 'CSSMERR_TP_NOT_TRUSTED'], [APPLE, 'Apple Development: Dev (TEAM2)']] })
  assert.equal(choose(w).kind, 'apple'); assert.deepEqual(w.warnings, [])
}
{ // First build: Trezi Local is created once (certificate, PKCS#12, import), then used.
  const w = world()
  assert.deepEqual(choose(w), { kind: 'local', hash: LOCAL, name: LOCAL_IDENTITY })
  assert.deepEqual(w.calls, ['security find-identity', 'openssl req', 'openssl pkcs12', 'security import', 'security find-identity'])
  assert.deepEqual(w.warnings, [])
}
for (const [label, setup, extra, reason] of [
  ['the certificate cannot be made', { fail: 'openssl req' }, {}, /could not create the "Trezi Local" identity: openssl req failed: openssl req: refused/],
  ['the import fails', { fail: 'security import' }, {}, /could not create the "Trezi Local" identity: security import failed/],
  ['the import leaves no usable identity', { imports: false }, {}, /the new "Trezi Local" identity is not usable/],
  ['a test build never creates one', {}, { create: false }, /no "Trezi Local" identity yet, and this build does not create one/],
  ['the named identity is missing', {}, { env: { TREZI_SIGN_IDENTITY: 'Nobody' } }, /no code-signing identity "Nobody"/]
]) {
  const w = world(setup)
  assert.deepEqual(choose(w, extra), { kind: 'adhoc' }, label)
  assert.equal(w.warnings.length, 1, `${label}: exactly one warning line`)
  assert.match(w.warnings[0], adhocWarning, label); assert.match(w.warnings[0], reason, label)
  assert.ok(!w.warnings[0].includes('\n'), label)
  if (extra.create === false || extra.env) assert.ok(!w.calls.some(call => call.startsWith('openssl') || call === 'security import'), `${label}: nothing created`)
}
{ // TREZI_SIGN_IDENTITY=- is a deliberate ad hoc build: no warning, nothing created.
  const w = world()
  assert.deepEqual(choose(w, { env: { TREZI_SIGN_IDENTITY: '-' } }), { kind: 'adhoc' })
  assert.deepEqual(w.warnings, []); assert.ok(!w.calls.includes('openssl req'))
}
{ // A stand-in that throws still ends in one warning, never an exception.
  const warnings = []
  assert.deepEqual(signingIdentity({ env: {}, run: () => { throw new Error('boom') }, warn: line => warnings.push(line) }), { kind: 'adhoc' })
  assert.equal(warnings.length, 1); assert.match(warnings[0], /boom/)
}
console.log('SIGNING-IDENTITY choice PASS')

// The designated requirement is a function of the identifier and the certificate only,
// so every rebuild with the same identity carries the same one.
const local = { kind: 'local', hash: LOCAL, name: LOCAL_IDENTITY }
const requirement = `designated => identifier "dev.trezi.secrets" and certificate leaf = H"${LOCAL.toLowerCase()}"`
assert.equal(designatedRequirement(local, 'dev.trezi.secrets'), requirement)
assert.equal(designatedRequirement({ ...local }, 'dev.trezi.secrets'), requirement, 'a rebuild gets the same requirement')
assert.deepEqual(codesignArgs(local, '/x', 'dev.trezi.secrets'),
  ['--force', '--sign', LOCAL, '--timestamp=none', '--identifier', 'dev.trezi.secrets', '-r', `=${requirement}`, '/x'])
assert.deepEqual(codesignArgs({ kind: 'apple', hash: APPLE }, '/x', 'dev.praxis.native'),
  ['--force', '--sign', APPLE, '--timestamp=none', '--identifier', 'dev.praxis.native', '/x'], 'Apple keeps its team requirement')
assert.deepEqual(codesignArgs({ kind: 'adhoc' }, '/x', 'dev.trezi.bun'), ['--force', '--sign', '-', '--timestamp=none', '--identifier', 'dev.trezi.bun', '/x'])
assert.throws(() => sign(local, '/x', 'id', () => ({ status: 1, stdout: '', stderr: 'no identity found' })), /codesign \/x: no identity found/)

// Real codesign, ad hoc: the fallback signs and the result verifies.
const scratch = realpathSync(mkdtempSync(join(tmpdir(), 'trezi-signing-')))
try {
  const binary = join(scratch, 'probe')
  copyFileSync('/usr/bin/true', binary)
  sign({ kind: 'adhoc' }, binary, 'dev.trezi.signing-probe')
  assert.equal(spawnSync('/usr/bin/codesign', ['--verify', binary]).status, 0)
  const info = spawnSync('/usr/bin/codesign', ['-dv', binary], { encoding: 'utf8' }).stderr
  assert.match(info, /Identifier=dev\.trezi\.signing-probe/); assert.match(info, /Signature=adhoc/)
  console.log('SIGNING-IDENTITY codesign PASS')

  // Real "Trezi Local" creation, in a temporary keychain (never the login keychain, never
  // the search list).
  const keychain = join(scratch, 'signing.keychain-db')
  const made = spawnSync('/usr/bin/security', ['create-keychain', '-p', 'trezi-test', keychain], { encoding: 'utf8' })
  if (made.status !== 0) {
    console.log(`SIGNING-IDENTITY local-identity SKIP (no temporary keychain here: ${made.stderr.trim()})`)
  } else {
    try {
      spawnSync('/usr/bin/security', ['unlock-keychain', '-p', 'trezi-test', keychain])
      createLocalIdentity({ keychain })
      const found = parseIdentities(spawnSync('/usr/bin/security', ['find-identity', '-p', 'codesigning', keychain], { encoding: 'utf8' }).stdout)
      const picked = pickIdentity(found)
      assert.equal(picked?.kind, 'local', JSON.stringify(found))
      assert.match(picked.hash, /^[0-9A-F]{40}$/)
      console.log('SIGNING-IDENTITY local-identity PASS')
    } finally {
      spawnSync('/usr/bin/security', ['delete-keychain', keychain])
    }
  }
} finally {
  rmSync(scratch, { recursive: true, force: true })
}
console.log('SIGNING-IDENTITY OK')
