import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import electronPath from 'electron'
import { _electron as electron } from 'playwright'
const root = process.cwd()
const userData = mkdtempSync(join(tmpdir(), 'praxis-project-ui-'))
mkdirSync(join(root, 'test/artifacts'), { recursive: true })
let app
async function launch() {
  app = await electron.launch({ executablePath: electronPath, args: [join(root, 'out/main/index.js')], cwd: root,
    env: { ...process.env, PRAXIS_USER_DATA: userData, PRAXIS_TEST_SKIP_INTRO: '1' } })
  const win = await app.firstWindow()
  await win.waitForSelector('.empty__open')
  await win.evaluate(() => window.__praxisProviders.getState().setSettingsOpen(true))
  await win.getByRole('switch', { name: 'Use project components' }).waitFor()
  return win
}
try {
  let win = await launch()
  let toggle = win.getByRole('switch', { name: 'Use project components' })
  assert.equal(await toggle.isChecked(), false)
  await toggle.check()
  assert.equal(await toggle.isChecked(), true)
  await win.selectOption('select[aria-label="UI composition engine"]', 'jev')
  console.log('Setting text styles:', await win.locator('#project-ui-description').evaluate((el) => {
    const style = getComputedStyle(el)
    return { color: style.color, size: style.fontSize, weight: style.fontWeight, background: getComputedStyle(el.closest('[role=dialog]')).backgroundColor }
  }))
  await win.screenshot({ path: join(root, 'test/artifacts/project-ui-on.png') })
  await win.evaluate(() => {
    const style = document.createElement('style')
    style.textContent = '* { transition: none !important; animation: none !important; }'
    document.head.append(style)
    document.documentElement.classList.add('dark')
  })
  console.log('Dark setting text styles:', await win.locator('#project-ui-description').evaluate((el) => {
    const style = getComputedStyle(el)
    return { color: style.color, size: style.fontSize, weight: style.fontWeight, background: getComputedStyle(el.closest('[role=dialog]')).backgroundColor }
  }))
  await win.screenshot({ path: join(root, 'test/artifacts/project-ui-dark.png') })
  await win.evaluate(() => document.documentElement.classList.remove('dark'))
  await app.close(); app = undefined
  win = await launch()
  toggle = win.getByRole('switch', { name: 'Use project components' })
  assert.equal(await toggle.isChecked(), true, 'opt-in survives an app restart')
  assert.equal(await win.getByLabel('UI composition engine', { exact: true }).inputValue(), 'jev')
  await toggle.uncheck()
  assert.equal(await win.getByLabel('UI composition engine', { exact: true }).count(), 0)
  await win.screenshot({ path: join(root, 'test/artifacts/project-ui-off.png') })
  await app.close(); app = undefined
  win = await launch()
  assert.equal(await win.getByRole('switch', { name: 'Use project components' }).isChecked(), false, 'opt-out survives restart')
  console.log('PROJECT-UI-SETTINGS OK — default off, on/off and restart persistence')
} finally {
  await app?.close().catch(() => {})
  rmSync(userData, { recursive: true, force: true })
}
