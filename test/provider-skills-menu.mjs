import { chooseComposerOption } from './helpers/composer-menu.mjs'
import assert from 'node:assert/strict'
import { _electron as electron } from 'playwright'
import electronPath from 'electron'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
const fixture = mkdtempSync(join(tmpdir(), 'praxis-skills-menu-'))
const skillDir = join(fixture, '.claude/skills/menu-regression')
mkdirSync(skillDir, { recursive: true })
writeFileSync(join(skillDir, 'SKILL.md'), '---\nname: menu-regression\ndescription: Project skill available before the first turn\n---\nReview the page.')
writeFileSync(join(fixture, 'index.html'), '<h1>Skills fixture</h1>')
let app
try {
  app = await electron.launch({ executablePath: electronPath, args: [join(process.cwd(), 'out/main/index.js')], env: { ...process.env, PRAXIS_CODEX_BIN: '/nonexistent/praxis-test-codex' } })
  const win = await app.firstWindow()
  await win.waitForSelector('.empty__open')
  await app.evaluate(({ dialog, BrowserWindow }, root) => {
    dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [root] })
    BrowserWindow.getAllWindows()[0].webContents.send('menu:action', 'open-project')
  }, fixture)
  await win.waitForSelector('.composer__input')
  await win.waitForFunction(() => window.__praxisSession.getState().projectRoot !== null)
  await win.evaluate(() => window.__praxisSession.getState().setSlashCommands([]))
  // Real keyboard input opens the menu, Escape restores focus and preserves value.
  const provider = win.getByRole('button', { name: 'Provider', exact: true })
  await provider.focus()
  await win.keyboard.press('ArrowDown')
  await win.getByRole('menu').waitFor()
  assert.equal(await win.getByRole('menuitemradio', { name: 'Claude', exact: true }).getAttribute('aria-checked'), 'true')
  mkdirSync('test/artifacts', { recursive: true })
  await win.screenshot({ path: 'test/artifacts/composer-provider-menu.png' })
  await win.keyboard.press('Escape')
  await win.getByRole('menu').waitFor({ state: 'hidden' })
  assert(await provider.evaluate(el => el === document.activeElement))
  assert.equal(await win.evaluate(() => window.__praxisSession.getState().provider), 'claude')
  const permission = win.getByRole('button', { name: 'Permission mode', exact: true })
  await permission.click()
  await win.getByRole('menu').waitFor()
  await win.screenshot({ path: 'test/artifacts/composer-permission-menu.png' })
  await win.keyboard.press('Escape')
  await win.getByRole('menu').waitFor({ state: 'hidden' })
  await chooseComposerOption(win, 'Provider', 'codex')
  await win.waitForFunction(() => window.__praxisSession.getState().provider === 'codex')
  assert.equal(await win.evaluate(() => window.__praxisSession.getState().provider), 'codex')
  await win.waitForFunction(() => window.__praxisSession.getState().slashCommands.some(s => s.name === 'menu-regression'))
  await win.fill('.composer__input', '/menu-reg')
  const item = win.locator('.slash__item').filter({ hasText: 'menu-regression' })
  await item.waitFor()
  assert((await item.textContent()).includes('Project skill available before the first turn'))
  mkdirSync('test/artifacts', { recursive: true })
  await win.screenshot({ path: 'test/artifacts/provider-skills-menu.png' })
  await item.click()
  assert.equal(await win.inputValue('.composer__input'), '/menu-regression ')
  // Menus release pointer/focus handling after a provider restart.
  await win.getByRole('button', { name: 'Model', exact: true }).click()
  await win.getByRole('menu').waitFor()
  await win.screenshot({ path: 'test/artifacts/composer-model-menu.png' })
  await win.keyboard.press('Escape')
  await win.getByRole('menu').waitFor({ state: 'hidden' })
  await chooseComposerOption(win, 'Permission mode', 'acceptEdits')
  await win.waitForFunction(() => window.__praxisPermissions.getState().mode === 'acceptEdits')
  await permission.click()
  assert.equal(await win.getByRole('menuitemradio', { name: 'Allow edits', exact: true }).getAttribute('aria-checked'), 'true')
  await win.locator('.composer__input').click({ position: { x: 8, y: 8 } })
  await win.getByRole('menu').waitFor({ state: 'hidden' })
  await chooseComposerOption(win, 'Provider', '__manage-providers__')
  await win.getByRole('dialog').waitFor()
  assert.equal(await win.evaluate(() => window.__praxisSession.getState().provider), 'codex')
  console.log('PROVIDER-SKILLS-MENU OK — Codex discovers and inserts project skills before any turn, without CLI authentication')
} finally {
  await app?.close()
  rmSync(fixture, { recursive: true, force: true })
}
