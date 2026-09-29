// Deliberately small Bun legacy service for real process supervision checks.
import { spawn } from 'node:child_process'
import { EventEmitter } from 'node:events'
import { createInterface } from 'node:readline'
import { renameSync, writeFileSync } from 'node:fs'
// Rename into place: a reader polling for the path must never see it empty.
const publish = (path, pid) => { writeFileSync(`${path}.tmp`, String(pid)); renameSync(`${path}.tmp`, path) }
if (process.env.FIXTURE_DESCENDANT) {
  const child = spawn(process.execPath, ['-e', "process.on('SIGTERM',()=>{});setInterval(()=>{},1000)"], { stdio: 'ignore' })
  publish(process.env.FIXTURE_DESCENDANT, child.pid)
}
if (process.env.FIXTURE_PID) publish(process.env.FIXTURE_PID, process.pid)
// Bun's real preferences client, on the same private pipe as NativeBridge.sendService.
const service = Object.assign(new EventEmitter(), { sendService: frame => process.stdout.write(`${JSON.stringify(frame)}\n`) })
for await (const line of createInterface({ input: process.stdin })) {
  const command = JSON.parse(line)
  if (command.event === 'service-reply' || command.event === 'service-event') { service.emit(command.event, command); continue }
  if (command.event === 'fixturePreferences') {
    // Not awaited: this loop must keep reading the service's replies.
    void (async () => {
      const { servicePreferences } = await import(new URL('../../../src/native/preferences-service.ts', import.meta.url).href)
      const prefs = await servicePreferences(service, 10_000)
      const before = prefs.get(command.key)
      await prefs.set(command.key, command.value)
      process.stdout.write(`${JSON.stringify({ method: 'fixturePreferences', before, after: prefs.get(command.key) })}\n`)
    })().catch(error => process.stdout.write(`${JSON.stringify({ method: 'fixturePreferences', error: String(error) })}\n`))
    continue
  }
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
