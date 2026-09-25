import assert from 'node:assert/strict'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { NativeBridge } from './bridge'
import { nativeWorkspace } from './workspace-runtime'
import { nativeChat } from './chat-runtime'

/** Exercise AppKit's selection callback through the real host/backend bridge. */
export async function checkProjectSwitching(host: NativeBridge, fixture: string, artifacts: string) {
  const first = nativeWorkspace.active!
  const secondRoot = join(fixture, '../second-project')
  mkdirSync(secondRoot, { recursive: true })
  writeFileSync(join(secondRoot, 'index.html'), '<h1 id="second-project">Second project</h1>')
  await nativeWorkspace.command({ type: 'open', root: secondRoot })
  const second = nativeWorkspace.active!
  assert.notEqual(first.key, second.key)
  for (const entry of [first, second, first]) {
    await new Promise(resolve => setTimeout(resolve, 150))
    assert.equal(await host.request('shellPerform', { action: 'select-row', row: `project:${entry.key}` }), true)
    const deadline = Date.now() + 10000
    let switched = false
    while (Date.now() < deadline) {
      const shell = await host.request('shellInspect')
      const selector = entry === first ? '#native-title' : '#second-project'
      const preview = await host.request('evaluate', { view: 'preview', code: `!!document.querySelector('${selector}')` })
      if (nativeWorkspace.active?.key === entry.key && nativeChat.active === entry.activeSessionKey && shell.selected === `chat:${entry.activeSessionKey}` && preview) { switched = true; break }
      await new Promise(resolve => setTimeout(resolve, 80))
    }
    assert.ok(switched, `Sidebar selection must activate project, chat and preview: ${entry.name}`)
  }
  writeFileSync(join(artifacts, 'project-switching.png'), Buffer.from(await host.request('captureShell'), 'base64'))
  await nativeWorkspace.command({ type: 'close', key: second.key })
}
