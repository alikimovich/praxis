/** Real providers must use open_code for a natural-language request. */
import assert from 'node:assert/strict'
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { _electron } from 'playwright'
import electronPath from 'electron'
const code = '// invoice calculation\nconst tax = 0.2\nexport function total(subtotal) {\n  return subtotal * (1 + tax)\n}\n'
for (const provider of ['claude', 'codex']) {
  const root = mkdtempSync(join(tmpdir(), 'praxis-code-agent-'))
  const userData = mkdtempSync(join(tmpdir(), 'praxis-code-agent-ui-'))
  writeFileSync(join(root, 'index.html'), '<h1>Invoice</h1>')
  writeFileSync(join(root, 'invoice.js'), code)
  writeFileSync(join(root, 'article.html'), '<h1>Build your own design process</h1>')
  let app
  try {
    app = await _electron.launch({ executablePath: electronPath, args: [join(process.cwd(), 'out/main/index.js')], env: { ...process.env, PRAXIS_USER_DATA: userData } })
    const win = await app.firstWindow()
    await win.waitForSelector('.empty__open')
    await app.evaluate(({ dialog, BrowserWindow }, root) => {
      dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [root] })
      BrowserWindow.getAllWindows()[0].webContents.send('menu:action', 'open-project')
    }, root)
    await win.waitForFunction(() => /http:/.test(document.querySelector('.previewbar__url')?.textContent ?? ''))
    await win.selectOption('select[aria-label="Provider"]', provider)
    await win.waitForFunction(provider => window.__praxisSession.getState().provider === provider, provider)
    await win.fill('.composer__input', 'Show me the exact code used to calculate the total in invoice.js. Open the mini code editor and highlight the whole total function for me. Do not change any files.')
    await win.click('.composer__send')
    await win.waitForFunction(() => window.__praxisStore.getState().isRunning, null, { timeout: 20000 })
    await win.waitForFunction(() => !window.__praxisStore.getState().isRunning, null, { timeout: 180000 })
    const text = await win.evaluate(() => window.__praxisStore.getState().messages.filter(m => m.role === 'assistant').map(m => m.text).join('\n'))
    mkdirSync('test/artifacts', { recursive: true })
    writeFileSync(`test/artifacts/code-reveal-${provider}.txt`, text)
    if (/not logged in|please.*login|unauthorized|invalid api key|credentials.*missing|hit your .*limit|usage limit|rate limit/i.test(text)) {
      console.log(`CODE-REVEAL-AGENT SKIP — ${provider} unavailable (authentication or usage limit)`)
      continue
    }
    await win.waitForFunction(() => document.querySelectorAll('.codedrawer .cm-stamp-line').length === 3, null, { timeout: 10000 })
    assert.equal((await win.locator('.codedrawer .cm-stamp-line').allTextContents()).join('\n'), code.split('\n').slice(2, 5).join('\n'))
    assert.equal(await win.evaluate(() => window.__praxisSelection.getState().selected), null)
    await win.screenshot({ path: `test/artifacts/code-reveal-${provider}.png` })
    await win.fill('.composer__input', 'Can you open /article.html in the Praxis preview for me? Do not change files.')
    await win.click('.composer__send')
    await win.waitForFunction(() => window.__praxisStore.getState().isRunning, null, { timeout: 20000 })
    await win.waitForFunction(() => !window.__praxisStore.getState().isRunning, null, { timeout: 180000 })
    await win.waitForFunction(() => document.querySelector('[aria-label="Preview path"]')?.value === '/article.html', null, { timeout: 15000 })
    const heading = await app.evaluate(async ({ webContents }) => {
      const preview = webContents.getAllWebContents().find(w => w.getURL().endsWith('/article.html'))
      return preview?.executeJavaScript('document.querySelector("h1").textContent')
    })
    assert.equal(heading, 'Build your own design process')
    console.log(`OPEN-PREVIEW-AGENT OK — ${provider} opened the requested article`)
    console.log(`CODE-REVEAL-AGENT OK — ${provider} opened invoice.js and highlighted the exact function without selection`)
  } finally {
    await app?.close()
    rmSync(root, { recursive: true, force: true })
    rmSync(userData, { recursive: true, force: true })
  }
}
