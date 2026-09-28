import { spawnSync } from 'node:child_process'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, realpathSync, existsSync, rmSync, symlinkSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { nativeProfilePath, nativeSessionPath } from '../src/native/profile-path'
import { nativePreferences } from '../src/native/preferences'
import { migrateLegacySidecar } from '../src/main/sidecar-migrate'
import { compatibleEnvironment } from '../src/shared/rename-compat'
import { touchesSidecar } from '../src/main/backends/tools'
import { isWorkBranch } from '../src/main/git'
import { sourceStamp } from '../src/preview/source-stamp'

const root = mkdtempSync(join(tmpdir(), 'trezi-rename-'))
const put = (path, value) => writeFileSync(path, value)
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
  const backend = new URL('../out/native/index.cjs', import.meta.url)
  if (existsSync(backend)) {
    const blocked = spawnSync(process.execPath, [backend.pathname], { env: { ...process.env, TREZI_USER_DATA: profile }, encoding: 'utf8', timeout: 10000 })
    assert.equal(blocked.status, 1)
    assert.match(blocked.stderr, /already using this profile/)
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
  console.log('RENAME-COMPAT OK: fresh, legacy, repeated, interruption, collisions, ownership, preferences, environment and stamps')
} finally { rmSync(root, { recursive: true, force: true }) }
