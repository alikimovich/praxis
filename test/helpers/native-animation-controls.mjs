import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import electronPath from 'electron'
import { _electron } from 'playwright'

export async function verifyAnimationControls(live = false) {
  const root = mkdtempSync(join(tmpdir(), 'praxis-native-animation-'))
  let app
  const jev = live && process.env.PRAXIS_TEST_CONTROLS_ENGINE === 'jev'
  const motion = `const DURATION = 300
const DISTANCE = 60
const card = document.querySelector('#card')
function replay() {
  card.animate([{ transform: 'translateY(' + DISTANCE + 'px)', opacity: 0 }, { transform: 'none', opacity: 1 }], { duration: matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : DURATION, easing: 'ease-out' })
}
card.onclick = replay
replay()
`
  writeFileSync(join(root, 'index.html'), '<button id="card">Animated card</button><button id="other">Other object</button><style>body{padding:40px}button{padding:20px;margin:20px}</style><script type="module" src="/motion.js"></script>')
  writeFileSync(join(root, 'motion.js'), motion + (live ? '' : `window.addEventListener('praxis:animation-replay', e => { if (e.detail === 'Card') replay() })\n`))
  if (!live) {
    mkdirSync(join(root, '.praxis'))
    writeFileSync(join(root, '.praxis/control-panels.json'), JSON.stringify({ version: 1, panels: [{
      id: 'card-animation', component: 'Card', file: 'motion.js', title: 'Card motion', presentation: 'animation', replay: true, createdAt: new Date().toISOString(),
      params: [{ id: 'duration', label: 'Duration', kind: 'number', min: 0, max: 2000, step: 10, unit: 'ms', apply: { strategy: 'literal', anchor: 'const DURATION = ' } }]
    }] }))
  }
  try {
    app = await _electron.launch({ executablePath: electronPath, args: [join(process.cwd(), 'out/main/index.js')] })
    if (jev) await app.evaluate(() => {
      const original = globalThis.fetch
      globalThis.__jevSuccesses = 0
      globalThis.fetch = async (...args) => { const response = await original(...args); if (String(args[0]).includes('/v4/ai/evaluation-model') && response.ok) globalThis.__jevSuccesses++; return response }
    })
    const win = await app.firstWindow()
    await win.waitForSelector('.empty__open')
    await app.evaluate(({ dialog, BrowserWindow }, root) => {
      dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [root] })
      BrowserWindow.getAllWindows()[0].webContents.send('menu:action', 'open-project')
    }, root)
    await win.waitForFunction(() => /http:/.test(document.querySelector('.previewbar__url')?.textContent ?? ''))
    if (live) {
      await win.selectOption('select[aria-label="Provider"]', 'codex')
      await win.fill('.composer__input', 'Surface animation controls for the animated card in motion.js, with Duration in milliseconds (10ms steps) and Distance in pixels, and Replay. Keep the controls available independently of selection. Preserve the existing animation and defaults.' + (jev ? ' Use define_controls with engine:jev and this request as prompt so Jev selects and orders the params.' : ''))
      await win.click('.composer__send')
      await win.waitForFunction(() => window.__praxisStore.getState().isRunning, null, { timeout: 20000 })
      await win.waitForFunction(() => !window.__praxisStore.getState().isRunning, null, { timeout: 240000 })
      const text = await win.evaluate(() => window.__praxisStore.getState().messages.filter(m => m.role === 'assistant').map(m => m.text).join('\n'))
      mkdirSync('test/artifacts', { recursive: true })
      writeFileSync('test/artifacts/native-animation-agent.txt', text)
      if (/hit your .*limit|usage limit|not logged in|unauthorized/i.test(text)) { console.log('ANIMATION-CONTROLS SKIP — provider unavailable'); return }
    }
    if (jev) assert((await app.evaluate(() => globalThis.__jevSuccesses)) > 0, 'real Jev decision must succeed')
    const panel = win.getByRole('complementary', { name: 'Animation controls', exact: true })
    await panel.waitFor()
    assert.equal(await win.evaluate(() => window.__praxisSelection.getState().selected), null)
    const slider = panel.getByRole('slider', { name: /^duration$/i })
    await slider.waitFor()
    assert.equal(await slider.getAttribute('aria-valuenow'), '300')
    const preview = code => app.evaluate(async ({ webContents }, code) => {
      const wc = webContents.getAllWebContents().find(w => /^http:\/\/(127\.0\.0\.1|localhost):\d+/.test(w.getURL()))
      return wc.executeJavaScript(code)
    }, code)
    const replay = panel.getByRole('button', { name: 'Replay', exact: true })
    await preview(`window.__runs = []; const original = Element.prototype.animate; Element.prototype.animate = function(frames, options) { window.__runs.push(options.duration); return original.call(this, frames, options) }; true`)
    await replay.click(); await replay.click()
    assert.deepEqual(await preview('window.__runs'), [300, 300])
    await win.click('[aria-label="Select"]')
    await app.evaluate(async ({ webContents }) => {
      const wc = webContents.getAllWebContents().find(w => /^http:\/\/(127\.0\.0\.1|localhost):\d+/.test(w.getURL()))
      const point = await wc.executeJavaScript(`(() => {const r=document.querySelector('#other').getBoundingClientRect();return {x:Math.round(r.x+r.width/2),y:Math.round(r.y+r.height/2)}})()`)
      wc.focus(); wc.sendInputEvent({ type: 'mouseDown', ...point, button: 'left', clickCount: 1 }); wc.sendInputEvent({ type: 'mouseUp', ...point, button: 'left', clickCount: 1 })
    })
    await win.waitForFunction(() => window.__praxisSelection.getState().selected?.id === 'other')
    await replay.click()
    assert.equal(await win.evaluate(() => window.__praxisSelection.getState().selected?.id), 'other')
    await win.evaluate(() => window.__praxisSelection.getState().setSelected(null))
    await slider.focus(); await win.keyboard.press('ArrowRight')
    await win.waitForFunction(() => document.querySelector('.animation-panel [role="slider"]')?.getAttribute('aria-valuenow') === '310')
    await new Promise(resolve => setTimeout(resolve, 1700))
    const manifests = JSON.parse(readFileSync(join(root, '.praxis/control-panels.json'), 'utf8')).panels
    assert(manifests.every(p => p.presentation === 'animation'))
    const duration = (await win.evaluate(root => window.api.controls.get(root, { files: ['motion.js'] }), root))[0].params.find(p => /duration/i.test(p.label))
    assert.equal(duration.value, 310)
    await preview(`window.__runs = []; const currentAnimate = Element.prototype.animate; Element.prototype.animate = function(frames, options) { window.__runs.push(options.duration); return currentAnimate.call(this, frames, options) }; true`)
    await replay.click()
    assert.equal((await preview('window.__runs')).at(-1), 310, 'saved duration must drive the real animation')
    await panel.getByRole('button', { name: 'Collapse animation controls' }).click()
    await panel.getByRole('button', { name: 'Show animation controls' }).click()
    assert.equal(await slider.getAttribute('aria-valuenow'), '310')
    assert((await win.evaluate(root => window.api.edits.undo(root), root)).ok)
    await win.waitForFunction(() => document.querySelector('.animation-panel [role="slider"]')?.getAttribute('aria-valuenow') === '300')
    assert(!existsSync(join(root, 'package.json')), 'native controls must not install a tuning dependency')
    assert(!/dialkit/i.test(readFileSync(join(root, 'motion.js'), 'utf8')))
    mkdirSync('test/artifacts', { recursive: true })
    await win.screenshot({ path: `test/artifacts/native-animation-${live ? 'agent' : 'ui'}.png` })
    console.log('NATIVE-ANIMATION OK — Praxis controls, selection-independent Replay, literal edits, collapse/reopen, Undo, no dependencies')
  } finally { await app?.close(); rmSync(root, { recursive: true, force: true }) }
}
