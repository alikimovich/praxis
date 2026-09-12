import { chooseComposerOption } from './helpers/composer-menu.mjs'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, writeFileSync, readFileSync, existsSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { _electron } from 'playwright'
import electronPath from 'electron'
const repo = mkdtempSync(join(tmpdir(), 'praxis-visual-edit-'))
const userData = mkdtempSync(join(tmpdir(), 'praxis-visual-edit-ui-'))
const live = process.env.PRAXIS_VISUAL_EDIT_LIVE === '1'
const git = (...args) => execFileSync('git', args, { cwd: repo, encoding: 'utf8' }).trim()
git('init', '-q', '-b', 'main')
git('config', 'user.name', 'Test')
git('config', 'user.email', 'test@example.com')
writeFileSync(join(repo, 'index.html'), '<h1>Before the visual edit</h1>')
git('add', '.')
git('commit', '-qm', 'fixture')
let app
try {
 app = await _electron.launch({ executablePath: electronPath, args: [join(process.cwd(), 'out/main/index.js')], env: { ...process.env, PRAXIS_USER_DATA: userData, ...(live ? {} : { PRAXIS_CODEX_BIN: '/nonexistent/praxis-codex' }) } })
 const win = await app.firstWindow()
 await win.waitForSelector('.empty__open')
 await app.evaluate(({dialog, BrowserWindow}, root) => {
  dialog.showOpenDialog = async () => ({canceled:false,filePaths:[root]})
  BrowserWindow.getAllWindows()[0].webContents.send('menu:action','open-project')
 }, repo)
 await win.waitForFunction(root => window.__praxisWorkspace.getState().projects.some(p=>p.root === root && p.url), repo)
 await chooseComposerOption(win, 'Provider', 'codex')
  await win.waitForFunction(() => window.__praxisSession.getState().provider === 'codex')
 await win.fill('.composer__input', 'Keep my unsent draft')
 const before = await win.evaluate(() => {
  window.__visualEvents = []
  window.api.agent.onEvent(e=>window.__visualEvents.push(e))
  return JSON.stringify(window.__praxisStore.getState().messages)
 })
 // Same relay used by the floating inspector after a concrete edit needs AI.
 await app.evaluate(({BrowserWindow}, root) => {
  BrowserWindow.getAllWindows()[0].webContents.send('panel:action', {
   kind:'apply-edit',root,text:'In index.html, replace the h1 text with exactly VISUAL_EDIT_APPLIED. Edit the source file now. Do not ask questions or change anything else.'
  })
 }, repo)
 await win.waitForFunction(() => window.__visualEvents.some(e=>e.type==='spawn-finished'), undefined, {timeout: live ? 180000 : 20000})
 const events = await win.evaluate(() => window.__visualEvents)
 const finish = events.find(e=>e.type==='spawn-finished')
 assert(finish.sessionId)
 assert.equal(finish.origin,'text-edit')
 assert.equal(finish.outcome, live ? 'applied' : 'failed', JSON.stringify(events))
 assert(events.filter(e=>e.type==='error'||e.type==='delta'||e.type==='done').every(e=>e.sessionId === finish.sessionId), 'spawn output must stay out of parent chat')
 assert.equal(await win.inputValue('.composer__input'),'Keep my unsent draft')
 assert.equal(await win.evaluate(()=>JSON.stringify(window.__praxisStore.getState().messages)),before)
 await win.waitForFunction(id=>Object.values(window.__praxisSpawns.getState().byKey).flat().every(row=>row.id !== id), finish.sessionId)
 assert.equal(readFileSync(join(repo,'index.html'),'utf8').includes('VISUAL_EDIT_APPLIED'),live)
 if (live) {
  assert(git('log','-1','--format=%s').includes('index.html'))
  const view = await app.evaluate(async ({webContents}) => {
   const preview = webContents.getAllWebContents().find(w=>w.getURL().startsWith('http://127.0.0.1:'))
   await preview.reload()
   return preview.id
  })
  await win.waitForTimeout(500)
  assert((await app.evaluate(({webContents},id)=>webContents.fromId(id).executeJavaScript('document.body.textContent'),view)).includes('VISUAL_EDIT_APPLIED'))
 }
 if (live) {
  const parent = await win.evaluate(()=>window.__praxisStore.getState().activeKey)
  const cancelled = await win.evaluate(({repo,parent})=>window.api.agent.spawnComment(repo,
   'First replace the h1 text in index.html with exactly CANCELLED_PARTIAL_EDIT. Then run the shell command sleep 60. Do not do anything else.',
   parent,{provider:'codex'},'text-edit'), {repo,parent})
  assert(cancelled.ok)
  const deadline = Date.now()+90000
  let partial = false
  while(Date.now()<deadline) {
   const paths = git('worktree','list','--porcelain').split('\n').filter(line=>line.startsWith('worktree ')).map(line=>line.slice(9))
   partial = paths.some(path=>path !== repo && existsSync(join(path,'index.html')) && readFileSync(join(path,'index.html'),'utf8').includes('CANCELLED_PARTIAL_EDIT'))
   if (partial) break
   await new Promise(resolve=>setTimeout(resolve,200))
  }
  assert(partial,'subagent must make a private edit before cancellation')
  await win.evaluate(id=>window.api.agent.spawnInterrupt(id),cancelled.spawnId)
  await win.waitForFunction(id=>window.__visualEvents.some(e=>e.type==='spawn-finished'&&e.sessionId===id),cancelled.spawnId,{timeout:20000})
  const outcome = await win.evaluate(id=>window.__visualEvents.find(e=>e.type==='spawn-finished'&&e.sessionId===id),cancelled.spawnId)
  assert.equal(outcome.outcome,'cancelled')
  assert(outcome.branch,'partial work must remain recoverable')
  assert(!readFileSync(join(repo,'index.html'),'utf8').includes('CANCELLED_PARTIAL_EDIT'),'cancelled work must not reach live files')
  await win.evaluate(({repo,branch})=>window.api.agent.spawnDiscard(repo,branch),{repo,branch:outcome.branch})
 }
 console.log(`VISUAL-EDIT-AGENT OK — ${live ? 'Codex edit auto-landed and refreshed the preview' : 'Codex failure is isolated and clears its sidebar row'}, draft and transcript preserved`)
} finally {
 await app?.close()
 rmSync(repo,{recursive:true,force:true})
 rmSync(userData,{recursive:true,force:true})
}
