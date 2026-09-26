import assert from 'node:assert/strict'
import { mkdtemp, readFile, writeFile, symlink, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { chatIslandGuidance, chatIslandControlPurposes } from '../src/shared/chat-island-guidance.ts'
import { chatIslandShape } from '../bin/chat-island-schema.mjs'
import { ChatIslands } from '../src/main/chat-islands.ts'
import { islandDefinition } from '../src/main/chat-island-schema.ts'
import { chooseControlsWithJev } from '../src/main/controls-jev.ts'
import { enqueueRepoWrite } from '../src/main/repo-write-queue.ts'
const root = await mkdtemp(join(tmpdir(), 'praxis-islands-'))
const storage = await mkdtemp(join(tmpdir(), 'praxis-island-store-'))
const code = 'const LIGHT_X = 0;\nconst LIGHT_Y = -0.5;\nconst SOFTNESS = 20;\nconst EASE = [0.25, 0.1, 0.25, 1];\n'
const number = (id, anchor, min = -1, max = 1) => ({ id, label: id, kind: 'number', min, max, step: 0.01, apply: { strategy: 'literal', anchor } })
const request = { action: 'define', engine: 'agent', manifest: { file: 'shadow.js', component: 'Card', title: 'Shadow lighting', params: [number('x', 'const LIGHT_X = '), number('y', 'const LIGHT_Y = '), number('blur', 'const SOFTNESS = ', 0, 100), { id: 'ease', label: 'Easing', kind: 'bezier', apply: { strategy: 'literal', anchor: 'const EASE = ' } }] }, blocks: [{ id: 'light', title: 'Light position', kind: 'point', params: ['x','y'] }, { id: 'layers', title: 'Softness and easing', kind: 'group', params: ['blur','ease'] }] }
let changes = 0
const islands = new ChatIslands(storage, () => changes++)
try {
  // Catalog guidance is available before registration and stays within the wire catalog.
  const catalog = await islands.tool('not-registered', root, { action: 'catalog' })
  assert.equal(catalog.guidance, chatIslandGuidance)
  assert.deepEqual(catalog.controlPurposes, chatIslandControlPurposes)
  assert.deepEqual(Object.keys(catalog.controlPurposes).sort(), [...catalog.fields, ...catalog.blocks].sort())
  const blockKinds = chatIslandShape.blocks.unwrap().element.shape.kind.options
  assert.deepEqual(catalog.blocks, blockKinds, 'Catalog must not advertise unrenderable block types')
  await writeFile(join(root, 'shadow.js'), code)
  // Publish a disabled draft before a slow Jev response; do not persist drafts.
  let releaseSelection
  const staged = new ChatIslands(storage, () => {}, async (_key, candidates) => {
    await new Promise(resolve => { releaseSelection = resolve })
    return { controls: candidates, engine: 'jev' }
  })
  staged.register('slow', root, 'slow-record', () => 1)
  const pending = staged.tool('slow', root, request)
  while (!releaseSelection) await new Promise(resolve => setTimeout(resolve, 1))
  const draft = staged.attachments('slow')[0].view
  assert.equal(draft.engine, 'preparing')
  assert.equal(draft.status, 'waiting')
  assert.equal(draft.fields[0].value, 0)
  assert.equal(staged.sessions.get('slow').records.length, 0)
  await assert.rejects(staged.interact({chat:'slow',id:draft.id,revision:draft.revision,sourceRevision:draft.sourceRevision,action:'commit',values:{x:.5}}), /busy/)
  releaseSelection()
  assert.ok((await pending).id)
  assert.equal(staged.attachments('slow').length, 1)
  assert.equal(staged.attachments('slow')[0].view.engine, 'jev')
  const cancelledDraft = staged.tool('slow', root, request)
  releaseSelection = undefined
  while (!releaseSelection) await new Promise(resolve => setTimeout(resolve, 1))
  await staged.settle('slow', false)
  releaseSelection()
  assert.match((await cancelledDraft).error, /turn finished/)
  assert.equal(staged.sessions.get('slow').preview, undefined)
  assert.equal(staged.sessions.get('slow').records.length, 1, 'Cancelled drafts never persist')
  staged.close('slow')

  islands.register('chat', root, 'durable-session', () => 1)
  const made = await islands.tool('chat', root, request)
  assert.ok(made.id, JSON.stringify(made))
  assert.equal(made.engine, 'agent')
  const view = () => islands.sessions.get('chat').views.get(made.id)
  const command = (action, values = {}) => ({ chat: 'chat', id: made.id, revision: view().revision, sourceRevision: view().sourceRevision, operation: crypto.randomUUID(), action, values })
  assert.equal(view().status, 'waiting')
  await assert.rejects(islands.interact(command('commit', { x: .5 })), /not landed/)
  await islands.settle('chat', true)
  const oldCommand = command('commit', { x: .3, y: .8 })
  await islands.interact(oldCommand)
  assert.match(await readFile(join(root, 'shadow.js'), 'utf8'), /LIGHT_X = 0.3;\nconst LIGHT_Y = 0.8/)
  await assert.rejects(islands.interact(oldCommand), /Source changed/)
  await islands.interact(command('undo'))
  assert.equal(await readFile(join(root, 'shadow.js'), 'utf8'), code, 'Point gesture undoes both coordinates')
  await islands.interact(command('commit', { ease: 'cubic-bezier(0.1, -0.2, 0.8, 1.2)' }))
  assert.match(await readFile(join(root, 'shadow.js'), 'utf8'), /EASE = \[0.1, -0.2, 0.8, 1.2\]/)
  await islands.interact(command('reset'))
  assert.equal(await readFile(join(root, 'shadow.js'), 'utf8'), code)
  // Native slider bursts arrive before earlier disk writes/snapshots complete.
  const burst = [.2, .4, .6, .8].map(x => ({ ...command('commit', { x }), gesture: 'drag-1' }))
  await Promise.all(burst.map(c => islands.interact(c)))
  assert.match(await readFile(join(root, 'shadow.js'), 'utf8'), /LIGHT_X = 0.8/)
  await islands.interact(command('undo'))
  assert.equal(await readFile(join(root, 'shadow.js'), 'utf8'), code, 'One Undo restores the whole drag')
  // Rebasing queued controls must never bless an unrelated source write.
  let unblock
  const held = enqueueRepoWrite(root, () => new Promise(r => { unblock = r }))
  await new Promise(r => setTimeout(r, 0))
  const racing = [.3, .7].map(x => islands.interact(command('commit', { x })))
  const rejected = Promise.all(racing.map(p => assert.rejects(p, /Source changed/)))
  await writeFile(join(root, 'shadow.js'), code + '// concurrent editor change\n')
  unblock(); await held; await rejected
  assert.equal(await readFile(join(root, 'shadow.js'), 'utf8'), code + '// concurrent editor change\n')
  await writeFile(join(root, 'shadow.js'), code)
  await islands.refresh('chat')
  const before = await readFile(join(root, 'shadow.js'), 'utf8')
  await assert.rejects(islands.interact(command('commit', { x: .9, unknown: 'bad' })), /Unknown/)
  assert.equal(await readFile(join(root, 'shadow.js'), 'utf8'), before, 'Invalid batch must not partially write')
  const stale = command('commit', { x: .9 })
  await writeFile(join(root, 'shadow.js'), code + '// external edit\n')
  await assert.rejects(islands.interact(stale), /Source changed/)
  await islands.interact(command('reload'))
  const updated = await islands.tool('chat', root, { ...request, id: made.id, revision: 1, blocks: [...request.blocks].reverse() })
  assert.equal(updated.revision, 2)
  assert.equal((await islands.tool('chat', root, { ...request, id: made.id, revision: 1 })).error.includes('revision'), true)
  await islands.settle('chat', true)
  islands.close('chat')
  islands.register('resumed-key', root, 'durable-session', () => 2)
  await islands.refresh('resumed-key')
  const restored = islands.attachments('resumed-key')
  assert.equal(restored.length, 1)
  assert.equal(restored[0].view.id, made.id)
  assert.equal(restored[0].turn, 1)
  assert.equal(restored[0].view.revision, 2)
  assert.equal(restored[0].view.status, 'ready')
  assert.equal(restored[0].view.blocks[0].id, 'layers')
  await assert.rejects(islands.interact({ ...stale, chat: 'unrelated' }), /unavailable/)
  await islands.tool('resumed-key', root, { ...request, id: made.id, revision: 2 })
  await islands.settle('resumed-key', false)
  await islands.settle('resumed-key', true)
  assert.equal(islands.attachments('resumed-key')[0].view.status, 'unavailable', 'Duplicate success must not revive failed creation')
  for (const blocks of [[{ ...request.blocks[0], params: ['x'] }], [{ ...request.blocks[0], params: ['x','unknown'] }], [request.blocks[0], request.blocks[0]]]) assert.throws(() => islandDefinition({ ...request, blocks }))
  await symlink(join(storage, 'outside.js'), join(root, 'escape.js'))
  await writeFile(join(storage, 'outside.js'), code)
  assert.match((await islands.tool('resumed-key', root, { ...request, manifest: { ...request.manifest, file: 'escape.js' } })).error, /escapes/)
  // Queued gestures may not run after their owning chat closes.
  islands.register('queued', root, 'other-session', () => 1)
  const queued = await islands.tool('queued', root, request); await islands.settle('queued', true)
  let release
  const barrier = enqueueRepoWrite(root, () => new Promise(r => { release = r }))
  await new Promise(r => setTimeout(r, 0))
  const v = islands.attachments('queued')[0].view
  const applying = islands.interact({ ...stale, chat: 'queued', id: queued.id, revision: v.revision, sourceRevision: v.sourceRevision })
  islands.close('queued'); release(); await barrier
  await assert.rejects(applying, /closed/)
  // Installed json-render composition API: Jev chooses whole prepared blocks.
  let evaluations = 0
  const chosen = await chooseControlsWithJev('island-test', 'Light direction and shadow layers', request.blocks, {
    evaluate: async ({ questions }) => {
      evaluations++
      return { answers: Object.fromEntries(Object.entries(questions).map(([key, q]) => [key, { type: 'choice', choice: key === 'root' ? 'panel' : key.startsWith('order_') ? key === 'order_node_1' ? '2' : '1' : Object.keys(q.criteria).find(k => k.startsWith('use:')) }])) }
    }
  })
  // The same composition seam accepts physics, time-based, mixed and non-motion controls.
  for (const [title, groups] of [
    ['Tween', [['duration','delay','easing']]],
    ['Spring', [['stiffness','damping','mass']]],
    ['Combined', [['stiffness','damping'], ['duration','easing']]],
    ['Typography', [['font-size','weight'], ['line-height','tracking']]]
  ]) {
    const candidates = groups.map((params, index) => ({ id: `group-${index}`, title, kind: 'group', params }))
    const result = await chooseControlsWithJev('scenario-' + title, title, candidates, {
      evaluate: async ({ questions }) => ({ answers: Object.fromEntries(Object.entries(questions).map(([key, q]) => [key, { type: 'choice', choice: key === 'root' ? 'panel' : key.startsWith('order_') ? key.split('_').at(-1) : Object.keys(q.criteria).find(k => k.startsWith('use:')) }])) })
    })
    assert.deepEqual(result.flatMap(b => b.params).sort(), groups.flat().sort())
  }
  assert.equal(evaluations, 2)
  assert.deepEqual(chosen.map(b => b.id), ['layers', 'light'])
  assert.deepEqual(chosen[1].params, ['x', 'y'], 'Compound bindings stay together')
  await assert.rejects(chooseControlsWithJev('island-invalid', 'Controls', request.blocks, { evaluate: async () => { throw new Error('Evaluator failed') } }), /Evaluator failed/)
  assert.ok(changes > 3)
  console.log('CHAT-ISLANDS OK — composition, source batches, stale/closed guards, landing, undo and durable restoration')
} finally { await rm(root, { recursive: true, force: true }); await rm(storage, { recursive: true, force: true }) }
