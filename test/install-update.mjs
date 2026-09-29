// S15 clean install, launch and update, end to end through the real `install.sh` and
// `bin/trezi` (with `bin/trezi.mjs` for updates) against a local origin: only Bun's
// `install`/`run build` (scripted, so nothing is downloaded or compiled), `git clone`
// (redirected to the local origin, so nothing leaves the machine), `open` and
// `lsregister` (recorded, so no app starts and LaunchServices is untouched) and the
// Applications folder (a scratch one) are stand-ins. Covers a clean install, an install re-run
// that updates, a launch (with the build present and with it missing), an update, an
// update interrupted at its build that a second run completes without losing the earlier
// build, a diverged checkout that stops before installing anything, and lockfile drift.
// This proves the launcher, installer and updater scripts, not a real Xcode build or a
// launched app.
import assert from 'node:assert/strict'
import { execFileSync, spawn } from 'node:child_process'
import { chmodSync, copyFileSync, existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readlinkSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { hostVersions, platformProblems } from '../scripts/requirements.mjs'

const root = fileURLToPath(new URL('../', import.meta.url))
const problems = platformProblems({ ...hostVersions({ sdk: true }) })
if (problems.length) {
  console.log(`INSTALL-UPDATE SKIP — this machine cannot run the installer's own platform check: ${problems.join(' ')}`)
  process.exit(0)
}

const scratch = realpathSync(mkdtempSync(join(tmpdir(), 'trezi-install-update-')))
const home = join(scratch, 'home'), shims = join(scratch, 'shims'), state = join(scratch, 'state')
for (const dir of [home, shims, state]) mkdirSync(dir)
const trezi = join(home, '.trezi')
const log = () => (existsSync(join(state, 'calls.log')) ? readFileSync(join(state, 'calls.log'), 'utf8').trim().split('\n').filter(Boolean) : [])
const realGit = execFileSync('which', ['git'], { encoding: 'utf8' }).trim()
const shim = (name, body) => { writeFileSync(join(shims, name), `#!/bin/sh\n${body}\n`); chmodSync(join(shims, name), 0o755) }
// Bun runs scripts and answers --version for real; install and build are recorded (and can be told to fail).
shim('bun', `[ -f "$1" ] && exec "${process.execPath}" "$@" # the launcher's shebang passes the symlink path
case "$1" in
  *.mjs|--version|-v) exec "${process.execPath}" "$@";;
  install) echo "install $(git rev-parse --short HEAD)" >> "$TEST_STATE/calls.log"; [ -f "$TEST_STATE/fail-install" ] && exit 1; exit 0;;
  run) echo "run $2 $(git rev-parse --short HEAD)" >> "$TEST_STATE/calls.log"
    if [ -f "$TEST_STATE/fail-build" ]; then echo "build failed (fixture)" >&2; exit 1; fi
    mkdir -p out/native/Trezi.app/Contents/MacOS out/native/Trezi.app/Contents/Helpers out/native/Trezi.app/Contents/Resources/backend && : > out/native/Trezi.app/Contents/Resources/backend/index.cjs && : > out/native/TreziService
    : > out/native/Trezi.app/Contents/MacOS/TreziHost && : > out/native/Trezi.app/Contents/Helpers/bun; exit 0;;
esac
exit 2`)
shim('git', `if [ "$1" = clone ]; then shift 2; exec "${realGit}" clone "$TEST_ORIGIN" "$@"; fi\nexec "${realGit}" "$@"`)
shim('open', 'printf "%s\\n" "$@" > "$TEST_STATE/opened"')
shim('lsregister', 'echo "$@" >> "$TEST_STATE/lsregister.log"')
shim('agent-browser', 'exit 0') // the installer's optional step is skipped when it is present (no terminal prompt)
const applications = join(scratch, 'Applications')
mkdirSync(applications)
const env = { HOME: home, PATH: `${shims}:/usr/bin:/bin:/usr/sbin:/sbin`, SHELL: '/bin/zsh', TEST_STATE: state, TEST_ORIGIN: join(scratch, 'origin.git'),
  TREZI_APPLICATIONS: applications, TREZI_LSREGISTER: join(shims, 'lsregister'),
  GIT_AUTHOR_NAME: 'T', GIT_AUTHOR_EMAIL: 't@example.com', GIT_COMMITTER_NAME: 'T', GIT_COMMITTER_EMAIL: 't@example.com' }

/** Runs a command in its own session (no controlling terminal), bounded. */
function exec(command, args, { cwd = scratch, extra = {} } = {}) {
  return new Promise(resolve => {
    const child = spawn(command, args, { cwd, env: { ...env, ...extra }, detached: true, stdio: ['ignore', 'pipe', 'pipe'] })
    let stdout = '', stderr = ''
    child.stdout.on('data', data => { stdout += data }); child.stderr.on('data', data => { stderr += data })
    const timer = setTimeout(() => child.kill('SIGKILL'), 90_000)
    child.on('exit', (code, signal) => { clearTimeout(timer); resolve({ code, signal, stdout, stderr }) })
  })
}
const git = (cwd, ...args) => execFileSync(realGit, args, { cwd, env: { ...process.env, ...env }, encoding: 'utf8' }).trim()

// The origin: a small Trezi with the real launcher, requirements and installer inputs.
const seed = join(scratch, 'seed')
git(scratch, 'init', '-q', '--bare', '--initial-branch=main', 'origin.git')
git(scratch, 'init', '-q', '--initial-branch=main', 'seed')
for (const dir of ['bin', 'scripts']) mkdirSync(join(seed, dir))
for (const file of ['bin/trezi', 'bin/trezi.mjs', 'scripts/requirements.mjs']) copyFileSync(join(root, file), join(seed, file))
chmodSync(join(seed, 'bin/trezi'), 0o755)
writeFileSync(join(seed, 'package.json'), JSON.stringify({ name: 'trezi', version: '1.0.0', scripts: { build: 'x' } }))
writeFileSync(join(seed, 'bun.lock'), 'lock 1\n')
git(seed, 'add', '-A'); git(seed, 'commit', '-qm', 'one'); git(seed, 'remote', 'add', 'origin', env.TEST_ORIGIN); git(seed, 'push', '-q', 'origin', 'main')
const release = name => { writeFileSync(join(seed, `${name}.txt`), `${name}\n`); git(seed, 'add', '-A'); git(seed, 'commit', '-qm', name); git(seed, 'push', '-q', 'origin', 'main') }
const app = join(trezi, 'out/native/Trezi.app')
const built = () => ['out/native/Trezi.app/Contents/Resources/backend/index.cjs', 'out/native/TreziService', 'out/native/Trezi.app/Contents/MacOS/TreziHost', 'out/native/Trezi.app/Contents/Helpers/bun']
  .every(path => existsSync(join(trezi, path)))
const step = line => (line.startsWith('run') ? 'run build' : 'install')
const head = () => git(trezi, 'rev-parse', '--short', 'HEAD')
/** What the command asked `open` for (and clears it). */
function opened() {
  const args = readFileSync(join(state, 'opened'), 'utf8').trim().split('\n')
  rmSync(join(state, 'opened'))
  return args
}

try {
  // Clean install: clone, platform check, install, build, and the `trezi` command on the launcher path.
  const install = await exec('bash', [join(root, 'install.sh')])
  assert.equal(install.code, 0, `install.sh: ${install.stdout}\n${install.stderr}`)
  assert.match(install.stdout, /Cloning Trezi into/); assert.match(install.stdout, /Trezi installed to/)
  assert.deepEqual(log().map(step), ['install', 'run build'])
  assert.ok(built(), 'the build produced the host, the service and the Bun bundle')
  assert.ok(lstatSync(join(home, '.local/bin/trezi')).isSymbolicLink())
  assert.equal(readlinkSync(join(home, '.local/bin/trezi')), join(trezi, 'bin/trezi'))
  assert.equal(readlinkSync(join(home, '.local/bin/praxis')), join(trezi, 'bin/trezi'))
  // Applications gets a link to the built app, and LaunchServices is told about it.
  assert.ok(lstatSync(join(applications, 'Trezi.app')).isSymbolicLink())
  assert.equal(readlinkSync(join(applications, 'Trezi.app')), app)
  assert.equal(readFileSync(join(state, 'lsregister.log'), 'utf8'), `-f ${app}\n`)

  // Launch through the installed command (`open -a`): with the build present nothing is rebuilt.
  const calls = log().length
  const first = await exec(join(home, '.local/bin/trezi'), [scratch])
  assert.equal(first.code, 0, first.stderr)
  assert.deepEqual(opened(), ['-a', app, scratch]); assert.equal(log().length, calls)
  assert.equal((await exec(join(home, '.local/bin/trezi'), ['.'], { cwd: seed })).code, 0)
  assert.deepEqual(opened(), ['-a', app, seed], 'trezi . opens the current folder')
  const file = await exec(join(home, '.local/bin/trezi'), [join(seed, 'package.json')])
  assert.equal(file.code, 1); assert.match(file.stderr, /Not a folder/); assert.ok(!existsSync(join(state, 'opened')))
  // With the build missing the command builds first, then opens.
  rmSync(join(trezi, 'out'), { recursive: true })
  assert.equal((await exec(join(home, '.local/bin/trezi'), [])).code, 0)
  assert.deepEqual(opened(), ['-a', app])
  assert.equal(step(log().at(-1)), 'run build'); assert.ok(built())
  console.log('install-update: clean install, Applications link, launch with and without a build')

  // Update: pull, install, build.
  release('two')
  const updated = await exec(join(home, '.local/bin/trezi'), ['--update'])
  assert.equal(updated.code, 0, updated.stderr); assert.match(updated.stdout, /Updated [0-9a-f]+ → [0-9a-f]+\./)
  assert.equal(head(), git(seed, 'rev-parse', '--short', 'HEAD'))
  assert.deepEqual(log().slice(-2).map(step), ['install', 'run build'])

  // Interrupted at the build: the pull stays, the earlier build stays usable, the next run completes.
  release('three')
  writeFileSync(join(state, 'fail-build'), '')
  const broken = await exec(join(home, '.local/bin/trezi'), ['--update'])
  assert.notEqual(broken.code, 0); assert.match(broken.stderr, /Update failed while running `bun run build`/)
  assert.equal(head(), git(seed, 'rev-parse', '--short', 'HEAD'), 'the pull was not undone or repeated')
  assert.ok(built(), 'a failed rebuild leaves the previous build in place')
  rmSync(join(state, 'fail-build'))
  const resumed = await exec(join(home, '.local/bin/trezi'), ['--update'])
  assert.equal(resumed.code, 0, resumed.stderr); assert.match(resumed.stdout, /already up to date/)
  assert.equal(step(log().at(-1)), 'run build'); assert.ok(built())
  console.log('install-update: update, interrupted update resumed')

  // A checkout that cannot fast-forward stops before installing or building, and keeps its own commit.
  writeFileSync(join(trezi, 'mine.txt'), 'local\n'); git(trezi, 'add', '-A'); git(trezi, 'commit', '-qm', 'local work')
  release('four')
  const before = { head: head(), calls: log().length }
  const diverged = await exec(join(home, '.local/bin/trezi'), ['--update'])
  assert.notEqual(diverged.code, 0); assert.match(diverged.stderr, /git pull --ff-only/); assert.match(diverged.stderr, /commit or stash/)
  assert.deepEqual({ head: head(), calls: log().length }, before); assert.ok(existsSync(join(trezi, 'mine.txt')))
  git(trezi, 'reset', '-q', '--hard', 'origin/main')

  // Regenerated lockfile drift never blocks an update.
  release('five')
  writeFileSync(join(trezi, 'bun.lock'), 'lock drifted by an install\n')
  const drift = await exec(join(home, '.local/bin/trezi'), ['--update'])
  assert.equal(drift.code, 0, drift.stderr); assert.match(drift.stdout, /Discarding local bun\.lock changes/)
  assert.equal(readFileSync(join(trezi, 'bun.lock'), 'utf8'), 'lock 1\n')

  // Running the installer again updates in place and rebuilds.
  release('six')
  const again = await exec('bash', [join(root, 'install.sh')])
  assert.equal(again.code, 0, `${again.stdout}\n${again.stderr}`); assert.match(again.stdout, /Updating existing install/)
  assert.equal(head(), git(seed, 'rev-parse', '--short', 'HEAD')); assert.ok(built())
  console.log('install-update: diverged checkout refused, lockfile drift, installer re-run')
  console.log('INSTALL-UPDATE OK — clean install, Applications link, open -a launch, update, interrupted-update resume and installer re-run (build and clone are scripted; no real Xcode build or app launch)')
} finally {
  rmSync(scratch, { recursive: true, force: true })
}
