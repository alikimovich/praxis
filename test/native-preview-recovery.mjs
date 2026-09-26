import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { NativePreviewRecovery } from '../src/native/preview-recovery.ts'
import { NativeSheetController } from '../src/native/sheets-runtime.ts'
import { findPreviewProcesses, stopPreviewProcess, samePreviewProcess, parseListeners } from '../src/native/preview-processes.ts'

assert.deepEqual([...parseListeners('p23\nn127.0.0.1:7777\np24\nn[::1]:7780\n')], [[23, ['127.0.0.1:7777']], [24, ['[::1]:7780']]])
const entry = { key: 'a', root: '/a' }, calls = []
const workspace = { state: { projects: [entry], activeKey: 'a' }, command: async c => calls.push(c) }
const sheets = new NativeSheetController({ send() {} }, workspace, {})
const server = { pid: 456, root: '/a', command: 'next-server', started: 'now', addresses: ['127.0.0.1:7784'] }
const recovery = new NativePreviewRecovery(sheets, async () => [server], async s => calls.push(s))
const settled = async () => { for (let i = 0; i < 100 && sheets.current?.state.busy; i++) await new Promise(r => setTimeout(r, 5)) }
const act = (action, values = {}) => sheets.action({ id: sheets.current.state.id, action, values })
recovery.open('a'); await settled()
assert.equal(sheets.current.state.title, 'Running servers')
await act('stop', { server: '999' }); assert.match(sheets.current.state.message, /Select a server/)
await act('stop', { server: '456' }); assert.equal(sheets.current.state.title, 'Stop and restart the preview?')
assert.equal(calls.length, 0)
await act('cancel'); assert.equal(calls.length, 0)
recovery.open('a'); await settled(); await act('stop', { server: '456' })
workspace.state.activeKey = 'other'; await act('confirm'); assert.equal(calls.length, 0)
workspace.state.activeKey = 'a'; await act('confirm')
assert.deepEqual(calls, [server, { type: 'restart', key: 'a' }]); assert.equal(sheets.current, null)
assert.equal(samePreviewProcess(server, { ...server, started: 'reused PID' }), false)
assert.equal(samePreviewProcess(server, { ...server, root: '/other' }), false)
const failing = new NativePreviewRecovery(sheets, async () => { throw new Error('Inspection unavailable') })
failing.open('a'); await settled(); assert.match(sheets.current.state.message, /Inspection unavailable/)
assert.ok(sheets.current.state.actions.some(a => a.id === 'refresh'))
sheets.close()

if (process.platform === 'darwin') {
  const root = mkdtempSync(join(tmpdir(), 'praxis-recovery-')), other = mkdtempSync(join(tmpdir(), 'praxis-unrelated-'))
  const children = []
  try {
    for (const cwd of [root, other]) {
      const child = Bun.spawn([process.execPath, '-e', "const s=Bun.serve({hostname:'127.0.0.1',port:0,fetch:()=>new Response('ok')});console.log(s.port);"], { cwd, stdout: 'pipe', stderr: 'inherit' })
      children.push(child)
      const ready = await child.stdout.getReader().read()
      assert.equal(ready.done, false, 'Fixture listener started')
    }
    const found = await findPreviewProcesses(root)
    assert.deepEqual(found.map(s => s.pid), [children[0].pid], 'Only the matching project listener is listed')
    await assert.rejects(() => stopPreviewProcess({ ...found[0], started: 'wrong process' }), /changed or exited/)
    await stopPreviewProcess(found[0]); await children[0].exited
    assert.equal((await findPreviewProcesses(root)).length, 0)
    assert.deepEqual((await findPreviewProcesses(other)).map(s => s.pid), [children[1].pid], 'Unrelated server survives')
  } finally { for (const child of children) child.kill(); rmSync(root, {recursive:true,force:true}); rmSync(other, {recursive:true,force:true}) }
} else console.log('SKIP macOS process discovery')
console.log('Native preview recovery: inspection, confirmation, stale identity/project protection and restart passed')
