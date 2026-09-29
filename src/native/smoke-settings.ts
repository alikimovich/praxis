import assert from 'node:assert/strict'
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { NativeBridge } from './bridge'
import { assertSettingsEvidence, settingsVerificationWidths } from './settings-verification'

/** Manager-owned foreground fixture, reached by the standard native suite. */
export async function checkVisibleSettings(host: NativeBridge, artifacts: string) {
  const wait = async (check: () => Promise<boolean>) => {
    for (let i = 0; i < 100; i++) {
      if (await check()) return
      await new Promise((resolve) => setTimeout(resolve, 60))
    }
    throw new Error('Settings foreground verification timed out')
  }
  const inspect = () => host.request('settingsVerification')
  const events: unknown[] = []
  const record = (event: unknown) => {
    events.push(event)
    writeFileSync(
      join(artifacts, 'settings-visible-interactions.json'),
      JSON.stringify(events, null, 2)
    )
  }
  const choose = async (field: string, value: string) => {
    await host.request('settingsVerification', { field, value })
    await wait(async () => (await inspect()).values[field] === value)
    record({ action: 'native-picker-target-action', field, value, state: await inspect() })
  }
  const reopen = async () => {
    const before = await inspect()
    await host.request('sheetPerform', { action: 'closeWindow' })
    await wait(async () => !(await host.request('sheetInspect')).visible)
    host.emit('menu', { action: 'settings' })
    await wait(async () => (await host.request('sheetInspect')).title === 'Settings')
    const after = await inspect()
    assert.notEqual(
      after.id,
      before.id,
      'Reopen creates a fresh Settings model from saved preferences'
    )
    assert.deepEqual(
      after.values,
      before.values,
      'Close must flush autosave and reopen saved choices'
    )
    record({ action: 'close-reopen-autosave', before, after })
  }
  const capture = async (
    width: number,
    name: string,
    enabled: boolean,
    engine: 'agent' | 'jev'
  ) => {
    await host.request('settingsVerification', { prepare: true, width })
    await wait(async () => (await inspect()).foreground)
    await new Promise((resolve) => setTimeout(resolve, 350))
    const layout = await inspect()
    const image = await host.request('captureVisibleSettings')
    const stem = join(artifacts, `settings-visible-${width}-${name}`)
    writeFileSync(`${stem}.png`, Buffer.from(image.png, 'base64'))
    const evidence = {
      ...layout,
      text: image.text,
      captureWidth: image.width,
      captureHeight: image.height
    }
    writeFileSync(`${stem}.json`, JSON.stringify(evidence, null, 2))
    assert.ok(
      image.width >= width && image.height >= layout.height,
      'Nonempty foreground Settings pixels'
    )
    assert.equal(
      layout.minimumWidth,
      minimumWidth,
      'Settings minimum must remain stable across state changes and reopen'
    )
    assertSettingsEvidence(evidence, width, enabled, engine)
    record({ action: 'capture-asserted', path: `${stem}.png`, enabled, engine })
  }
  // Disposable native profile starts Off/Chat model. Do not manufacture this state.
  const minimumWidth = (await inspect()).minimumWidth
  const widths = settingsVerificationWidths(minimumWidth)
  record({ action: 'width-plan', minimumWidth, widths })
  assert.equal((await inspect()).values.projectUi, 'false')
  assert.equal((await inspect()).values.engine, 'agent')
  for (const width of widths) {
    await capture(width, 'off', false, 'agent')
    await choose('projectUi', 'true')
    await capture(width, 'on-chat', true, 'agent')
    await choose('engine', 'jev')
    await capture(width, 'on-jev', true, 'jev')
    await choose('projectUi', 'false')
    await capture(width, 'off-preserved-jev', false, 'jev')
    await reopen()
    await capture(width, 'reopened-off-jev', false, 'jev')
    await choose('projectUi', 'true')
    await capture(width, 'restored-on-jev', true, 'jev')
    await choose('engine', 'agent')
    // Close immediately after the control action: do not wait for a saved message.
    await reopen()
    await capture(width, 'reopened-on-chat', true, 'agent')
    await choose('projectUi', 'false')
    await reopen()
    await capture(width, 'reopened-off-chat', false, 'agent')
  }
  console.log(
    `NATIVE SETTINGS PASS — foreground ${widths.join('/')} point captures and complete help OCR; native Off/On/Chat/Jev picker actions; hidden-engine preservation and close/reopen autosave. Inspect settings-visible-*.png for visual acceptance.`
  )
}
