/** Desktop surface layout, keyboard dismissal, and scroll access in both themes. */
import assert from 'node:assert/strict'
import { mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import electronPath from 'electron'
import { _electron as electron } from 'playwright'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const artifacts = join(root, 'test/artifacts')
mkdirSync(artifacts, { recursive: true })
let app
try {
  app = await electron.launch({ executablePath: electronPath, args: [join(root, 'out/main/index.js')], cwd: root })
  const win = await app.firstWindow()
  const errors = []
  win.on('pageerror', error => errors.push(error.message))
  await win.waitForSelector('.empty__open')
  await app.evaluate(({ BrowserWindow }) => {
    const window = BrowserWindow.getAllWindows()[0]
    window.setMinimumSize(320, 320)
    window.setContentSize(1000, 760)
  })
  await win.evaluate(() => window.__praxisWorkspace.getState().openOrActivate('/tmp/praxis-surfaces'))
  await win.waitForSelector('.composer__input')
  const fits = async () => {
    const box = await win.getByRole('dialog').boundingBox()
    const viewport = await win.evaluate(() => ({ width: innerWidth, height: innerHeight }))
    assert(box && box.x >= 0 && box.y >= 0 && box.x + box.width <= viewport.width + 1 && box.y + box.height <= viewport.height + 1, 'dialog must fit the viewport')
  }
  for (const theme of ['light', 'dark']) {
    await win.evaluate(theme => document.documentElement.classList.toggle('dark', theme === 'dark'), theme)
    await win.evaluate(() => window.__praxisProviders.getState().setSettingsOpen(true))
    await win.getByRole('dialog').waitFor()
    await win.getByLabel('Default model for new chats').waitFor()
    await fits()
    await win.screenshot({ path: join(artifacts, `desktop-settings-${theme}.png`) })
    await win.getByRole('button', { name: 'Add connection', exact: true }).click()
    await win.locator('#provider-label').fill('Example connection')
    await win.locator('#provider-key').fill('unsaved-test-key')
    await win.getByRole('button', { name: 'Cancel', exact: true }).click()
    await win.getByRole('button', { name: 'Add connection', exact: true }).click()
    assert.equal(await win.locator('#provider-key').inputValue(), '', 'leaving the form must discard its unsaved API key')
    await win.keyboard.press('Escape')
    await win.getByRole('dialog').waitFor({ state: 'hidden' })
    // Composer pickers are native selects; exercise shared menu styling on
    // the project action menu instead.
    await win.locator('.rail__row').hover()
    await win.locator('.rail__project-menu').click()
    await win.getByRole('menu').waitFor()
    await win.keyboard.press('ArrowDown')
    assert(await win.getByRole('menu').evaluate(menu => menu.contains(document.activeElement)), 'keyboard focus must stay in the menu')
    await win.screenshot({ path: join(artifacts, `desktop-menu-${theme}.png`) })
    await win.keyboard.press('Escape')
    await win.getByRole('menu').waitFor({ state: 'hidden' })
    // Radix restores focus after the close animation has unmounted the menu.
    await win.waitForFunction(() => document.activeElement?.classList.contains('rail__project-menu'), null, { timeout: 5000 })
    await win.locator('.rail__row').hover()
    await win.locator('.rail__project-menu').click()
    await win.getByRole('menuitem', { name: 'Memory', exact: true }).waitFor()
    await win.screenshot({ path: join(artifacts, `desktop-project-actions-${theme}.png`) })
    await win.keyboard.press('Escape')
    await win.getByRole('menu').waitFor({ state: 'hidden' })
  }
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setContentSize(390, 600))
  await win.evaluate(() => window.__praxisProviders.getState().setSettingsOpen(true))
  await win.getByRole('dialog').waitFor()
  await win.getByRole('button', { name: 'Add connection', exact: true }).click()
  await fits()
  const cancel = win.getByRole('button', { name: 'Cancel', exact: true })
  await cancel.scrollIntoViewIfNeeded()
  await win.screenshot({ path: join(artifacts, 'desktop-sheet-narrow.png') })
  await cancel.click()
  await win.keyboard.press('Escape')
  await win.getByRole('dialog').waitFor({ state: 'hidden' })
  assert.deepEqual(errors, [])
  console.log('DESKTOP-SURFACES OK — light/dark menus and settings, keyboard focus, short-window scroll, discarded form keys')
} catch (error) {
  console.error('DESKTOP-SURFACES FAILED:', error.stack)
  process.exitCode = 1
} finally {
  await app?.close()
}
