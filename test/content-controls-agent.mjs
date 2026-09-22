import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import electronPath from 'electron'
import { _electron } from 'playwright'
const jev = !!(process.env.JEV_AI_GATEWAY_API_KEY || process.env.AI_GATEWAY_API_KEY)
const root=mkdtempSync(join(tmpdir(),'praxis-content-agent-'))
writeFileSync(join(root,'content.json'),JSON.stringify({headline:'Welcome to Praxis',projects:[{id:'one',title:'First project',featured:true}]}))
writeFileSync(join(root,'index.html'),'<h1></h1><script>async function refresh(){document.querySelector("h1").textContent=(await fetch("/content.json").then(r=>r.json())).headline}refresh();setInterval(refresh,300)</script>')
let app
try {
 app=await _electron.launch({executablePath:electronPath,args:[join(process.cwd(),'out/main/index.js')],env:{...process.env,PRAXIS_USER_DATA:join(root,'profile'),PRAXIS_TEST_SKIP_INTRO:'1'}})
 if(jev) await app.evaluate(()=>{const original=globalThis.fetch;globalThis.__jevCalls=0;globalThis.__jevSuccesses=0;globalThis.fetch=async(...args)=>{const response=await original(...args);if(String(args[0]).includes('/v4/ai/evaluation-model')){globalThis.__jevCalls++;if(response.ok)globalThis.__jevSuccesses++}return response}})
 const win=await app.firstWindow();await win.waitForSelector('.empty__open')
 await app.evaluate(({dialog,BrowserWindow},root)=>{dialog.showOpenDialog=async()=>({canceled:false,filePaths:[root]});BrowserWindow.getAllWindows()[0].webContents.send('menu:action','open-project')},root)
 await win.waitForFunction(()=>/http:/.test(document.querySelector('.previewbar__url')?.textContent??''))
 await win.selectOption('select[aria-label="Provider"]','codex')
 await win.waitForFunction(()=>window.__praxisSession.getState().provider==='codex')
 await win.fill('.composer__input',`Surface content controls for the headline in content.json. The page already consumes this JSON. Use content_controls catalog then define with one copy section and a required headline text field. ${jev?'Use Jev (engine:jev) to choose the controls, with the original request as prompt.':'Use the current chat model.'} Preserve content and do not add any dependencies or UI to the target. Verify the control tool succeeds.`)
 await win.click('.composer__send')
 await win.waitForFunction(()=>window.__praxisStore.getState().isRunning,null,{timeout:20000})
 await win.waitForFunction(()=>!window.__praxisStore.getState().isRunning,null,{timeout:240000})
 const text=await win.evaluate(()=>window.__praxisStore.getState().messages.filter(m=>m.role==='assistant').map(m=>m.text).join('\n'))
 mkdirSync('test/artifacts',{recursive:true});writeFileSync('test/artifacts/content-controls-agent.txt',text)
 if(!existsSync(join(root,'.praxis/content-controls.json')) && /not logged in|unauthorized|usage limit|hit your .*limit/i.test(text)){console.log('CONTENT-CONTROLS-AGENT SKIP — provider unavailable');process.exitCode=0}
 else {
   if(jev){const counts=await app.evaluate(()=>({calls:globalThis.__jevCalls,successes:globalThis.__jevSuccesses}));assert(counts.calls>=1&&counts.calls<=2);assert.equal(counts.successes,counts.calls);console.log('Verified successful Jev evaluations:',counts.successes)}
   const panels=JSON.parse(readFileSync(join(root,'.praxis/content-controls.json'))).panels;assert(panels.length>0)
   const input=win.getByRole('complementary',{name:'Preview controls'}).getByRole('textbox').first();await input.fill('Live agent controls work')
   await win.getByRole('button',{name:'Save to source'}).click()
   await win.waitForFunction(root=>window.api.contentControls.list(root).then(async panels=>(await window.api.contentControls.get(root,panels[0].id)).value.headline==='Live agent controls work'),root)
   await win.screenshot({path:'test/artifacts/content-controls-agent.png'})
   console.log(`CONTENT-CONTROLS-AGENT OK — real Codex registration, ${jev?'Jev requested, ':''}renderer control and source save`)
 }
}finally{await app?.close();rmSync(root,{recursive:true,force:true})}
