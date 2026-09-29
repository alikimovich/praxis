import { afterAll, expect, test } from 'bun:test'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { legacyWorkspace } from '../src/native/workspace'

const scratch = mkdtempSync(join(tmpdir(), 'trezi-workspace-'))
afterAll(() => rmSync(scratch, { recursive: true, force: true }))
let cases = 0
const profile = (content?: string) => {
  const dir = join(scratch, `case-${++cases}`)
  mkdirSync(dir)
  if (content !== undefined) writeFileSync(join(dir, 'workspace.json'), content)
  return dir
}
const read = (dir: string) => readFileSync(join(dir, 'workspace.json'), 'utf8')

test('the legacy writer persists open/select/reorder/close and survives reopening', async () => {
  const dir = profile()
  let clock = 100
  const store = legacyWorkspace(dir, { now: () => clock++ })
  expect(store.snapshot()).toEqual({ projects: [], activeKey: null, recents: [] })
  expect(existsSync(join(dir, 'workspace.json'))).toBe(false)
  expect(await store.open('/projects/one/')).toEqual({ key: '/projects/one', created: true })
  expect(await store.open('/projects/one')).toEqual({ key: '/projects/one', created: false })
  await store.open('/projects/two', { provider: 'claude' })
  await store.select('/projects/two')
  await store.reorder('/projects/two', '/projects/one')
  expect(statSync(join(dir, 'workspace.json')).mode & 0o777).toBe(0o600)
  const reopened = legacyWorkspace(dir).snapshot()
  expect(reopened.projects.map(p => p.key)).toEqual(['/projects/two', '/projects/one'])
  expect(reopened.activeKey).toBe('/projects/two')
  expect(reopened.projects[0].chatSettings).toEqual({ '/projects/two': { provider: 'claude' } })
  expect(reopened.projects[0].touchedAt).toBe(103)
  await store.close('/projects/two')
  expect(legacyWorkspace(dir).snapshot()).toMatchObject({ activeKey: null, projects: [{ key: '/projects/one' }] })
  await expect(store.select('/projects/two')).rejects.toThrow(/no longer open/)
})

test('an invalid file is refused and left untouched; refused operations write nothing', async () => {
  for (const bad of ['invalid', 'null', '[]', '{"projects":{}}', '﻿{"projects":[]}']) {
    const dir = profile(bad)
    expect(() => legacyWorkspace(dir)).toThrow()
    expect(read(dir)).toBe(bad)
  }
  const dir = profile('{"projects":[],"activeKey":null}')
  const store = legacyWorkspace(dir)
  await expect(store.open('relative')).rejects.toThrow(/absolute/)
  await expect(store.update([{ key: '/x', fields: { root: '/y' } }])).rejects.toThrow(/Invalid project field/)
  await expect(store.update([{ key: '/x', fields: { sessionKeys: [] } }])).rejects.toThrow(/Invalid project field/)
  expect(read(dir)).toBe('{"projects":[],"activeKey":null}')
  // No change, no write: the file keeps its exact bytes.
  await store.update([{ key: '/missing', fields: { branch: 'x' } }])
  expect(read(dir)).toBe('{"projects":[],"activeKey":null}')
})
