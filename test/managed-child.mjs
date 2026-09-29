import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { once } from 'node:events'
import { mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const directory = mkdtempSync(join(tmpdir(), 'trezi-managed-child-'))
const guardian = join(directory, 'guardian')
const helper = fileURLToPath(new URL('../src/main/managed-child.ts', import.meta.url))
writeFileSync(guardian, `#!/usr/bin/env bun
import { readSync } from 'node:fs'
const data = Buffer.alloc(8)
const count = readSync(3, data, 0, 8, null)
console.log(JSON.stringify({args:process.argv.slice(2), lifetime:data.subarray(0,count).toString(), cwd:process.cwd(), value:process.env.FIXTURE_VALUE}))
`, { mode: 0o755 })
try {
  const child = spawn(process.execPath, ['-e', `
    import { spawnManagedCommand, isGuardedChild } from ${JSON.stringify(helper)}
    const child = spawnManagedCommand('echo "original shell command"', {cwd:${JSON.stringify(directory)},env:{...process.env,FIXTURE_VALUE:'preserved'}})
    if (!isGuardedChild(child)) process.exit(3)
    child.stdout.pipe(process.stdout)
    child.stderr.pipe(process.stderr)
    child.once('exit', code => process.exit(code ?? 4))
  `], { env: { ...process.env, TREZI_SERVICE_LOCKED: '1', TREZI_SERVICE_EXECUTABLE: guardian }, stdio: ['ignore', 'pipe', 'pipe', 'pipe'] })
  let output = '', errors = ''
  child.stdout.on('data', data => { output += data })
  child.stderr.on('data', data => { errors += data })
  child.stdio[3].end('alive')
  const [code] = await once(child, 'close')
  assert.equal(code, 0, errors)
  assert.deepEqual(JSON.parse(output), { args: ['--guard', '/bin/sh', '-c', 'echo "original shell command"'], lifetime: 'alive', cwd: realpathSync(directory), value: 'preserved' })
  const denied = spawn(process.execPath, ['-e', `import { spawnManagedCommand } from ${JSON.stringify(helper)}; spawnManagedCommand('exit 0',{cwd:'/',env:process.env})`], { env: { ...process.env, TREZI_SERVICE_LOCKED:'1', TREZI_SERVICE_EXECUTABLE:'' }, stdio:'ignore' })
  const [deniedCode] = await once(denied,'close')
  assert.notEqual(deniedCode,0,'supervised domain spawn fails closed without Swift guardian')
} finally { rmSync(directory, {recursive:true,force:true}) }
console.log('MANAGED CHILD PASS — exact shell command, cwd/env and lifetime fd preserved; missing guardian denied')
