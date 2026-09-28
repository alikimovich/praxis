// Deliberately small Bun legacy service for real process supervision checks.
import { spawn } from 'node:child_process'
import { createInterface } from 'node:readline'
import { writeFileSync } from 'node:fs'
if (process.env.FIXTURE_DESCENDANT) {
  const child = spawn(process.execPath, ['-e', "process.on('SIGTERM',()=>{});setInterval(()=>{},1000)"], { stdio: 'ignore' })
  writeFileSync(process.env.FIXTURE_DESCENDANT, String(child.pid))
}
if (process.env.FIXTURE_PID) writeFileSync(process.env.FIXTURE_PID, String(process.pid))
for await (const line of createInterface({ input: process.stdin })) {
  const command = JSON.parse(line)
  if (command.type === 'quit' || command.type === 'shutdown') process.exit(0)
  if (command.event === 'fixtureExit') process.exit(17)
  if (command.stderr) process.stderr.write(`FIXTURE-STDERR ${command.value}\n`)
  process.stdout.write(`${JSON.stringify({ method: 'fixtureEcho', ...command })}\n`)
}
