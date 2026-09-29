import { spawnSync } from 'node:child_process'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, realpathSync, existsSync, rmSync, symlinkSync, readdirSync, lstatSync, readlinkSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, relative, resolve } from 'node:path'
import { nativeProfilePath, nativeSessionPath } from '../src/native/profile-path'
import { nativePreferences } from '../src/native/preferences'
import { migrateLegacySidecar } from '../src/main/sidecar-migrate'
import { compatibleEnvironment } from '../src/shared/rename-compat'
import { touchesSidecar } from '../src/main/backends/tools'
import { isWorkBranch } from '../src/main/git'
import { sourceStamp } from '../src/preview/source-stamp'

const root = mkdtempSync(join(tmpdir(), 'trezi-rename-'))
const put = (path, value) => writeFileSync(path, value)

/** The service's migrations (ProfilePaths.swift, LKM-102) against profile-path.ts's rollback twin:
 * each case is set up twice; TS runs on one copy, Swift on the other, and the answers
 * and resulting trees (links included) must match. */
function profileParity() {
  const binary = join(root, 'profile-paths')
  const built = spawnSync('xcrun', ['swiftc', '-module-cache-path', join(root, 'module-cache'), 'src/service/ProfilePaths.swift',
    'test/fixtures/profile-paths/main.swift', '-o', binary], { cwd: new URL('..', import.meta.url).pathname, encoding: 'utf8', timeout: 300_000 })
  assert.equal(built.status, 0, `swiftc: ${built.error || ''}\n${built.stdout}\n${built.stderr}`)
  const snapshot = (base, dir = base) => readdirSync(dir).sort().flatMap(name => {
    const path = join(dir, name), info = lstatSync(path), key = relative(base, path)
    if (info.isSymbolicLink()) return [`${key} -> ${readlinkSync(path).replaceAll(realpathSync(base), '<case>')}`]
    if (info.isDirectory()) return [`${key}/`, ...snapshot(base, path)]
    return [`${key}: ${readFileSync(path, 'utf8')}`]
  })
  // Relative to the case, whether a path came through the temp dir's link or its real path.
  const rel = (base, path) => relative(realpathSync(base), path.startsWith(`${base}/`) ? realpathSync(base) + path.slice(base.length) : path)
  const answer = (run, base) => { try { return { path: rel(base, run()) } } catch (error) { return { error: error.message ?? String(error) } } }
  let index = 0
  const twin = (kind, setup, target = '', cwd = null) => {
    const [ts, swift] = ['ts', 'swift'].map(side => { const base = join(root, 'parity', `${++index}-${side}`); mkdirSync(base, { recursive: true }); setup(base); return base })
    return again(kind, { ts, swift }, target, cwd)
  }
  const again = (kind, { ts, swift }, target = '', cwd = null) => {
    const call = kind === 'profile' ? nativeProfilePath : nativeSessionPath
    const saved = process.cwd()
    if (cwd) process.chdir(ts)
    const tsAnswer = answer(() => resolve(call(cwd ? target : join(ts, target))), ts)
    process.chdir(saved)
    const run = spawnSync(binary, [kind, cwd ? target : join(swift, target)], { cwd: cwd ? swift : undefined, encoding: 'utf8' })
    const swiftAnswer = run.status === 0 ? { path: rel(swift, resolve(cwd ? realpathSync(swift) : swift, run.stdout.trim())) } : { error: run.stderr.trim() }
    assert.deepEqual(swiftAnswer, tsAnswer, `${kind} ${target}: Swift answers as TS`)
    assert.deepEqual(snapshot(swift), snapshot(ts), `${kind} ${target}: Swift leaves the same tree`)
    return { ts, swift, answer: tsAnswer }
  }
  const store = (dir, name, content = 'keep me') => { mkdirSync(join(dir, name, 'worktrees', 'chat'), { recursive: true }); put(join(dir, name, 'sessions.json'), content) }
  // Profiles: fresh (nothing created), legacy (relative alias), repeated, broken, collision, a file.
  assert.deepEqual(twin('profile', () => {}).answer, { path: 'Trezi Native' })
  const legacy = base => { mkdirSync(join(base, 'Praxis Native')); put(join(base, 'Praxis Native', 'native.lock'), '1') }
  const aliased = twin('profile', legacy)
  assert.equal(readlinkSync(join(aliased.swift, 'Trezi Native')), 'Praxis Native')
  again('profile', aliased) // repeated
  twin('profile', base => { legacy(base); symlinkSync('Praxis Native', join(base, 'Trezi Native')) })
  assert.match(twin('profile', base => symlinkSync('missing', join(base, 'Trezi Native'))).answer.error, /broken/)
  assert.match(twin('profile', base => { legacy(base); mkdirSync(join(base, 'Trezi Native')) }).answer.error, /Separate/)
  assert.match(twin('profile', base => put(join(base, 'Praxis Native'), 'file')).answer.error, /real directory/)
  twin('profile', () => {}, 'missing-support')
  // Session stores: praxis, dsgn, both (same and different), relative profile, an interrupted alias, collisions.
  for (const name of ['praxis', 'dsgn']) {
    const done = twin('sessions', base => store(base, name))
    assert.equal(realpathSync(join(done.swift, 'trezi')), realpathSync(join(done.swift, name)))
    again('sessions', done) // repeated
    rmSync(join(done.ts, 'trezi')); rmSync(join(done.swift, 'trezi')); again('sessions', done) // interrupted
  }
  twin('sessions', base => { store(base, 'praxis'); symlinkSync('praxis', join(base, 'dsgn')) })
  assert.match(twin('sessions', base => { store(base, 'praxis'); store(base, 'dsgn') }).answer.error, /Both Praxis and dsgn/)
  assert.match(twin('sessions', base => { store(base, 'praxis'); mkdirSync(join(base, 'trezi')) }).answer.error, /Separate Trezi/)
  assert.match(twin('sessions', base => put(join(base, 'praxis'), 'file')).answer.error, /real directory/)
  twin('sessions', base => { mkdirSync(join(base, 'profile')); store(join(base, 'profile'), 'praxis') }, './profile', true)
  twin('sessions', base => { store(base, 'praxis'); symlinkSync(realpathSync(join(base, 'praxis')), join(base, 'trezi')) })
  // Under a service launch the TS twin never creates an alias the service did not.
  const locked = join(root, 'parity', 'locked'); mkdirSync(locked, { recursive: true }); legacy(locked); store(locked, 'praxis')
  process.env.TREZI_SERVICE_LOCKED = '1'
  try {
    assert.throws(() => nativeProfilePath(locked), /service did not migrate/)
    assert.throws(() => nativeSessionPath(locked), /service did not migrate/)
    assert.ok(!existsSync(join(locked, 'Trezi Native')) && !existsSync(join(locked, 'trezi')))
  } finally { delete process.env.TREZI_SERVICE_LOCKED }
}
try {
  for (const executable of ['praxis', 'trezi']) {
    const result = spawnSync(process.execPath, [new URL(`../bin/${executable}.mjs`, import.meta.url).pathname, '--version'], { encoding: 'utf8' })
    assert.equal(result.status, 0); assert.match(result.stdout, /^Trezi /)
  }
  const fresh = join(root, 'fresh'); mkdirSync(fresh)
  assert.equal(nativeProfilePath(fresh), join(fresh, 'Trezi Native'))
  assert(!existsSync(join(fresh, 'Praxis Native')))
  const support = join(root, 'support'), old = join(support, 'Praxis Native')
  mkdirSync(join(old, 'praxis', 'worktrees', 'chat'), { recursive: true })
  put(join(old, 'native.lock'), String(process.pid))
  put(join(old, 'workspace.json'), '{"draft":"keep me"}')
  put(join(old, 'praxis', 'sessions.json'), '{"conversation":"keep me too"}')
  const profile = nativeProfilePath(support)
  assert.equal(realpathSync(profile), realpathSync(old))
  assert.equal(readFileSync(join(profile, 'native.lock'), 'utf8'), String(process.pid), 'both versions see the same writer lock')
  assert.equal(nativeProfilePath(support), profile)
  const sessions = nativeSessionPath(profile)
  assert.equal(readFileSync(join(sessions, 'sessions.json'), 'utf8'), '{"conversation":"keep me too"}')
  assert.equal(realpathSync(join(sessions, 'worktrees', 'chat')), realpathSync(join(old, 'praxis', 'worktrees', 'chat')))
  assert.equal(nativeSessionPath(profile), sessions)
  // Both override names may contain relative paths. Alias targets must still
  // resolve to the existing physical store on initial and repeated migration.
  const originalCwd = process.cwd()
  process.chdir(root)
  try {
    for (const envName of ['TREZI_USER_DATA', 'PRAXIS_USER_DATA']) {
      for (const legacy of ['praxis', 'dsgn']) {
        const directory = join(root, envName, legacy)
        mkdirSync(join(directory, legacy), { recursive: true })
        put(join(directory, legacy, 'sessions.json'), 'preserved')
        const override = `./${envName}/${legacy}`
        const env = { [envName]: override }
        compatibleEnvironment(env)
        const migrated = nativeSessionPath(env.TREZI_USER_DATA)
        assert.equal(readFileSync(join(migrated, 'sessions.json'), 'utf8'), 'preserved')
        assert.equal(realpathSync(migrated), realpathSync(join(directory, legacy)))
        assert.equal(nativeSessionPath(env.TREZI_USER_DATA), migrated)
        rmSync(migrated)
        assert.equal(nativeSessionPath(env.TREZI_USER_DATA), migrated)
        assert.equal(readFileSync(join(migrated, 'sessions.json'), 'utf8'), 'preserved')
      }
    }
  } finally { process.chdir(originalCwd) }
  // A real Git worktree continues to resolve through the new session alias.
  const repository = join(root, 'repo'); mkdirSync(repository)
  const git = (cwd, args) => { const result = spawnSync('git', args, { cwd, encoding: 'utf8' }); assert.equal(result.status, 0, result.stderr); return result.stdout }
  git(repository, ['init', '-q'])
  git(repository, ['-c', 'user.name=Fixture', '-c', 'user.email=fixture@local', 'commit', '--allow-empty', '-m', 'base', '-q'])
  const legacyWorktree = join(old, 'praxis', 'worktrees', 'real')
  git(repository, ['worktree', 'add', '-b', 'praxis/chat-fixture', legacyWorktree])
  assert.equal(git(join(sessions, 'worktrees', 'real'), ['status', '--porcelain']), '')
  assert(git(repository, ['worktree', 'list', '--porcelain']).includes(realpathSync(legacyWorktree)))
  // The profile lock (and the old `native.lock` reservation) is the service's: a Bun
  // backend started without it refuses before touching the profile, so it can never
  // share one with a running Trezi of either version.
  const backend = new URL('../out/native/index.cjs', import.meta.url)
  if (existsSync(backend)) {
    const env = { ...process.env, TREZI_USER_DATA: profile }; delete env.TREZI_SERVICE_LOCKED
    const blocked = spawnSync(process.execPath, [backend.pathname], { env, encoding: 'utf8', timeout: 10000 })
    assert.equal(blocked.status, 1)
    assert.match(blocked.stderr, /must be started by its service/)
    assert.equal(readFileSync(join(profile, 'native.lock'), 'utf8'), String(process.pid), 'the refused backend leaves the lock alone')
  }

  // Interruption after profile alias but before session alias is naturally resumable.
  rmSync(sessions); assert.equal(nativeSessionPath(profile), sessions)
  put(join(profile, 'preferences.json'), JSON.stringify({ version: 1, values: { 'praxis:old': 'saved', 'praxis:choice': 'old', 'trezi:choice': 'new' } }))
  const preferences = nativePreferences(profile)
  assert.equal(preferences.get('trezi:old'), 'saved')
  assert.equal(preferences.get('praxis:choice'), 'new')
  preferences.set('praxis:old', 'changed')
  assert.equal(nativePreferences(profile).get('trezi:old'), 'changed')
  assert.equal(JSON.parse(readFileSync(join(profile, 'preferences.json'))).values['praxis:old'], 'saved')
  const collision = join(root, 'collision'); mkdirSync(join(collision, 'Praxis Native'), { recursive: true }); mkdirSync(join(collision, 'Trezi Native'))
  assert.throws(() => nativeProfilePath(collision), /Separate/)
  const both = join(root, 'both'); mkdirSync(join(both, 'praxis'), { recursive: true }); mkdirSync(join(both, 'trezi'))
  assert.throws(() => nativeSessionPath(both), /Separate/)
  profileParity()
  const project = join(root, 'project'); mkdirSync(join(project, '.praxis'), { recursive: true })
  put(join(project, '.praxis', 'annotations.json'), '["legacy"]')
  put(join(project, '.praxis', 'content-controls.json'), '{"panels":[]}')
  put(join(project, '.praxis', 'praxis-source.cjs'), '// existing config imports this')
  await migrateLegacySidecar(project)
  assert.equal(readFileSync(join(project, '.trezi', 'annotations.json'), 'utf8'), '["legacy"]')
  assert(existsSync(join(project, '.praxis', 'praxis-source.cjs')))
  await migrateLegacySidecar(project)
  // A partially completed migration copies missing entries on restart.
  rmSync(join(project, '.trezi', 'content-controls.json'))
  await migrateLegacySidecar(project)
  assert(existsSync(join(project, '.trezi', 'content-controls.json')))
  put(join(project, '.trezi', 'annotations.json'), '["canonical"]')
  await migrateLegacySidecar(project)
  assert.equal(readFileSync(join(project, '.trezi', 'annotations.json'), 'utf8'), '["canonical"]')
  assert.equal(readFileSync(join(project, '.praxis', 'annotations.json'), 'utf8'), '["legacy"]')
  const unsafe = join(root, 'unsafe'); mkdirSync(unsafe); symlinkSync(join(project, '.praxis'), join(unsafe, '.praxis'))
  await assert.rejects(migrateLegacySidecar(unsafe), /real directory/)
  const env = { PRAXIS_USER_DATA: 'old', PRAXIS_CODEX_BIN: 'codex', TREZI_USER_DATA: 'new' }; compatibleEnvironment(env)
  assert.equal(env.TREZI_USER_DATA, 'new'); assert.equal(env.TREZI_CODEX_BIN, 'codex')
  for (const name of ['trezi', 'praxis', 'dsgn']) {
    assert(touchesSidecar('Write', { file_path: `/repo/.${name}/secrets.json` }))
    assert(isWorkBranch(`${name}/main`))
  }
  const attrs = new Map([['data-praxis-source', 'old:1:1']]); const element = { getAttribute: key => attrs.get(key) ?? null }
  assert.equal(sourceStamp(element), 'old:1:1'); attrs.set('data-trezi-source', 'new:2:1'); assert.equal(sourceStamp(element), 'new:2:1')
  console.log('RENAME-COMPAT OK: fresh, legacy, repeated, interruption, collisions, Swift profile-path parity, ownership, preferences, environment and stamps')
} finally { rmSync(root, { recursive: true, force: true }) }
