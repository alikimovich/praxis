import assert from 'node:assert/strict'
import { mkdtemp, writeFile, mkdir, symlink, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { defineContentControls, listContentControls, getContentControls, removeContentControls, validateContentFile } from '../src/main/content-controls.ts'
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
  console.log('CONTENT-CONTROLS OK — recipe persistence, validation, paths, corrupt store, Jev selection, failure and cancellation')
} finally { await rm(root, { recursive: true, force: true }) }
