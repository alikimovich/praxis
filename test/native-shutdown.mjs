import { build } from 'esbuild'
import { mkdtempSync, writeFileSync, rmSync, readFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import assert from 'node:assert/strict'

const dir = mkdtempSync(join(tmpdir(), 'praxis-shutdown-'))
const root = resolve('.')
const pause = () => new Promise(r => setTimeout(r, 50))
const dead = pid => { try { process.kill(pid, 0); return false } catch { return true } }
let child
let serverPID
try {
  writeFileSync(join(dir, 'electron.ts'), `import { EventEmitter } from 'node:events'; export const app = new EventEmitter(); export const handlers = new Map(); export const ipcMain = { handle: (name, fn) => handlers.set(name, fn) };`)
  writeFileSync(join(dir, 'server.mjs'), `import { writeFileSync } from 'node:fs'; const server = Bun.serve({hostname:'127.0.0.1',port:Number(process.env.PORT),fetch:()=>new Response('ok')}); writeFileSync(process.env.TEST_PID, String(process.pid)); console.log('http://127.0.0.1:'+server.port);`)
  writeFileSync(join(dir, 'main.ts'), `import { app, handlers } from './electron'; import { registerDevServerIpc } from ${JSON.stringify(join(root,'src/main/devserver.ts'))}; import { installShutdown } from ${JSON.stringify(join(root,'src/native/shutdown.ts'))}; registerDevServerIpc(()=>null); installShutdown(()=>app.emit('before-quit')); await handlers.get('devserver:start')({}, {root:${JSON.stringify(dir)},command:'bun server.mjs'}); console.log('READY');`)
  await build({entryPoints:[join(dir,'main.ts')],outfile:join(dir,'run.mjs'),bundle:true,platform:'node',format:'esm',packages:'external',alias:{electron:join(dir,'electron.ts')}})
  for (const signal of ['SIGINT','SIGTERM','SIGHUP']) {
    const pidFile = join(dir, signal)
    child = Bun.spawn([process.execPath, join(dir,'run.mjs')], {stdout:'pipe',stderr:'inherit',env:{...process.env,TEST_PID:pidFile}})
    const reader = child.stdout.getReader()
    let output = ''
    const ready = (async () => { while (!output.includes('READY')) { const {value,done}=await reader.read(); if(done) throw new Error(output); output+=new TextDecoder().decode(value) } })()
    await Promise.race([ready, new Promise((_,reject)=>setTimeout(()=>reject(new Error('Server startup timeout')),15000).unref())])
    assert(existsSync(pidFile)); serverPID = Number(readFileSync(pidFile,'utf8'))
    assert(!dead(serverPID))
    child.kill(signal)
    await child.exited
    for (let i=0;i<60 && !dead(serverPID);i++) await pause()
    assert(dead(serverPID), `${signal} left managed server ${serverPID} running`)
    console.log(`NATIVE SHUTDOWN PASS — ${signal} stops managed server`)
    serverPID = undefined; child = undefined
  }
} finally {
  child?.kill('SIGTERM')
  if (serverPID && !dead(serverPID)) process.kill(serverPID,'SIGTERM')
  rmSync(dir,{recursive:true,force:true})
}
