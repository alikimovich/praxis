/** Desktop 3D loop through the real preview preload and Styles IPC. Exercises
 * bounded capture, trusted input, source edits/undo, replacement-node refresh,
 * state-preserving exit, and fail-closed duplicate identities. */
import assert from 'node:assert/strict'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import electronPath from 'electron'
import { _electron as electron } from 'playwright'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const fixture = join(root, 'test/fixtures/propedit-app')
const styled = join(fixture, 'src/Styled.tsx')
const original = readFileSync(styled, 'utf8')
const artifacts = join(root, 'test/artifacts')
mkdirSync(artifacts, { recursive: true })
const shadow = `document.querySelector('[data-praxis-three-d]')?.shadowRoot`
let app
try {
  app = await electron.launch({
    executablePath: electronPath,
    args: [join(root, 'out/main/index.js')],
    cwd: root
  })
  const win = await app.firstWindow()
  await win.waitForSelector('.empty__open', { timeout: 15000 })
  const preview = (code) =>
    app.evaluate(async ({ webContents }, code) => {
      const wc = webContents
        .getAllWebContents()
        .find((w) => /^http:\/\/(localhost|127\.0\.0\.1):\d+/.test(w.getURL()))
      return wc ? wc.executeJavaScript(code, true) : null
    }, code)
  const wait = async (code, timeout = 10000) => {
    const end = Date.now() + timeout
    while (Date.now() < end) {
      if (await preview(code)) return
      await new Promise((r) => setTimeout(r, 100))
    }
    throw new Error(`Preview wait timed out: ${code}`)
  }
  const input = async (events) =>
    app.evaluate(({ webContents }, events) => {
      const wc = webContents
        .getAllWebContents()
        .find((w) => /^http:\/\/(localhost|127\.0\.0\.1):\d+/.test(w.getURL()))
      wc.focus()
      for (const event of events) wc.sendInputEvent(event)
    }, events)
  const click = async (expression) => {
    const r = await preview(
      `(() => { const el = ${expression}; if (!el) return null; const r = el.getBoundingClientRect(); return {x:Math.round(r.left+r.width/2),y:Math.round(r.top+r.height/2)} })()`
    )
    assert.ok(r, `Click target missing: ${expression}`)
    await input([
      { type: 'mouseMove', ...r },
      { type: 'mouseDown', ...r, button: 'left', clickCount: 1 },
      { type: 'mouseUp', ...r, button: 'left', clickCount: 1 }
    ])
  }
  const screenshot = async (name) => {
    await preview(`new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)))`)
    await new Promise((r) => setTimeout(r, 100))
    const b64 = await app.evaluate(async ({ webContents }) => {
      const wc = webContents
        .getAllWebContents()
        .find((w) => /^http:\/\/(localhost|127\.0\.0\.1):\d+/.test(w.getURL()))
      return (await wc.capturePage()).toPNG().toString('base64')
    })
    writeFileSync(join(artifacts, name), Buffer.from(b64, 'base64'))
  }
  await app.evaluate(({ dialog }, fixture) => {
    dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [fixture] })
  }, fixture)
  await app.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows()[0].webContents.send('menu:action', 'open-project')
  )
  await wait(`!!document.querySelector('#tw-box')`, 60000)
  await preview(`(() => {
    document.body.style.minHeight = '1400px';
    const card = document.querySelector('#tw-box');
    card.style.cssText = 'width:320px;max-width:none;background:#ee334f;color:white;padding:24px;border-radius:18px;';
    card.innerHTML = '<div id="eyebrow" style="font:600 12px system-ui;letter-spacing:2px">PRAXIS / COMPOSITION</div><div id="art" style="height:105px;margin:20px 0;background:linear-gradient(125deg,#fcafc0,#b7163d);border-radius:8px"><svg width="100" height="100" viewBox="0 0 100 100"><circle cx="50" cy="50" r="28" fill="none" stroke="white" stroke-width="2"/><path d="M20 50h60M50 20v60" stroke="white"/></svg></div><h2 id="card-title" data-praxis-source="src/Styled.tsx:9" style="font:700 28px system-ui;margin:0">Built in layers.</h2><p style="font:400 15px system-ui">One component. Every detail.</p>';
    window.fixtureState = { count:7 };
    history.replaceState(null, '', '/?state=preserved');
    window.scrollTo(0, 25);
  })()`)
  const before = await preview(
    `({ url:location.href, scroll:scrollY, html:document.querySelector('#tw-box').outerHTML })`
  )
  await win.evaluate(() => window.api.preview.setSelectMode(true))
  await click(`document.querySelector('#tw-box')`)
  // The centre can land on a child; use the existing Layers selection IPC to
  // target the card itself before clicking its real 3D toolbar button.
  await win.evaluate(async () => {
    const snapshot = await window.api.layers.read()
    const node = snapshot.nodes.find((n) => n.id === 'tw-box')
    window.api.layers.select(node.path, { tag: node.tag, source: node.source })
  })
  // Existing overlay uses an id in some builds; resolve from its toolbar.
  const threeDButton = `[...document.documentElement.children].map(e => e.shadowRoot?.querySelector('[data-kind="three-d"]')).find(Boolean)`
  await wait(`!!(${threeDButton})`)
  await click(threeDButton)
  await wait(`${shadow}?.querySelectorAll('.surface').length >= 6`)
  assert.equal(
    await preview(`document.querySelector('#tw-box').outerHTML`),
    before.html,
    'Opening 3D must not mutate the component'
  )
  assert.equal(await preview(`window.fixtureState.count`), 7)
  const ownText = await preview(`[...${shadow}.querySelectorAll('.surface')].map(e=>e.textContent)`)
  assert.equal(
    ownText.filter((t) => t.includes('Built in layers.')).length,
    1,
    'Child text must not be duplicated on ancestors'
  )
  await screenshot('three-d-exploded.png')
  const cameraBefore = await preview(`${shadow}.querySelector('.scene').style.transform`)
  const point = await preview(
    `(() => { const r=${shadow}.querySelector('.stage').getBoundingClientRect();return {x:Math.round(r.left+30),y:Math.round(r.top+70)} })()`
  )
  await input([
    { type: 'mouseDown', ...point, button: 'left', clickCount: 1 },
    { type: 'mouseMove', x: point.x + 60, y: point.y + 35 },
    { type: 'mouseUp', x: point.x + 60, y: point.y + 35, button: 'left', clickCount: 1 }
  ])
  await wait(
    `${shadow}.querySelector('.scene').style.transform !== ${JSON.stringify(cameraBefore)}`
  )
  await click(`[...${shadow}.querySelectorAll('button')].find(e=>e.textContent==='Front')`)
  await wait(`${shadow}.querySelector('.scene').style.transform.includes('rotateX(0deg)')`)
  await screenshot('three-d-front.png')
  // Pick a child surface with real input and prove its source reaches the store.
  await click(`${shadow}.querySelector('.surface[title="h2#card-title"]')`)
  await win.waitForFunction(() => window.__praxisSelection.getState().selected?.id === 'card-title')
  await win.waitForFunction(() => window.__praxisPropsIsland.getState().open, undefined, {
    timeout: 5000
  })
  await win.evaluate(() => window.api.styles.preview('color', 'rgb(20, 30, 40)'))
  await wait(
    `${shadow}.querySelector('.surface[title="h2#card-title"] > div').style.color === 'rgb(20, 30, 40)'`
  )
  await win.evaluate(() => window.api.styles.clearPreview())
  await wait(
    `${shadow}.querySelector('.surface[title="h2#card-title"] > div').style.color !== 'rgb(20, 30, 40)'`
  )
  // Existing source engine and undo remain reachable while 3D is mounted.
  const applied = await win.evaluate(
    (fixture) =>
      window.api.styles.apply(fixture, {
        source: 'src/Styled.tsx:9',
        prop: 'padding-top',
        value: '13px',
        classes: []
      }),
    fixture
  )
  assert.equal(applied.applied, true, JSON.stringify(applied))
  assert.match(readFileSync(styled, 'utf8'), /paddingTop/)
  await win.evaluate((fixture) => window.api.edits.undo(fixture), fixture)
  assert.equal(readFileSync(styled, 'utf8'), original)
  // Simulate an HMR replacement of the whole subtree, retaining unique IDs.
  await preview(
    `(() => { const card=document.querySelector('#tw-box');const copy=card.cloneNode(true);copy.querySelector('h2').textContent='Fresh after edit';card.replaceWith(copy) })()`
  )
  await wait(`${shadow}?.textContent.includes('Fresh after edit')`)
  await win.evaluate(() => window.api.styles.preview('color', 'rgb(50, 60, 70)'))
  await wait(`getComputedStyle(document.querySelector('#card-title')).color === 'rgb(50, 60, 70)'`)
  await win.evaluate(() => window.api.styles.clearPreview())
  await click(`[...${shadow}.querySelectorAll('button')].find(e=>e.textContent==='Back to page')`)
  await wait(`!document.querySelector('[data-praxis-three-d]')`)
  assert.equal(await preview(`location.href`), before.url)
  assert.equal(await preview(`scrollY`), before.scroll)
  assert.equal(await preview(`window.fixtureState.count`), 7)
  // Reopen/escape leaves selection mode alive and removes the modal.
  await click(threeDButton)
  await wait(`!!${shadow}?.querySelector('dialog[open]')`)
  await input([
    { type: 'keyDown', keyCode: 'Escape' },
    { type: 'keyUp', keyCode: 'Escape' }
  ])
  await wait(`!document.querySelector('[data-praxis-three-d]')`)
  // Large subtrees remain bounded and explicitly disclose partial capture.
  await preview(
    `(() => { const card=document.querySelector('#tw-box');for(let i=0;i<180;i++){const n=document.createElement('div');n.textContent='Layer '+i;card.append(n)} })()`
  )
  await win.evaluate(async () => {
    const snapshot = await window.api.layers.read()
    const n = snapshot.nodes.find((n) => n.id === 'tw-box')
    window.api.layers.select(n.path, { tag: n.tag, source: n.source })
  })
  await new Promise((r) => setTimeout(r, 200))
  await click(threeDButton)
  await wait(`${shadow}?.querySelector('.status').textContent.includes('capture limited')`)
  assert.ok(await preview(`${shadow}.querySelectorAll('.surface').length <= 160`))
  // Native keyboard defaults on the slider must survive shortcut isolation.
  await preview(`${shadow}.querySelector('input').focus()`)
  await input([
    { type: 'keyDown', keyCode: 'Right' },
    { type: 'keyUp', keyCode: 'Right' }
  ])
  await wait(`${shadow}.querySelector('input').value === '37'`)
  await input([
    { type: 'keyDown', keyCode: 'Escape' },
    { type: 'keyUp', keyCode: 'Escape' }
  ])
  await wait(`!document.querySelector('[data-praxis-three-d]')`)
  // A repeated source stamp cannot heal to its surviving sibling after removal.
  await preview(
    `(() => { const card=document.querySelector('#tw-box');card.replaceChildren();for(let i=0;i<2;i++){const n=document.createElement('section');n.setAttribute('data-praxis-source','src/Styled.tsx:9');n.textContent='Repeated instance';n.style.color='rgb(1, 2, 3)';card.append(n)} })()`
  )
  await win.evaluate(async () => {
    const snapshot = await window.api.layers.read()
    const n = snapshot.nodes.find((n) => n.tag === 'section' && n.source === 'src/Styled.tsx:9')
    window.api.layers.select(n.path, { tag: n.tag, source: n.source })
  })
  await new Promise((r) => setTimeout(r, 200))
  await click(threeDButton)
  await wait(`!!${shadow}?.querySelector('dialog[open]')`)
  await preview(`document.querySelector('#tw-box section').remove()`)
  await win.evaluate(() => window.api.styles.preview('color', 'rgb(90, 80, 70)'))
  await wait(
    `!document.querySelector('[data-praxis-three-d]') || ${shadow}?.textContent.includes('ambiguously')`
  )
  assert.equal(
    await preview(`document.querySelector('#tw-box section').style.color`),
    'rgb(1, 2, 3)'
  )
  console.log(
    'PASS 3D capture, orbit, front view, child selection, style preview/clear, source edit/undo, replacement refresh, preserved return, Escape, capture limits and ambiguous identity protection'
  )
} finally {
  writeFileSync(styled, original)
  await app?.close()
}
