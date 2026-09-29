// Deliberately small Bun legacy service for real process supervision checks.
import { spawn } from 'node:child_process'
import { createInterface } from 'node:readline'
import { renameSync, writeFileSync } from 'node:fs'
// Rename into place: a reader polling for the path must never see it empty.
const publish = (path, pid) => { writeFileSync(`${path}.tmp`, String(pid)); renameSync(`${path}.tmp`, path) }
if (process.env.FIXTURE_DESCENDANT) {
  const child = spawn(process.execPath, ['-e', "process.on('SIGTERM',()=>{});setInterval(()=>{},1000)"], { stdio: 'ignore' })
  publish(process.env.FIXTURE_DESCENDANT, child.pid)
}
if (process.env.FIXTURE_PID) publish(process.env.FIXTURE_PID, process.pid)
for await (const line of createInterface({ input: process.stdin })) {
  const command = JSON.parse(line)
  if (command.type === 'quit' || command.type === 'shutdown') process.exit(0)
  if (command.event === 'fixtureExit') process.exit(17)
  if (command.event === 'fixtureStatic') {
    // The product's static server and watcher, inside the supervised backend.
    const { startStaticServer } = await import(new URL('../../../src/main/static-server.ts', import.meta.url).href)
    const { server } = await startStaticServer({ root: command.root, port: 0, host: '127.0.0.1' },
      line => process.stderr.write(`FIXTURE-STATIC ${line}\n`))
    process.stdout.write(`${JSON.stringify({ method: 'fixtureStatic', url: `http://127.0.0.1:${server.address().port}` })}\n`)
    continue
  }
  if (command.stderr) process.stderr.write(`FIXTURE-STDERR ${command.value}\n`)
  process.stdout.write(`${JSON.stringify({ method: 'fixtureEcho', ...command })}\n`)
}
