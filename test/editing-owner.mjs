// S12 editing coordinator: the real Swift EditingOwner (compiled into a fixture process
// with the conversation, repository and source owners it works with), driven through
// Bun's real client and the unchanged TS island/controls/content modules.
// - parity: one scripted session (definitions, same-turn replacement, activation by the
//   defining turn only, a late terminal, a composition cut short, command admission,
//   the revision chain of a reordered batch, Undo/Reset, restart normalization,
//   navigation, content drafts, sidecar commits) gives identical answers and identical
//   island history bytes on the legacy twin and the Swift owner;
// - turns: the conversation coordinator is the authority for an island's origin and a
//   navigation's turn;
// - suites: chat-islands, shadow-controls, control-panels, content-controls,
//   native-content and annotation-store (S15: notes and starter tokens) re-run
//   unchanged with the Swift owners preloaded;
// - drafts (restart, stale base refused, damaged file), sidecars (stale bytes, symlinks,
//   lanes), crash (SIGKILL inside an island write), rollback, drain, schema.
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { compileEditingFixture, startEditingFixture } from './helpers/editing-fixture.mjs'
import { islandFile, legacyEditing } from '../src/main/editing-model.ts'
import { contentHash } from '../src/main/source-owner.ts'
import { NativeContentController } from '../src/native/content-controller.ts'
import { NavigationController } from '../src/native/navigation-controller.ts'
import { TurnBoundaries } from '../src/native/turn-boundaries.ts'

const repo = fileURLToPath(new URL('..', import.meta.url))
const scratch = realpathSync(mkdtempSync(join(tmpdir(), 'trezi-editing-owner-')))
const binary = compileEditingFixture()
const dir = (...parts) => { const path = join(scratch, ...parts); mkdirSync(path, { recursive: true }); return path }
const hex = seed => contentHash(String(seed))
const def = title => ({ manifest: { file: 'shadow.js', component: 'Card', title, params: [{ id: 'x', label: 'x', kind: 'number', apply: { strategy: 'literal', anchor: 'const X = ' } }] },
  blocks: [{ id: 'main', title, kind: 'group', params: ['x'] }] })
const fixtures = []
const began = Date.now()
const log = console.log
console.log = (...args) => log(`[${((Date.now() - began) / 1000).toFixed(1)}s]`, ...args)
const start = async (profile, env) => { const fixture = await startEditingFixture(binary, profile, env); fixtures.push(fixture); return fixture }

/** The scripted session. Random ids/tokens are mapped to stable names before comparing. */
async function script(owner, root, profile) {
  const out = [], ids = new Map()
  const norm = value => JSON.parse(JSON.stringify(value ?? null, (_, v) => typeof v === 'string' && ids.has(v) ? ids.get(v) : v))
  const note = (label, value) => out.push([label, norm(value)])
  const bare = ({ token, ticket, ...rest }) => rest
  const rejects = async (label, promise) => {
    try { await promise; out.push([label, 'resolved']) } catch (error) { out.push([label, error.code, error.message]) }
  }
  note('open', await owner.islandsOpen('A', root, 'rec-1'))
  const a = await owner.islandDefine('A', 1, 'T1'); ids.set(a.id, 'id1')
  note('define', bare(a))
  await rejects('busy define', owner.islandDefine('A', 1, 'T1'))
  await rejects('busy command', owner.islandCommand('A', a.id, 1, 'commit', hex(0)))
  note('commit', await owner.islandCommit('A', a.token, def('one'), 'agent', { x: 0 }))
  const b = await owner.islandDefine('A', 1, 'T1', a.id, 1)
  note('replace (same turn: same id, next revision)', bare(b))
  note('commit replacement', await owner.islandCommit('A', b.token, def('two'), 'jev', { x: 0.5 }, 'fallback note'))
  await rejects('stale definition revision', owner.islandDefine('A', 1, 'T1', a.id, 1))
  await rejects('not landed', owner.islandCommand('A', a.id, 2, 'commit', hex(0)))
  note('another turn’s late terminal activates nothing', await owner.islandSettle('A', 'T0', true))
  note('its own turn lands', await owner.islandSettle('A', 'T1', true))
  // A queued batch: each command is computed against the batch's own last write.
  const c1 = await owner.islandCommand('A', a.id, 2, 'commit', hex(0)); note('c1', bare(c1))
  await rejects('one command at a time', owner.islandCommand('A', a.id, 2, 'commit', hex(0)))
  await owner.islandFinish('A', c1.ticket, { ok: true, group: 'g1', revision: hex(1) }, false)
  const c2 = await owner.islandCommand('A', a.id, 2, 'commit', hex(0)); note('c2 (reordered frame)', bare(c2))
  await owner.islandFinish('A', c2.ticket, { ok: true, group: 'g1', revision: hex(2) }, false)
  const c3 = await owner.islandCommand('A', a.id, 2, 'commit', hex(1)); note('c3', bare(c3))
  await owner.islandFinish('A', c3.ticket, { ok: false }, true)
  const c4 = await owner.islandCommand('A', a.id, 2, 'commit', hex(0)); note('c4 (batch over: external bytes not blessed)', bare(c4))
  await owner.islandFinish('A', c4.ticket, { ok: true }, true)
  const u = await owner.islandCommand('A', a.id, 2, 'undo', hex(2)); note('undo group', bare(u))
  await owner.islandFinish('A', u.ticket, { ok: true }, true)
  await rejects('undo twice', owner.islandCommand('A', a.id, 2, 'undo', hex(2)))
  const r = await owner.islandCommand('A', a.id, 2, 'reset', hex(2)); note('reset initial', bare(r))
  await rejects('wrong ticket', owner.islandFinish('A', 'not-a-ticket', { ok: true }, true))
  await owner.islandFinish('A', r.ticket, { ok: true, group: 'g2', revision: hex(3) }, true)
  note('reload', bare(await owner.islandCommand('A', a.id, 2, 'reload', hex(9))))
  await rejects('stale island revision', owner.islandCommand('A', a.id, 1, 'commit', hex(3)))
  // A later turn: its own island; a failed terminal of that turn, and a composition cut short.
  const d = await owner.islandDefine('A', 2, 'T2', a.id, 2); ids.set(d.id, 'id2')
  note('later turn gets a fresh island', bare(d))
  note('commit later', await owner.islandCommit('A', d.token, def('three'), 'agent', {}))
  const e = await owner.islandDefine('A', 2, 'T2'); ids.set(e.id, 'id3')
  note('stopped turn', await owner.islandSettle('A', 'T2', false))
  await rejects('commit after its turn ended', owner.islandCommit('A', e.token, def('four'), 'agent', {}))
  note('duplicate success does not revive', await owner.islandSettle('A', 'T2', true))
  // No origin (a legacy record): any terminal of the chat settles it.
  const f = await owner.islandDefine('A', 3, null); ids.set(f.id, 'id4')
  await owner.islandCommit('A', f.token, def('five'), 'agent', {})
  note('origin-less', await owner.islandSettle('A', 'T9', true))
  note('another chat on the same history sees it', await owner.islandsOpen('B', root, 'rec-1'))
  const g = await owner.islandDefine('A', 4, 'T4'); ids.set(g.id, 'id5')
  await owner.islandCommit('A', g.token, def('six'), 'agent', {})
  note('B follows A’s write', await owner.islands('B'))
  await owner.islandsClose('A'); await owner.islandsClose('B')
  note('reopen: waiting lost its turn', await owner.islandsOpen('C', root, 'rec-1'))
  await rejects('closed chat', owner.islandCommand('A', a.id, 2, 'commit', hex(3)))
  const file = readFileSync(islandFile(join(profile, 'chat-islands'), root, 'rec-1'), 'utf8')
  out.push(['history bytes', [...ids].reduce((text, [id, name]) => text.replaceAll(id, name), file)])

  // Deferred navigation
  note('nav awaits its turn', await owner.navigate('N', root, '/work/a?view=full#x', 'T1'))
  note('another turn lands', await owner.navigation('N', 'landed', 'T0'))
  note('take while awaiting', await owner.navigationTake('N'))
  note('state', await owner.navigationState())
  note('its turn lands', await owner.navigation('N', 'landed', 'T1'))
  note('take', await owner.navigationTake('N'))
  note('taken once', await owner.navigationTake('N'))
  note('failed turn drops', [await owner.navigate('N', root, '/b', 'T2'), await owner.navigation('N', 'failed', 'T2'), await owner.navigationTake('N')])
  note('newer turn drops', [await owner.navigate('N', root, '/c', 'T3'), await owner.navigation('N', 'begin', 'T3'), await owner.navigation('N', 'begin', 'T4'), await owner.navigationState()])
  note('idle request opens now', [await owner.navigate('N', root, '/d', null), await owner.navigation('N', 'close', null), await owner.navigationTake('N')])
  for (const path of ['//evil.test/', 'https://x.test/', '/a b', '/a\\b', 'relative']) await rejects(`bad path ${path}`, owner.navigate('N', root, path, null))

  // Content drafts
  note('no drafts', await owner.contentDrafts(root))
  await owner.saveContentDraft(root, 'hero', hex('r1'), { title: 'Draft', items: [{ id: 'a' }] })
  await owner.saveContentDraft(root, 'other', hex('r1'), { title: 'Other' })
  await owner.saveContentDraft(root, 'hero', hex('r2'), { title: 'Draft 2' })
  note('drafts', (await owner.contentDrafts(root)).map(({ updated, ...d }) => { assert.ok(updated); return d }))
  await owner.clearContentDraft(root, 'other'); await owner.clearContentDraft(root, 'missing')
  note('cleared', (await owner.contentDrafts(root)).map(d => d.panel))
  await rejects('oversized draft', owner.saveContentDraft(root, 'big', hex('r1'), { text: 'x'.repeat(600_000) }))
  return out
}

/** Sidecar commits on `root`: identical outcomes on both owners. */
async function sidecars(owner, root) {
  const out = []
  const attempt = async (label, promise) => { try { out.push([label, await promise]) } catch (error) { out.push([label, error.code]) } }
  const file = join(root, '.trezi', 'control-panels.json')
  await attempt('create', owner.sidecar(root, 'control-panels.json', null, '{"version":1}\n'))
  await attempt('create again is stale', owner.sidecar(root, 'control-panels.json', null, '{}\n'))
  await attempt('bound update', owner.sidecar(root, 'control-panels.json', contentHash('{"version":1}\n'), '{"version":1,"panels":[]}\n'))
  writeFileSync(file, '{"hand":"edit"}\n')
  await attempt('hand edit refused', owner.sidecar(root, 'control-panels.json', contentHash('{"version":1,"panels":[]}\n'), '{}\n'))
  out.push(['hand edit kept', readFileSync(file, 'utf8')])
  await attempt('not a sidecar', owner.sidecar(root, 'settings.json', null, '{}'))
  // S15: the notes and starter tokens sidecars commit the same way.
  await attempt('notes create', owner.sidecar(root, 'annotations.json', null, '[]\n'))
  await attempt('notes bound update', owner.sidecar(root, 'annotations.json', contentHash('[]\n'), '[{"id":"a1","text":"x"}]\n'))
  await attempt('notes stale', owner.sidecar(root, 'annotations.json', contentHash('[]\n'), '[]\n'))
  await attempt('tokens create-only', owner.sidecar(root, 'tokens.json', null, '{}\n'))
  await attempt('tokens exists', owner.sidecar(root, 'tokens.json', null, '{"x":1}\n'))
  out.push(['notes kept', readFileSync(join(root, '.trezi', 'annotations.json'), 'utf8')])
  rmSync(file); symlinkSync(join(scratch, 'outside.json'), file)
  await attempt('symlinked file', owner.sidecar(root, 'control-panels.json', null, '{}'))
  rmSync(join(root, '.trezi'), { recursive: true }); symlinkSync(dir('outside-trezi'), join(root, '.trezi'))
  await attempt('symlinked folder', owner.sidecar(root, 'content-controls.json', null, '{}'))
  rmSync(join(root, '.trezi'))
  await attempt('oversized', owner.sidecar(root, 'content-controls.json', null, 'x'.repeat(1024 * 1024 + 1)))
  return out
}

try {
  // ── parity ──────────────────────────────────────────────────────────────
  {
    const legacyProfile = dir('parity-legacy'), swiftProfile = dir('parity-swift'), root = dir('parity-project')
    const legacy = await script(legacyEditing({ islands: join(legacyProfile, 'chat-islands') }), root, legacyProfile)
    const fixture = await start(swiftProfile)
    const { editing } = fixture.owners()
    assert.equal(editing.kind, 'swift')
    const swift = await script(editing, root, swiftProfile)
    for (let i = 0; i < Math.max(legacy.length, swift.length); i++) assert.deepEqual(swift[i], legacy[i], `step ${legacy[i]?.[0] ?? swift[i]?.[0]}`)
    const legacySide = await sidecars(legacyEditing(), dir('sidecar-legacy'))
    const swiftSide = await sidecars(editing, dir('sidecar-swift'))
    assert.deepEqual(swiftSide, legacySide)
    assert.deepEqual(swiftSide.map(([label, value]) => [label, value?.ok ?? value]).slice(0, 5),
      [['create', true], ['create again is stale', false], ['bound update', true], ['hand edit refused', false], ['hand edit kept', '{"hand":"edit"}\n']])
    assert.deepEqual(swiftSide.slice(5).map(([label, value]) => [label, value?.ok ?? value]), [
      ['not a sidecar', 'invalidRequest'], ['notes create', true], ['notes bound update', true], ['notes stale', false],
      ['tokens create-only', true], ['tokens exists', false], ['notes kept', '[{"id":"a1","text":"x"}]\n'],
      ['symlinked file', 'unauthorized'], ['symlinked folder', 'unauthorized'], ['oversized', 'invalidRequest']])
    console.log(`parity: ${legacy.length} island/navigation/draft steps and ${legacySide.length} sidecar steps identical on both owners`)
    await fixture.stop()
  }

  // ── turns: the conversation coordinator decides an island's origin ─────
  {
    const profile = dir('turns'), root = dir('turns-project')
    const fixture = await start(profile)
    const { editing, conversation } = fixture.owners()
    const record = id => ({ id, projectKey: 'project', projectRoot: root, transcript: [] })
    await conversation.open('live', 'project', record('rec-live'), {}, true)
    await editing.islandsOpen('live', root, 'rec-live')
    await assert.rejects(editing.islandDefine('live', 1, 'T1'), /turn has finished/, 'A definition claiming a turn the chat is not in')
    const outside = await editing.islandDefine('live', 1, null)
    await editing.islandAbort('live', outside.token)
    await conversation.begin('live', 'T1')
    await assert.rejects(editing.islandDefine('live', 1, 'T0'), /turn has finished/, 'A stale attribution is refused')
    const admitted = await editing.islandDefine('live', 1, null)
    const [created] = await editing.islandCommit('live', admitted.token, def('turn'), 'agent', {})
    assert.equal(created.origin, 'T1', 'The owner binds the definition to the turn in flight')
    assert.equal((await editing.islandSettle('live', 'T0', true)).records[0].status, 'waiting')
    assert.equal(await editing.navigate('live', root, '/next', null), false, 'Navigation waits for the turn in flight')
    assert.deepEqual((await editing.navigationState()).map(r => [r.chat, r.turn, r.awaiting]), [['live', 'T1', true]])
    assert.equal((await editing.islandSettle('live', 'T1', true)).records[0].status, 'ready')
    assert.equal(await editing.navigation('live', 'landed', 'T1'), true)
    // The Bun side: only the chat and project that asked, only once its server runs.
    const loads = []
    let active = { root, chat: 'live', url: null }
    const controller = new NavigationController(editing, { active: () => active, load: async url => loads.push(url) }, () => null)
    await controller.boundary('live', 'landed', 'T1')
    assert.deepEqual(loads, [], 'Held until the server runs')
    active = { ...active, url: 'http://127.0.0.1:5173/old/page' }
    await controller.open()
    assert.deepEqual(loads, ['http://127.0.0.1:5173/next'])
    await controller.request({ root, key: 'other-chat', path: '/never' })
    assert.deepEqual(await editing.navigationState(), [], 'Never followed into another chat')
    await controller.request({ root, key: 'live', path: '/switch' })
    active = { root, chat: 'second', url: 'http://127.0.0.1:5173/' }
    await controller.open()
    assert.equal(loads.length, 1, 'Leaving the chat drops its request')
    await fixture.stop()
    // Bun's attribution of provider events to turn boundaries (the events reordered).
    const boundaries = new TurnBoundaries()
    const seen = events => events.flatMap(event => boundaries.events('k', event).map(b => `${b.kind}:${b.turn}`))
    assert.deepEqual(seen([{ type: 'delta', text: 'a', turn: 'T1' }, { type: 'done', turn: 'T1', landingPending: true },
      { type: 'delta', text: 'b', turn: 'T2' }, { type: 'isolation', state: 'merged' }]), ['begin:T1', 'begin:T2', 'landed:T1'],
    'A landing that finishes after the next turn began is still the earlier turn’s')
    assert.deepEqual(seen([{ type: 'done', stale: true, landingPending: false }, { type: 'error', message: 'x', turn: 'T2' },
      { type: 'done', turn: 'T2', landingPending: false }]), ['failed:T2', 'landed:T2'])
    assert.deepEqual(seen([{ type: 'done', turn: 'T3', landingPending: true }, { type: 'isolation', state: 'parked' }]), ['begin:T3', 'failed:T3'])
    console.log('turns: origin and navigation bound to the conversation owner’s turn; loads only in the asking chat')
  }

  // ── suites: legacy island/controls/content suites on the Swift owners ────
  for (const suite of ['chat-islands', 'shadow-controls', 'control-panels', 'content-controls', 'native-content', 'annotation-store']) {
    const profile = dir(`suite-${suite}`)
    const result = await new Promise(resolve => {
      const child = spawn('bun', ['--preload', './test/helpers/editing-owner-preload.mjs', `test/${suite}.mjs`], {
        cwd: repo, env: { ...process.env, EDITING_FIXTURE: binary, EDITING_PROFILE: profile }, stdio: ['ignore', 'pipe', 'pipe'] })
      let text = ''
      child.stdout.on('data', data => { text += data }); child.stderr.on('data', data => { text += data })
      child.on('exit', code => resolve({ code, text }))
    })
    assert.equal(result.code, 0, `${suite} on the Swift owners:\n${result.text}`)
    const frames = Number(result.text.match(/EDITING-PARITY editing=(\d+)/)?.[1] ?? 0)
    if (['chat-islands', 'shadow-controls', 'annotation-store'].includes(suite)) assert.ok(frames > 0, `${suite} went through the editing owner`)
    console.log(`suite ${suite}: passes on the Swift owners (${frames} editing frames)`)
  }

  // ── drafts: restart, stale base, damaged file ─────────────────────────
  {
    const profile = dir('drafts'), root = dir('drafts-project')
    const recipe = { version: 1, id: 'hero', title: 'Hero', sections: [{ id: 'main', title: 'Main', fields: [{ key: 'title', label: 'Title', type: 'text', required: true }] }] }
    let disk = { value: { title: 'Saved' }, revision: hex('v1') }
    const saves = []
    const invoke = async (channel, ...args) => {
      if (channel === 'content-controls:get') return { panel: { id: 'hero', file: 'hero.json', recipe }, value: structuredClone(disk.value), revision: disk.revision }
      if (channel === 'content-controls:save') {
        saves.push(args[2])
        if (args[2] !== disk.revision) throw new Error('Content changed on disk. Reload the panel before saving; your draft is preserved.')
        disk = { value: args[3], revision: hex(JSON.stringify(args[3])) }
        return { panel: { id: 'hero', file: 'hero.json', recipe }, value: disk.value, revision: disk.revision }
      }
    }
    let fixture = await start(profile)
    let controller = new NativeContentController(invoke, () => {}, fixture.owners().editing, 0)
    await controller.open(root, 'hero')
    const key = `${root}\nhero`
    const act = (action, extra = {}) => controller.action(key, { root, generation: controller.sessions.get(key).generation, action, ...extra })
    await act('draft', { field: 'main:title', value: 'Unsaved words' })
    await controller.flush()
    await fixture.kill()
    fixture = await start(profile)
    controller = new NativeContentController(invoke, () => {}, fixture.owners().editing, 0)
    await controller.open(root, 'hero')
    let session = controller.sessions.get(key)
    assert.equal(session.draft.title, 'Unsaved words', 'The draft survives a service crash and restart')
    assert.ok(session.dirty); assert.equal(session.error, '')
    await act('save')
    assert.equal(disk.value.title, 'Unsaved words'); await controller.flush()
    assert.deepEqual(await fixture.owners().editing.contentDrafts(root), [], 'Save clears the draft')
    // A draft whose document changed meanwhile is a conflict: its save stays bound to its base.
    await act('draft', { field: 'main:title', value: 'Old draft' }); await controller.flush()
    await fixture.stop()
    disk = { value: { title: 'Changed elsewhere' }, revision: hex('v3') }
    fixture = await start(profile)
    controller = new NativeContentController(invoke, () => {}, fixture.owners().editing, 0)
    await controller.open(root, 'hero')
    session = controller.sessions.get(key)
    assert.equal(session.draft.title, 'Old draft'); assert.match(session.error, /older version/)
    await act('save')
    assert.match(controller.sessions.get(key).error, /changed on disk/)
    assert.equal(disk.value.title, 'Changed elsewhere', 'A stale draft is never saved over newer content')
    await act('reload'); await controller.flush()
    assert.deepEqual(await fixture.owners().editing.contentDrafts(root), [], 'Reload discards the draft')
    const damaged = join(profile, 'service/editing/content-drafts', `${contentHash(root)}.json`)
    mkdirSync(join(profile, 'service/editing/content-drafts'), { recursive: true })
    writeFileSync(damaged, '{broken')
    await assert.rejects(fixture.owners().editing.saveContentDraft(root, 'hero', hex(1), {}), /unreadable/)
    assert.equal(readFileSync(damaged, 'utf8'), '{broken', 'A damaged drafts file is left untouched')
    await fixture.stop()
    console.log('drafts: restored after a crash, cleared on save/reload, stale base refused, damaged file untouched')
  }

  // ── lanes: a sidecar commit waits for another chain's lease, runs inside its own ──
  {
    const profile = dir('lanes'), root = dir('lanes-project')
    const fixture = await start(profile)
    const { editing, repository } = fixture.owners()
    let release
    const held = repository.withLease(root, () => new Promise(resolve => { release = resolve }))
    while (!release) await new Promise(resolve => setTimeout(resolve, 5))
    let done = false
    const outside = editing.sidecar(root, 'content-controls.json', null, '{"a":1}\n').then(value => { done = true; return value })
    await new Promise(resolve => setTimeout(resolve, 200))
    assert.equal(done, false, 'Queued behind the held lease')
    release(); await held
    assert.equal((await outside).ok, true)
    const inside = await repository.withLease(root, () => editing.sidecar(root, 'content-controls.json', contentHash('{"a":1}\n'), '{"a":2}\n'))
    assert.equal(inside.ok, true, 'A chain holding the lease commits inside it')
    await fixture.stop()
    console.log('lanes: sidecar commits are ordered in the repository lane')
  }

  // ── crash: SIGKILL inside an island history write ─────────────────────
  {
    const profile = dir('crash'), root = dir('crash-project')
    let fixture = await start(profile)
    let editing = fixture.owners().editing
    await editing.islandsOpen('A', root, 'rec')
    const first = await editing.islandDefine('A', 1, 'T1')
    await editing.islandCommit('A', first.token, def('first'), 'agent', {})
    await editing.islandSettle('A', 'T1', true)
    await fixture.stop()
    const file = islandFile(join(profile, 'chat-islands'), root, 'rec')
    const before = readFileSync(file, 'utf8')
    for (const [point, expected] of [['island.write', 1], ['island.written', 2]]) {
      fixture = await start(profile, { EDITING_FAULT: point })
      // The commit below is never answered: a short deadline lets the test process end.
      editing = fixture.owners({ timeout: 1000 }).editing
      await editing.islandsOpen('A', root, 'rec')
      const next = await editing.islandDefine('A', 2, 'T2')
      editing.islandCommit('A', next.token, def('second'), 'agent', {}).catch(() => {})
      assert.equal((await fixture.exited).signal, 'SIGKILL')
      fixture = await start(profile)
      const records = await fixture.owners().editing.islandsOpen('A', root, 'rec')
      assert.equal(records.length, expected, `${point}: history is whole (${expected})`)
      assert.equal(records[0].status, 'ready')
      if (expected === 1) assert.equal(readFileSync(file, 'utf8'), before, 'Nothing torn before the rename')
      else assert.equal(records[1].status, 'unavailable', 'A definition whose turn never landed is unavailable after restart')
      await fixture.stop()
    }
    console.log('crash: an island write killed midway leaves the previous history whole')
  }

  // ── rollback: both owners continue on the other's files ───────────────
  {
    const profile = dir('rollback'), root = dir('rollback-project')
    let fixture = await start(profile)
    const swift = fixture.owners().editing
    await swift.islandsOpen('A', root, 'rec')
    const made = await swift.islandDefine('A', 1, 'T1')
    await swift.islandCommit('A', made.token, def('swift'), 'agent', { x: 1 })
    await swift.islandSettle('A', 'T1', true)
    await swift.saveContentDraft(root, 'hero', hex(1), { title: 'kept' })
    await fixture.stop()
    const draftsDir = join(profile, 'service/editing/content-drafts')
    const draftBytes = readFileSync(join(draftsDir, `${contentHash(root)}.json`), 'utf8')
    // Launch-time switch to the legacy owner: it reads and continues the same history.
    const legacy = legacyEditing({ islands: join(profile, 'chat-islands') })
    const records = await legacy.islandsOpen('A', root, 'rec')
    assert.deepEqual(records.map(r => [r.manifest.title, r.status]), [['swift', 'ready']])
    const later = await legacy.islandDefine('A', 2, 'T2')
    await legacy.islandCommit('A', later.token, def('legacy'), 'agent', {})
    await legacy.islandSettle('A', 'T2', true)
    assert.deepEqual(await legacy.contentDrafts(root), [], 'The legacy owner keeps drafts in memory only')
    assert.equal(readFileSync(join(draftsDir, `${contentHash(root)}.json`), 'utf8'), draftBytes, 'and never touches the Swift drafts')
    // Back to Swift: newer work written by the legacy owner is kept.
    fixture = await start(profile)
    const back = fixture.owners().editing
    assert.deepEqual((await back.islandsOpen('A', root, 'rec')).map(r => [r.manifest.title, r.status]), [['swift', 'ready'], ['legacy', 'ready']])
    assert.deepEqual((await back.contentDrafts(root)).map(d => d.value.title), ['kept'])
    await fixture.stop()
    console.log('rollback: history continues across owners; Swift drafts preserved through a legacy launch')
  }

  // ── drain and schema ─────────────────────────────────────────────────
  {
    const profile = dir('schema'), root = dir('schema-project')
    const fixture = await start(profile)
    const code = async (method, body, request, top) => { const result = await fixture.editingFrame(method, body, request, top); return result.kind === 'failed' ? result.payload.code : 'ok' }
    assert.equal(await code('islandsOpen', { chat: 'A', root, record: 'r' }), 'ok')
    assert.equal(await code('nope', {}), 'invalidRequest')
    assert.equal(await code('islandsOpen', { chat: 'A', root, record: 'r', extra: 1 }), 'invalidRequest')
    assert.equal(await code('islands', { chat: 'A' }, { mode: 'mutation' }), 'invalidRequest')
    assert.equal(await code('islandsOpen', { chat: 'A', root: 'relative', record: 'r' }), 'invalidRequest')
    assert.equal(await code('islandDefine', { chat: 'A', turn: -1 }), 'invalidRequest')
    assert.equal(await code('islandDefine', { chat: 'A', turn: 1.5 }), 'invalidRequest')
    assert.equal(await code('islandCommand', { chat: 'A', id: 'x', revision: 1, action: 'replay', sourceRevision: 's' }), 'invalidRequest')
    assert.equal(await code('islandCommit', { chat: 'A', token: 't', definition: { manifest: {}, blocks: [], code: 'x' }, engine: 'agent', initial: {} }), 'invalidRequest')
    assert.equal(await code('islandCommit', { chat: 'A', token: 't', definition: { manifest: {}, blocks: [] }, engine: 'eval', initial: {} }), 'invalidRequest')
    assert.equal(await code('saveContentDraft', { root, panel: 'p', revision: 'not-a-hash', value: {} }), 'invalidRequest')
    assert.equal(await code('sidecar', { root, name: '../x.json', expectedHash: null, content: '' }), 'invalidRequest')
    assert.equal(await code('islands', { chat: 'A' }, { expectedRevision: { epoch: 'e', counter: '1' }, mode: 'read' }), 'invalidRequest')
    assert.equal(await code('islands', { chat: 'A' }, { scope: { project: 'p' }, mode: 'read' }), 'unauthorized')
    assert.equal((await fixture.cmd({ cmd: 'close' })).closed, true)
    assert.equal(await code('islands', { chat: 'A' }, { mode: 'read' }), 'unavailable', 'A drained owner refuses new requests')
    await fixture.stop()
    console.log('schema and drain: malformed, unknown, scoped and post-drain requests refused')
  }
  console.log('EDITING-OWNER OK — parity, turns, suites, drafts, lanes, crash, rollback, drain and schema')
} finally {
  for (const fixture of fixtures) await fixture.kill().catch(() => {})
  rmSync(scratch, { recursive: true, force: true })
}
