import assert from 'node:assert/strict'
import { NativeWorkspaceController } from '../src/native/workspace-controller.ts'
const tick = () => new Promise(resolve => setTimeout(resolve, 0))
const gate = () => { let resolve; const promise = new Promise(r => resolve = r); return { promise, resolve } }
const projects = new Map(), calls = [], renders = [], active = []
let saved = null, slow, failed = false, counter = 0
const controller = new NativeWorkspaceController({
  read: () => saved, write: raw => { saved = raw },
  render: state => renders.push(state), activate: async entry => { active.push(entry?.key ?? null) },
  closeChat() {}, reusableChat: () => false,
  invoke: async (channel, ...args) => {
    calls.push([channel, ...args])
    const root = args[0]
    if (channel === 'agent:workspace-snapshot') return { projects: [...projects.values()] }
    if (channel === 'agent:open-project') {
      projects.set(root, { root, projectKey: root, chats: [{ sessionKey: root, options: {}, isRunning: false, record: { transcript: [] } }], activeSessionKey: root })
      return { transcript: [] }
    }
    if (channel === 'project:detect') {
      if (root === '/slow' && slow) await slow.promise
      if (root === '/failure' && failed) throw new Error('Preview failure')
      return { name: root.slice(1), devCommand: 'bun run dev', framework: 'vite', previewKind: 'web' }
    }
    if (channel === 'git:ensure') return { branch: 'praxis/test' }
    if (channel === 'devserver:info') return { running: false }
    if (channel === 'devserver:start') return { url: 'http://127.0.0.1:7784' }
    if (channel === 'sessions:list') return []
    if (channel === 'agent:new-chat' || channel === 'agent:resume-session') {
      const sessionKey = root + '#' + (++counter)
      projects.get(root).chats.push({ sessionKey, options: {}, isRunning: false, record: { transcript: [] } })
      return { ok: true, sessionKey }
    }
    if (channel === 'agent:close-chat') {
      const project = projects.get(root)
      project.chats = project.chats.filter(c => c.sessionKey !== args[1])
      return { ok: true, activeSessionKey: project.chats[0]?.sessionKey }
    }
    if (channel === 'agent:close-project') projects.delete(root)
    return { ok: true }
  }
})
await controller.command({ type: 'attach' })
await controller.open('/one')
assert.equal(controller.state.status.kind, 'running')
await controller.command({ type: 'new-chat', key: '/one' })
const second = controller.active.activeSessionKey
assert.notEqual(second, '/one')
await controller.command({ type: 'chat', key: '/one', session: '/one' })
assert.equal(controller.active.activeSessionKey, '/one')
await assert.rejects(controller.command({ type: 'chat', key: '/one', session: '/other' }))
await controller.command({ type: 'close-chat', key: '/one', session: second })
assert.deepEqual(controller.active.sessionKeys, ['/one'])
slow = gate()
const opening = controller.open('/slow')
await tick()
await controller.open('/two')
slow.resolve()
await opening
assert.equal(controller.state.activeKey, '/two')
assert.equal(active.at(-1), '/two')
assert.equal(controller.state.status.name, 'two')
slow = gate()
const closingOpen = controller.select('/slow')
await tick()
const closing = controller.close('/slow')
slow.resolve()
await Promise.all([closingOpen, closing])
assert.equal(projects.has('/slow'), false)
assert.ok(calls.some(c => c[0] === 'devserver:stop' && c[1] === '/slow'))
assert.ok(!controller.state.projects.some(p => p.key === '/slow'))
failed = true
await controller.open('/failure')
assert.equal(controller.state.status.kind, 'error')
assert.equal(active.at(-1), '/failure')
assert.ok(projects.has('/failure'), 'failed preview must retain repair chat')
await controller.close('/failure')
assert.equal(controller.state.activeKey, '/two')
assert.equal(JSON.parse(saved).activeKey, '/two')
assert.equal(renders.at(-1).activeKey, '/two')
console.log('Native workspace: project/chat commands, stale opening, close during startup, repair chat and persistence passed')
