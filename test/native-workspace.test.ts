import { afterAll, expect, test } from 'bun:test'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { workspaceStorage } from '../src/native/workspace'

const profile = mkdtempSync(join(tmpdir(), 'praxis-workspace-'))
afterAll(() => rmSync(profile, { recursive: true, force: true }))
const projects = [
  { root: '/projects/one', key: 'one', name: 'One', touchedAt: 1 },
  { root: '/projects/two', key: 'two', name: 'Two', touchedAt: 2 }
]
const saved = { projects, activeKey: 'two' }

test('workspace survives reopening storage; closing projects stays persisted', () => {
  const storage = workspaceStorage(profile)
  expect(storage.read()).toBeNull()
  storage.write(JSON.stringify(saved))
  expect(JSON.parse(workspaceStorage(profile).read()!)).toEqual(saved)
  expect(() => storage.write('invalid')).toThrow()
  expect(JSON.parse(storage.read()!)).toEqual(saved)
  storage.write(JSON.stringify({ projects: [], activeKey: null }))
  expect(JSON.parse(workspaceStorage(profile).read()!).projects).toEqual([])
})
