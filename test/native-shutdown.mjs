import { build, stop } from 'esbuild'
import { spawn } from 'node:child_process'
import { once } from 'node:events'
import { mkdtempSync, writeFileSync, rmSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import assert from 'node:assert/strict'

const dir = mkdtempSync(join(tmpdir(), 'praxis-shutdown-'))
const root = resolve('.')
const pause = () => new Promise(r => setTimeout(r, 25))
const dead = pid => { try { process.kill(pid, 0); return false } catch { return true } }
let child, serverPID
const unrelated = Bun.serve({ hostname: '127.0.0.1', port: 0, fetch: () => new Response('unrelated') })
try {
  writeFileSync(join(dir, 'package.json'), JSON.stringify({ scripts: { dev: 'bun server.mjs', app: 'bun launcher.mjs' } }))
  writeFileSync(join(dir, 'server.mjs'), `import { writeFileSync } from 'node:fs';
    if (process.env.STUBBORN === '1') process.on('SIGTERM', () => {});
    const server = Bun.serve({hostname:'127.0.0.1',port:Number(process.env.PORT),fetch:()=>new Response('ok')});
    writeFileSync(process.env.TEST_PID, JSON.stringify({pid:process.pid,port:server.port})); console.log('http://127.0.0.1:'+server.port);`)
  writeFileSync(join(dir, 'main.ts'), `
    import { app } from ${JSON.stringify(join(root, 'src/native/platform.ts'))};
    import { registerDevServerIpc } from ${JSON.stringify(join(root, 'src/main/devserver.ts'))};
    import { installShutdown } from ${JSON.stringify(join(root, 'src/native/shutdown.ts'))};
    import { drainDevServers, forceStopDevServers } from ${JSON.stringify(join(root, 'src/main/devserver-processes.ts'))};
    const handlers = new Map(); registerDevServerIpc(()=>null,{handle:(name,fn)=>handlers.set(name,fn)});
    installShutdown(async()=>{app.emit('before-quit'); await drainDevServers()}, forceStopDevServers);
    const managed = await handlers.get('devserver:start')({}, {root:${JSON.stringify(dir)},command:'bun run dev'});
    console.log('READY');
    if (process.env.WRAPPER_EXIT === '1') setTimeout(()=>process.kill(managed.pid, 'SIGKILL'),100);
    if (process.env.EXPLICIT_EXIT === '1') setTimeout(()=>process.exit(0),100);
  `)
  // Same signal forwarding as the dev launcher, plus bun run's outer script wrapper.
  writeFileSync(join(dir, 'launcher.mjs'), `
    const child = Bun.spawn([process.execPath, 'run.mjs'], {stdin:'inherit',stdout:'inherit',stderr:'inherit'});
    for(const signal of ['SIGINT','SIGTERM','SIGHUP']) process.on(signal,()=>child.kill(signal));
    process.exit(await child.exited);
  `)
  await build({entryPoints:[join(dir,'main.ts')],outfile:join(dir,'run.mjs'),bundle:true,platform:'node',format:'esm',packages:'external'})
  const cases = [
    ...['SIGINT', 'SIGTERM', 'SIGHUP'].flatMap(signal => [
      { signal, stubborn: false, terminal: false },
      { signal, stubborn: true, terminal: true }
    ]),
    { signal: null, stubborn: true, terminal: false },
    { signal: null, stubborn: true, terminal: false, wrapperExit: true }
  ]
  for (const [i, scenario] of cases.entries()) {
    const pidFile = join(dir, `pid-${i}`)
    child = spawn(process.execPath, scenario.terminal ? ['run', 'app'] : ['run.mjs'], {
      cwd: dir, detached: true, stdio: ['ignore', 'pipe', 'inherit'],
      env: { ...process.env, TEST_PID: pidFile, STUBBORN: scenario.stubborn ? '1' : '0', EXPLICIT_EXIT: scenario.signal || scenario.wrapperExit ? '0' : '1', WRAPPER_EXIT: scenario.wrapperExit ? '1' : '0' }
    })
    const exited = once(child, 'exit')
    let output = ''
    const ready = (async () => { for await (const chunk of child.stdout) { output += chunk; if (output.includes('READY')) return } throw new Error(output) })()
    await Promise.race([ready, new Promise((_,reject)=>setTimeout(()=>reject(new Error('Server startup timeout')),15000).unref())])
    const server = JSON.parse(readFileSync(pidFile,'utf8')); serverPID = server.pid
    assert(!dead(serverPID))
    if (scenario.signal) {
      if (scenario.terminal) process.kill(-child.pid, scenario.signal)
      else child.kill(scenario.signal)
    }
    await Promise.race([exited, new Promise((_,reject)=>setTimeout(()=>reject(new Error('Shutdown timeout')),5000).unref())])
    for (let i=0;i<100 && !dead(serverPID);i++) await pause()
    assert(dead(serverPID), `${JSON.stringify(scenario)} left managed server ${serverPID} running`)
    await assert.rejects(fetch(`http://127.0.0.1:${server.port}`), 'managed listener must stop')
    assert.equal(await (await fetch(unrelated.url)).text(), 'unrelated')
    console.log(`NATIVE SHUTDOWN PASS — ${JSON.stringify(scenario)}`)
    serverPID = undefined; child = undefined
  }
} finally {
  stop(); unrelated.stop(true)
  if (child?.pid) { try { process.kill(-child.pid,'SIGKILL') } catch {} }
  if (serverPID && !dead(serverPID)) process.kill(serverPID,'SIGKILL')
  rmSync(dir,{recursive:true,force:true})
}
