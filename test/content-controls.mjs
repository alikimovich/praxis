import { selectControlCandidates } from '../src/main/control-selection.ts'
import { MissingJevCredentialError } from '../src/main/jev-credentials.ts'
import assert from 'node:assert/strict'
import { mkdtemp, writeFile, mkdir, symlink, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { getAvailableContentControls, defineContentControls, listContentControls, getContentControls, removeContentControls, validateContentFile } from '../src/main/content-controls.ts'
import { chooseControlsWithJev, cancelControlComposition } from '../src/main/controls-jev.ts'
const root = await mkdtemp(join(tmpdir(), 'praxis-content-unit-'))
const recipe = { version: 1, id: 'hero', title: 'Hero content', sections: [{ id: 'copy', title: 'Copy', fields: [{ key: 'title', label: 'Title', type: 'text', required: true }] }] }
try {
  await writeFile(join(root, 'content.json'), JSON.stringify({ title: 'Hello', unknown: { retained: true } }))
  const panel = await defineContentControls(root, root, { file: 'content.json', recipe })
  assert.equal(panel.id, 'hero')
  assert.equal((await listContentControls(root)).length, 1)
  const document = await getContentControls(root, 'hero')
  assert.equal(document.value.title, 'Hello')
  assert.equal(document.revision.length, 64)
  await defineContentControls(root, root, { file: 'content.json', recipe: { ...recipe, title: 'Updated' } })
  assert.equal((await listContentControls(root)).length, 1)
  assert.notEqual((await getContentControls(root, 'hero')).revision, document.revision, 'recipe changes invalidate old editors')
  // Registration reads private source; the live editor waits until landing.
  const privateRoot = await mkdtemp(join(tmpdir(), 'praxis-content-private-'))
  try {
    await writeFile(join(privateRoot, 'pending.json'), JSON.stringify({ title: 'Landed' }))
    await defineContentControls(privateRoot, root, { file: 'pending.json', recipe: { ...recipe, id: 'pending' } })
    assert.equal(await getAvailableContentControls(root, 'pending'), null)
    await writeFile(join(root, 'pending.json'), JSON.stringify({ title: 'Landed' }))
    assert.equal((await getAvailableContentControls(root, 'pending')).value.title, 'Landed')
    await writeFile(join(root, 'pending.json'), 'invalid')
    await assert.rejects(getAvailableContentControls(root, 'pending'), SyntaxError)
    await removeContentControls(root, 'pending')
  } finally { await rm(privateRoot, { recursive: true, force: true }) }
  for (const path of ['../bad.json', '/bad.json', '.praxis/bad.json', 'node_modules/data.json', 'package.json', 'src/../../bad.json', 'bad.ts']) assert.throws(() => validateContentFile(path))
  await assert.rejects(defineContentControls(root, root, { file: 'content.json', recipe: { ...recipe, sections: [] } }))
  await writeFile(join(root, 'bad.json'), '{"title": 12}')
  await assert.rejects(defineContentControls(root, root, { file: 'bad.json', recipe }))
  await symlink('/tmp', join(root, 'escape'))
  await assert.rejects(defineContentControls(root, root, { file: 'escape/test.json', recipe }))
  await removeContentControls(root, 'hero')
  assert.deepEqual(await listContentControls(root), [])
  await writeFile(join(root, '.praxis/content-controls.json'), '{ broken')
  await assert.rejects(defineContentControls(root, root, { file: 'content.json', recipe }))
  let calls = 0
  const evaluate = async ({ questions }) => {
    calls++
    return { answers: Object.fromEntries(Object.entries(questions).map(([key, q]) => [key, { type: 'choice', choice: key === 'root' ? 'panel' : Object.keys(q.criteria).find(k => k.startsWith('use:')) }])) }
  }
  assert.deepEqual(await chooseControlsWithJev('test', 'Edit copy', recipe.sections, { evaluate }), recipe.sections)
  assert.equal(calls, 1)
  await assert.rejects(chooseControlsWithJev('test', '', recipe.sections, { evaluate }))
  await assert.rejects(chooseControlsWithJev('test', 'Copy', recipe.sections, { evaluate: async ({questions}) => ({ answers: Object.fromEntries(Object.keys(questions).map(key => [key, {type:'choice', choice: 'unavailable'}])) }) }))
  const cancelled = chooseControlsWithJev('cancel', 'Copy', recipe.sections, { evaluate: async () => { cancelControlComposition('cancel'); return { answers: {} } } })
  await assert.rejects(cancelled)
  for (const engine of ['auto', 'jev']) {
    const fallback = await selectControlCandidates('missing', recipe.sections, { engine, prompt: 'Copy' }, async () => { throw new MissingJevCredentialError('Missing key') })
    assert.equal(fallback.engine, 'agent')
    assert.equal(fallback.controls, recipe.sections)
    assert.match(fallback.fallback, /Jev was not called/)
    const selected = await selectControlCandidates('ready', recipe.sections, { engine, prompt: 'Copy' }, async () => [recipe.sections[0]])
    assert.equal(selected.engine, 'jev')
    assert.equal(selected.fallback, undefined)
    for (const error of [new Error('HTTP 401'), new Error('Multiple connections'), new DOMException('Cancelled', 'AbortError')]) {
      await assert.rejects(selectControlCandidates('error', recipe.sections, { engine, prompt: 'Copy' }, async () => { throw error }), e => e === error)
    }
  }
  assert.equal((await selectControlCandidates('agent', recipe.sections, { engine: 'agent' }, async () => { throw new Error('Must not call Jev') })).engine, 'agent')
  console.log('CONTENT-CONTROLS OK — recipe persistence, validation, paths, corrupt store, Jev selection, failure and cancellation')
} finally { await rm(root, { recursive: true, force: true }) }
