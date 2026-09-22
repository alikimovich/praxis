import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import electronPath from 'electron'
import { _electron } from 'playwright'
const root = mkdtempSync(join(tmpdir(), 'praxis-content-ui-'))
const recipe = { version: 1, id: 'page', title: 'Page content', sections: [
  { id: 'copy', title: 'Hero', fields: [{ key: 'title', label: 'Headline', type: 'text', required: true }] },
  { id: 'projects', title: 'Projects', collection: { key: 'projects', itemLabelKey: 'title', addLabel: 'Add project', defaults: { title: 'New project', featured: false }, fields: [{ key: 'title', label: 'Project title', type: 'text' }, { key: 'featured', label: 'Featured', type: 'toggle' }] } }
] }
const initial = { title: 'Original headline', hidden: 'keep me', projects: [{id: 'one', title: 'Praxis', featured: true, hidden: 'retain item'}] }
// Source starts in a private checkout; its live copy arrives after registration.
writeFileSync(join(root, 'index.html'), '<h1></h1><ul></ul><script>async function refresh(){const data=await fetch("/content.json").then(r=>r.json()); document.querySelector("h1").textContent=data.title;document.querySelector("ul").replaceChildren(...data.projects.map(p=>{const li=document.createElement("li");li.textContent=p.title;return li}))}refresh();setInterval(refresh,300)</script>')
mkdirSync(join(root, '.praxis'))
writeFileSync(join(root, '.praxis/content-controls.json'), JSON.stringify({ version: 1, panels: [{ id: 'page', file: 'content.json', recipe }] }))
let app
try {
  app = await _electron.launch({ executablePath: electronPath, args: [join(process.cwd(), 'out/main/index.js')], env: { ...process.env, PRAXIS_USER_DATA: join(root, 'profile'), PRAXIS_TEST_SKIP_INTRO: '1' } })
  const win = await app.firstWindow()
  await win.waitForSelector('.empty__open')
  await app.evaluate(({ dialog, BrowserWindow }, root) => {
    dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [root] })
    BrowserWindow.getAllWindows()[0].webContents.send('menu:action', 'open-project')
  }, root)
  const panel = win.getByRole('complementary', { name: 'Preview controls', exact: true })
  await panel.waitFor()
  const headline = panel.getByRole('textbox', {name: 'Headline', exact:true})
  await panel.getByText('Waiting for content.json to land…', { exact: true }).waitFor()
  assert.equal(await win.evaluate(root => window.api.contentControls.get(root, 'page'), root), null)
  await panel.getByText(/The content file is not in the live checkout/).waitFor({ timeout: 35000 })
  writeFileSync(join(root, 'content.json'), JSON.stringify(initial, null, 2) + '\n')
  await app.evaluate(({ BrowserWindow }, root) => BrowserWindow.getAllWindows()[0].webContents.send('agent:event', { type: 'landing-finished', projectKey: root }), root)
  await headline.fill('Edited in Praxis')
  await panel.getByRole('button', { name: 'Collapse preview controls' }).click()
  await panel.getByRole('button', { name: 'Show preview controls' }).click()
  assert.equal(await headline.inputValue(), 'Edited in Praxis', 'collapse retains draft')
  assert.equal(JSON.parse(readFileSync(join(root,'content.json'))).title, initial.title, 'draft does not write before Save')
  await panel.getByRole('button', { name: 'Add project', exact: true }).click()
  await panel.getByRole('textbox', { name: 'Project title', exact: true }).nth(1).fill('Content controls')
  await panel.getByRole('button', { name: 'Save to source' }).click()
  await win.waitForFunction(({root}) => window.api.contentControls.get(root, 'page').then(d => d.value.title === 'Edited in Praxis'), {root})
  const saved = JSON.parse(readFileSync(join(root,'content.json')))
  assert.equal(saved.hidden, 'keep me'); assert.equal(saved.projects[0].hidden, 'retain item'); assert.equal(saved.projects.length, 2)
  const preview = async code => app.evaluate(async ({webContents}, code) => {
    const wc = webContents.getAllWebContents().find(w => /^http:\/\/(127\.0\.0\.1|localhost):\d+/.test(w.getURL()))
    return wc?.executeJavaScript(code)
  }, code)
  for(let i=0;i<30 && await preview('document.querySelector("h1")?.textContent') !== 'Edited in Praxis';i++) await new Promise(r=>setTimeout(r,200))
  assert.equal(await preview('document.querySelector("h1").textContent'), 'Edited in Praxis')
  const before = await win.evaluate(root => window.api.contentControls.get(root,'page'),root)
  const external = {...saved, title:'External edit'}
  writeFileSync(join(root,'content.json'),JSON.stringify(external))
  const conflict = await win.evaluate(async ({root,before}) => {try {await window.api.contentControls.save(root,'page',before.revision,{...before.value,title:'stale'});return ''}catch(e){return String(e)}},{root,before})
  assert.match(conflict,/changed on disk/)
  assert.equal(JSON.parse(readFileSync(join(root,'content.json'))).title,'External edit')
  await headline.fill('Retained draft')
  await panel.getByRole('button',{name:'Save to source'}).click()
  await panel.getByText(/Content changed on disk/).waitFor()
  assert.equal(await headline.inputValue(),'Retained draft')
  await panel.getByRole('button',{name:'Reload from source (discard draft)',exact:true}).click()
  await headline.waitFor()
  assert.equal(await headline.inputValue(),'External edit')
  await headline.fill('Final headline')
  await panel.getByRole('button',{name:'Save to source'}).click()
  await win.waitForFunction(root=>window.api.contentControls.get(root,'page').then(d=>d.value.title==='Final headline'),root)
  mkdirSync('test/artifacts',{recursive:true})
  await panel.getByRole('textbox', {name:'Headline',exact:true}).scrollIntoViewIfNeeded()
  await win.screenshot({path:'test/artifacts/content-controls-ui.png'})
  await win.evaluate(()=>document.documentElement.classList.add('dark'))
  await win.screenshot({path:'test/artifacts/content-controls-dark.png'})
  let previewPng
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      previewPng = await app.evaluate(async ({webContents}) => {
        const wc=webContents.getAllWebContents().find(w=>/^http:\/\/(127\.0\.0\.1|localhost):\d+/.test(w.getURL()))
        return Array.from((await wc.capturePage()).toPNG())
      })
      break
    } catch (error) { if(attempt === 2) throw error; await new Promise(resolve => setTimeout(resolve, 250)) }
  }
  writeFileSync('test/artifacts/content-controls-preview.png', Buffer.from(previewPng))
  assert((await win.evaluate(root=>window.api.edits.undo(root),root)).ok)
  console.log('CONTENT-CONTROLS-UI OK — text, collection add, retained unknown fields, collapse draft, real preview, conflict retention, reload, Undo')
} finally {await app?.close();rmSync(root,{recursive:true,force:true})}
