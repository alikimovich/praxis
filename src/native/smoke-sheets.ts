import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { NativeBridge } from './bridge'
import { dispatchIPC } from './platform'
export async function checkNativeSheets(host: NativeBridge, key: string, artifacts: string) {
  const wait = async (check: (state: any) => boolean) => {
    for (let i = 0; i < 80; i++) {
      const state = await host.request('sheetInspect')
      if (check(state)) return state
      await new Promise(resolve => setTimeout(resolve, 50))
    }
    throw new Error('Native sheet did not reach expected state')
  }
  await host.request('shellPerform', { action: 'new-project' })
  await wait(state => state.visible && state.title === 'New project')
  await new Promise(resolve => setTimeout(resolve, 250))
  writeFileSync(join(artifacts, 'new-project.png'), Buffer.from(await host.request('captureSheet'), 'base64'))
  await host.request('sheetPerform', { action: 'cancel' })
  await wait(state => !state.visible)
  host.emit('shell-action', { action: 'memory', project: key })
  await wait(state => state.visible && state.fields.includes('content'))
  await host.request('sheetPerform', { values: { content: '# Decisions\n\nUse native UI.' }, action: 'save' })
  await wait(state => !state.busy)
  let saved: any
  for (let i = 0; i < 80; i++) {
    saved = await dispatchIPC('main', { type: 'invoke', channel: 'project-memory:get', args: [key] })
    if (saved.content.includes('Use native UI.')) break
    await new Promise(resolve => setTimeout(resolve, 50))
  }
  if (!saved.content.includes('Use native UI.')) throw new Error('Native memory save failed')
  await new Promise(resolve => setTimeout(resolve, 250))
  writeFileSync(join(artifacts, 'project-memory.png'), Buffer.from(await host.request('captureSheet'), 'base64'))
  await host.request('sheetPerform', { action: 'cancel' })
  await wait(state => !state.visible)
  host.emit('menu', { action: 'settings' })
  await wait(state => state.visible && state.title === 'Settings')
  await new Promise(resolve => setTimeout(resolve, 250))
  writeFileSync(join(artifacts, 'settings.png'), Buffer.from(await host.request('captureSheet'), 'base64'))
  await host.request('sheetPerform', { action: 'save', values: { default: 'last-used', projectUi: 'false', engine: 'agent' } })
  await wait(state => !state.busy)
  await host.request('sheetPerform', { action: 'connections' })
  await wait(state => state.title === 'Provider connections')
  await host.request('sheetPerform', { action: 'add' })
  await wait(state => state.title === 'Add provider' && state.fields.includes('key'))
  await host.request('sheetPerform', { action: 'cancel' })
  await wait(state => !state.visible)
  console.log('Native New Project and project-memory sheets: presentation, cancel and saved memory passed.')
}
