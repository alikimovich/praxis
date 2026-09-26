import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { NativeBridge } from './bridge'
import { dispatchIPC, serviceEvents } from './platform'
export async function checkNativeSheets(host: NativeBridge, key: string, artifacts: string) {
  const wait = async (check: (state: any) => boolean) => {
    for (let i = 0; i < 80; i++) {
      const state = await host.request('sheetInspect')
      if (check(state)) return state
      await new Promise(resolve => setTimeout(resolve, 50))
    }
    throw new Error('Native sheet did not reach expected state')
  }
  host.emit('menu', { action: 'servers' })
  await wait(state => state.visible && state.title === 'Running servers' && !state.busy)
  writeFileSync(join(artifacts, 'running-servers.png'), Buffer.from(await host.request('captureSheet'), 'base64'))
  await host.request('sheetPerform', { action: 'cancel' })
  await wait(state => !state.visible)
  await host.request('shellPerform', { action: 'new-project' })
  const projectWindow = await wait(state => state.visible && state.title === 'New project')
  if (projectWindow.attached || !projectWindow.closable || !projectWindow.resizable) throw new Error('Forms must use standalone native windows with window controls')
  await new Promise(resolve => setTimeout(resolve, 250))
  writeFileSync(join(artifacts, 'new-project.png'), Buffer.from(await host.request('captureSheet'), 'base64'))
  await host.request('sheetPerform', { action: 'closeWindow' })
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
  host.emit('menu', { action: 'feedback' })
  await wait(state => state.visible && state.title === 'Send feedback' && state.fields.includes('body'))
  await new Promise(resolve => setTimeout(resolve, 250))
  writeFileSync(join(artifacts, 'feedback.png'), Buffer.from(await host.request('captureSheet'), 'base64'))
  await host.request('sheetPerform', { action: 'cancel' })
  await wait(state => !state.visible)
  host.emit('menu', { action: 'diagnose' })
  await wait(state => state.visible && state.title === 'Preview problem')
  await host.request('sheetPerform', { action: 'cancel' })
  await wait(state => !state.visible)
  serviceEvents.emit('event', 'devserver:log', 'Native activity fixture')
  host.emit('menu', { action: 'logs' })
  await new Promise(resolve => setTimeout(resolve, 150))
  const activity = await host.request('activityInspect')
  if (!activity.visible || activity.count < 1) throw new Error('Native activity did not receive server logs')
  host.emit('activity-action', { action: 'clear' })
  await new Promise(resolve => setTimeout(resolve, 100))
  if ((await host.request('activityInspect')).count !== 0) throw new Error('Native activity clear failed')
  host.emit('activity-action', { action: 'hide' })
  console.log('Native New Project and project-memory sheets: presentation, cancel and saved memory passed.')
}
