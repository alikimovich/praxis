/** Real Codex turn: settings → catalog/export tools → source file → project preview. */
import assert from 'node:assert/strict'
import { mkdtempSync, writeFileSync, readFileSync, mkdirSync, rmSync, symlinkSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { _electron } from 'playwright'
import electronPath from 'electron'
const jev = process.env.PRAXIS_TEST_UI_ENGINE === 'jev'
if (jev && !process.env.JEV_AI_GATEWAY_API_KEY && !process.env.AI_GATEWAY_API_KEY) { console.log('PROJECT-UI-JEV-AGENT SKIP — missing Gateway credential'); process.exit(0) }
const root = mkdtempSync(join(tmpdir(), 'praxis-ui-agent-'))
const profile = mkdtempSync(join(tmpdir(), 'praxis-ui-agent-profile-'))
let app
try {
  mkdirSync(join(root, 'src'))
  symlinkSync(join(process.cwd(), 'node_modules'), join(root, 'node_modules'))
  writeFileSync(join(root, 'package.json'), JSON.stringify({ name: 'project-ui-test', type: 'module', scripts: { dev: 'vite --host 127.0.0.1' }, dependencies: { react: '^18.3.1', 'react-dom': '^18.3.1', vite: '^5.4.11' } }))
  writeFileSync(join(root, 'index.html'), '<div id="root"></div><script type="module" src="/src/main.tsx"></script>')
  writeFileSync(join(root, 'src/main.tsx'), `import React from 'react'; import {createRoot} from 'react-dom/client'; import Page from './Page'; import './theme.css'; createRoot(document.getElementById('root')).render(<Page />)`)
  writeFileSync(join(root, 'src/Page.tsx'), `import React from 'react'; export default function Page(){ return <div>Ready</div> }`)
  writeFileSync(join(root, 'src/Card.tsx'), `import React from 'react'; export function Card({title, children}: {title: string; children?: React.ReactNode}) {return <section className="project-card"><h1>{title}</h1>{children}</section>}`)
  writeFileSync(join(root, 'src/theme.css'), 'body { margin: 24px; background: #fff; color: #111; font-family: system-ui; } .project-card { padding: 32px; border: 2px solid currentColor; }')
  app = await _electron.launch({ executablePath: electronPath, args: [join(process.cwd(), 'out/main/index.js')], env: { ...process.env, PRAXIS_USER_DATA: profile, PRAXIS_TEST_SKIP_INTRO: '1' } })
  if (jev) await app.evaluate(() => {
    const original = globalThis.fetch
    globalThis.__jevCalls = 0
    globalThis.__jevSuccesses = 0
    globalThis.fetch = async (...args) => {
      const response = await original(...args)
      if (String(args[0]).includes('/v4/ai/evaluation-model')) {
        globalThis.__jevCalls++
        if (response.ok) globalThis.__jevSuccesses++
      }
      return response
    }
  })
  const win = await app.firstWindow()
  await win.waitForSelector('.empty__open')
  await app.evaluate(({ dialog, BrowserWindow }, root) => {
    dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [root] })
    BrowserWindow.getAllWindows()[0].webContents.send('menu:action', 'open-project')
  }, root)
  await win.waitForFunction(() => /http:/.test(document.querySelector('.previewbar__url')?.textContent ?? ''), null, { timeout: 60000 })
  await win.selectOption('select[aria-label="Provider"]', 'codex')
  await win.waitForFunction(() => window.__praxisSession.getState().provider === 'codex')
  await win.evaluate(() => window.__praxisProviders.getState().setSettingsOpen(true))
  await win.getByRole('switch', { name: 'Use project components' }).check()
  if (jev) await win.selectOption('select[aria-label="UI composition engine"]', 'jev')
  await win.keyboard.press('Escape')
  await win.fill('.composer__input', 'Create a page titled Composition works, containing Welcome home, using our existing Card component. Replace src/Page.tsx. Keep existing styles and imports in main.tsx. Do not install anything. Use the enabled project component composition tools, write the returned source, and finish.')
  await win.click('.composer__send')
  await win.waitForFunction(() => window.__praxisStore.getState().isRunning, null, { timeout: 20000 })
  await win.waitForFunction(() => !window.__praxisStore.getState().isRunning, null, { timeout: 180000 })
  const messages = await win.evaluate(() => window.__praxisStore.getState().messages)
  const transcript = JSON.stringify(messages)
  const jevCounts = jev ? await app.evaluate(() => ({ calls: globalThis.__jevCalls, successes: globalThis.__jevSuccesses })) : null
  if (!jevCounts?.calls && /not logged in|please.*login|unauthorized|invalid api key|credentials.*missing|hit your .*limit|usage limit|rate limit/i.test(transcript)) {
    console.log('PROJECT-UI-AGENT SKIP — provider unavailable (authentication or usage limit)')
  } else {
    if (jev) {
      const counts = jevCounts
      assert.ok(counts.calls >= 1 && counts.calls <= 2, 'real Jev evaluation must run within the budget')
      assert.equal(counts.successes, counts.calls, 'Jev requests must succeed')
      console.log('Verified Jev network evaluations:', counts.successes)
    }
    assert.match(transcript, /project_ui_catalog/, 'agent must discover components')
    assert.match(transcript, /compose_project_ui/, 'agent must use validated composition export')
    assert.match(readFileSync(join(root, 'src/Page.tsx'), 'utf8'), /Card/)
    let rendered = ''
    for (let attempt = 0; attempt < 40; attempt++) {
      rendered = await app.evaluate(async ({ webContents }) => {
        const preview = webContents.getAllWebContents().find((w) => /^http:\/\/127\.0\.0\.1/.test(w.getURL()))
        return preview ? preview.executeJavaScript('document.body.innerText') : ''
      })
      if (rendered.includes('Composition works') && rendered.includes('Welcome home')) break
      await new Promise((r) => setTimeout(r, 250))
    }
    assert.match(rendered, /Composition works/)
    assert.match(rendered, /Welcome home/)
    const png = await app.evaluate(async ({ webContents }) => {
      const preview = webContents.getAllWebContents().find((w) => /^http:\/\/127\.0\.0\.1/.test(w.getURL()))
      return preview ? (await preview.capturePage()).toPNG().toString('base64') : null
    })
    assert.ok(png)
    mkdirSync('test/artifacts', { recursive: true })
    writeFileSync(`test/artifacts/project-ui-${jev ? 'jev-' : ''}preview.png`, Buffer.from(png, 'base64'))
    console.log('PROJECT-UI-AGENT OK — real tools, source integration and rendered project preview')
  }
} finally {
  await app?.close().catch(() => {})
  rmSync(root, { recursive: true, force: true })
  rmSync(profile, { recursive: true, force: true })
}
