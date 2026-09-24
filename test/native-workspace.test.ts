import { afterAll, expect, mock, test } from 'bun:test'
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

test('cold native launch retains every project and activates the previous selection', async () => {
  let restored: unknown[] = []
  let active: unknown
  mock.module('../src/renderer/src/store', () => ({
    readPersistedWorkspace: (raw: string) => JSON.parse(raw),
    useWorkspace: { getState: () => ({ hydrate: (entries: unknown[]) => { restored = entries } }) },
    useLog: { getState: () => ({ append: (message: string) => { throw new Error(message) } }) },
    useSession: { getState: () => ({}) }, useChat: { getState: () => ({}) },
    chatAgentSettingsFromOptions: () => ({}), messagesFromTranscript: () => []
  }))
  Object.assign(globalThis, { window: {
    praxisNativeShell: { readWorkspace: async () => JSON.stringify(saved) },
    api: { agent: { workspaceSnapshot: async () => ({ projects: [] }) } }
  } })
  const { restoreWorkspace } = await import('../src/renderer/src/restore')
  await restoreWorkspace({
    attempt: async () => { throw new Error('Should restore via suspended-project path') },
    applyProject: async entry => { active = entry }
  })
  expect(restored).toEqual(projects)
  expect(active).toEqual(projects[1])
})
