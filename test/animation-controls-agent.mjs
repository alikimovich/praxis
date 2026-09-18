/** Live skill regression: no selection → controls in the project, not the island. */
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import electronPath from 'electron'
import { _electron as electron } from 'playwright'

const root = process.cwd()
const project = mkdtempSync(join(tmpdir(), 'praxis-animation-skill-'))
const artifacts = join(root, 'test/artifacts')
mkdirSync(artifacts, { recursive: true })
let app
try {
  writeFileSync(join(project, 'package.json'), JSON.stringify({ name: 'animation-skill-fixture', private: true, type: 'module', scripts: { dev: `node ${JSON.stringify(join(root, 'node_modules/vite/bin/vite.js'))} --host 127.0.0.1` } }))
  const install = spawnSync('bun', ['add', 'dialkit'], { cwd: project, encoding: 'utf8', timeout: 90000 })
  assert.equal(install.status, 0, `fixture dependencies: ${install.stderr}`)
  writeFileSync(join(project, 'index.html'), `<!doctype html><html><head><title>Animation skill</title></head><body>
  <button id="card" data-praxis-source="main.js:1">Animated card</button>
  <button id="other" data-praxis-source="main.js:2">Other object</button>
  <style>body{padding:100px;font:16px sans-serif}button{padding:24px;margin:20px}</style>
  <script type="module" src="/main.js"></script></body></html>`)
  writeFileSync(join(project, 'main.js'), `const card = document.querySelector('#card')
const durationMs = 600
const distancePx = 60
function replay() {
  card.animate([{ transform: 'translateY(' + distancePx + 'px)', opacity: 0 }, { transform: 'translateY(0)', opacity: 1 }], { duration: matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : durationMs, easing: 'ease-out' })
}
card.addEventListener('click', replay)
replay()
`)
  app = await electron.launch({ executablePath: electronPath, args: [join(root, 'out/main/index.js')], cwd: root })
  const win = await app.firstWindow()
  await win.waitForSelector('.empty__open', { timeout: 15000 })
  await win.evaluate(() => {
    window.__praxisSession.getState().setProvider('codex')
    window.__praxisPermissions.getState().setMode('bypassPermissions')
  })
  await app.evaluate(({ dialog, BrowserWindow }, fixture) => {
    dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [fixture] })
    BrowserWindow.getAllWindows()[0].webContents.send('menu:action', 'open-project')
  }, project)
  await win.waitForFunction(() => /127\.0\.0\.1:\d+/.test(document.querySelector('.previewbar__url')?.textContent ?? ''), null, { timeout: 60000 })
  assert.equal(await win.evaluate(() => window.__praxisSelection.getState().selected), null)
  await win.fill('.composer__input', 'Surface animation controls for the animated card: duration and distance, plus replay. Keep them in the preview independently of whatever I select. DialKit is already installed. Keep the existing animation and defaults.')
  await win.click('[aria-label="Send message"]')
  await win.waitForFunction(() => window.__praxisStore.getState().isRunning, null, { timeout: 20000 })
  await win.waitForFunction(() => !window.__praxisStore.getState().isRunning, null, { timeout: 300000 })
  const assistant = await win.evaluate(() => window.__praxisStore.getState().messages.filter(m => m.role === 'assistant').map(m => m.text).join('\n'))
  writeFileSync(join(artifacts, 'animation-controls-agent.txt'), assistant)
  if (/not logged in|please.*login|unauthorized|invalid api key|credentials.*missing/i.test(assistant)) {
    console.log('ANIMATION-CONTROLS SKIP — provider authentication unavailable')
  } else {
    const preview = async (code) => app.evaluate(async ({ webContents }, code) => {
      const wc = webContents.getAllWebContents().find(w => /^http:\/\/127\.0\.0\.1:\d+/.test(w.getURL()))
      if (!wc) throw new Error('missing preview')
      return wc.executeJavaScript(code)
    }, code)
    // Observe runtime controls and motion without depending on generated component names.
    let controlState
    for (let attempt = 0; attempt < 60; attempt++) {
      controlState = await preview(`({ text: document.body.innerText, controls: document.querySelectorAll('input, [role="slider"]').length })`)
      if (/duration/i.test(controlState.text) && /distance/i.test(controlState.text) && /replay/i.test(controlState.text) && controlState.controls > 0) break
      await new Promise(resolve => setTimeout(resolve, 500))
    }
    assert(/duration/i.test(controlState.text) && /distance/i.test(controlState.text), `panel missing: ${JSON.stringify(controlState)}\n${assistant}`)
    assert(controlState.controls > 0, 'panel must expose real inputs')
    assert.equal(await win.evaluate(() => window.__praxisSelection.getState().selected), null, 'surfacing controls must not select an element')
    await preview(`window.__motionRuns = []; const original = Element.prototype.animate; Element.prototype.animate = function(frames, options) { window.__motionRuns.push({ id: this.id, frames, options }); return original.call(this, frames, options) }; document.querySelector('#card').click()`)
    const before = await preview(`window.__motionRuns.at(-1)`)
    assert(before, 'existing animation must still replay')
    const changed = await preview(`(() => {
      const slider = [...document.querySelectorAll('[role="slider"]')].find(el => /duration/i.test(el.getAttribute('aria-label') || ''))
      if (!slider) return false
      const value = slider.getAttribute('aria-valuenow')
      slider.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }))
      return slider.getAttribute('aria-valuenow') !== value
    })()`)
    assert(changed, 'duration control must respond to input')
    const replayFromPanel = `(() => { const button = [...document.querySelectorAll('button')].find(el => /^replay$/i.test(el.textContent.trim())); if (!button) throw new Error('missing Replay action'); button.click(); return window.__motionRuns.filter(run => run.id === 'card').at(-1) })()`
    const after = await preview(replayFromPanel)
    assert.notEqual(after.options.duration, before.options.duration, 'slider must change the real animation duration')
    assert.deepEqual((await preview(replayFromPanel)).options, after.options, 'Replay must preserve tuning values')
    const valuesBefore = await preview(`Array.from(document.querySelectorAll('[role="slider"]')).map(el => el.getAttribute('aria-valuenow'))`)
    // Exercise real selection through the preload, then clear it through the renderer.
    await win.click('[aria-label="Select"]')
    await app.evaluate(async ({ webContents }) => {
      const wc = webContents.getAllWebContents().find(w => /^http:\/\/127\.0\.0\.1:\d+/.test(w.getURL()))
      const point = await wc.executeJavaScript(`(() => { const r = document.querySelector('#other').getBoundingClientRect(); return { x: Math.round(r.x+r.width/2), y: Math.round(r.y+r.height/2) } })()`)
      wc.focus()
      wc.sendInputEvent({ type: 'mouseDown', ...point, button: 'left', clickCount: 1 })
      wc.sendInputEvent({ type: 'mouseUp', ...point, button: 'left', clickCount: 1 })
    })
    await win.waitForFunction(() => window.__praxisSelection.getState().selected?.id === 'other')
    await win.evaluate(() => window.__praxisSelection.getState().setSelected(null))
    assert.deepEqual(await preview(`Array.from(document.querySelectorAll('[role="slider"]')).map(el => el.getAttribute('aria-valuenow'))`), valuesBefore)
    assert.equal((await preview(`document.querySelectorAll('input, [role="slider"]').length`)), controlState.controls)
    const png = await app.evaluate(async ({ webContents }) => {
      const wc = webContents.getAllWebContents().find(w => /^http:\/\/127\.0\.0\.1:\d+/.test(w.getURL()))
      return (await wc.capturePage()).toPNG().toString('base64')
    })
    writeFileSync(join(artifacts, 'animation-controls-independent.png'), Buffer.from(png, 'base64'))
    const build = spawnSync(process.execPath, [join(root, 'node_modules/vite/bin/vite.js'), 'build', '--base=./'], { cwd: project, encoding: 'utf8', timeout: 60000 })
    assert.equal(build.status, 0, `generated project build failed: ${build.stderr}`)
    await win.click('[aria-label="Select"]')
    const origin = await preview('location.origin')
    await win.evaluate(url => window.api.preview.load(url), origin + '/dist/')
    let production
    for (let attempt = 0; attempt < 40; attempt++) {
      production = await preview(`({ path: location.pathname, ready: document.readyState === 'complete' && !!document.querySelector('#card'), sliders: document.querySelectorAll('[role="slider"]').length })`)
      if (production.path === '/dist/' && production.ready) break
      await new Promise(resolve => setTimeout(resolve, 250))
    }
    assert.equal(production.path, '/dist/')
    assert.equal(production.sliders, 0, 'production must omit the development controls')
    const productionMotion = await preview(`(() => { const card = document.querySelector('#card'); card.click(); return { count: card.getAnimations().length, reduced: matchMedia('(prefers-reduced-motion: reduce)').matches } })()`)
    assert(productionMotion.reduced || productionMotion.count > 0, 'production animation must survive without the panel')
    console.log('ANIMATION-CONTROLS OK — natural-language skill, runtime panel, live slider effect, repeatable Replay, selection-independent lifetime')
  }
} finally {
  await app?.close()
  rmSync(project, { recursive: true, force: true })
}
