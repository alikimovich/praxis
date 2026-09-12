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
  await win.locator('select[aria-label="Provider"]').selectOption({ label: 'Codex' })
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
  console.log('PROVIDER-SKILLS-MENU OK — Codex discovers and inserts project skills before any turn, without CLI authentication')
} finally {
  await app?.close()
  rmSync(fixture, { recursive: true, force: true })
}
