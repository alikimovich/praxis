// A scripted package manager (installed as `bun` and `npm`) for the S13 workflow
// fixtures: records every call in $FAKE_PM_STATE and fails or stalls on demand
// (`fail: {install: n, build: n}`, `sleep: {install: ms}`). No network, no packages.
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { basename } from 'node:path'

const file = process.env.FAKE_PM_STATE
const state = existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : {}
state.calls ??= []; state.fail ??= {}; state.sleep ??= {}
const args = process.argv.slice(2)
const step = args[0] === 'run' ? 'build' : args[0]
state.calls.push([basename(process.argv[1]), ...args].join(' '))
writeFileSync(file, JSON.stringify(state, null, 2))
process.stdout.write(`${step}: resolving\n${step}: working in ${basename(process.cwd())}\n`)
if (state.sleep[step]) await new Promise(resolve => setTimeout(resolve, state.sleep[step]))
if (state.fail[step] > 0) {
  state.fail[step] -= 1
  writeFileSync(file, JSON.stringify(state, null, 2))
  process.stderr.write(`error: ${step} failed (fixture)\n`)
  process.exit(1)
}
process.stdout.write(`${step}: done\n`)
