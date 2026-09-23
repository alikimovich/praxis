import { fileURLToPath } from 'node:url'

if (process.platform !== 'darwin') {
  console.error('The native runtime currently requires macOS. Use bun run dev for Electron.')
  process.exit(1)
}

if (process.argv.includes('--help')) {
  console.log(
    'bun run dev:native [--project /path/to/repo]\nBuild and launch Praxis with Bun + WebKit. Use bun run test:native for integration checks.'
  )
  process.exit(0)
}
const args = process.argv.slice(2)
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--project' && args[i + 1]) {
    i++
    continue
  }
  if (['--test', '--live'].includes(args[i])) continue
  console.error(
    `Unknown native argument: ${args[i]}. Use --project /path/to/repo; Praxis manages its dev server.`
  )
  process.exit(1)
}

console.log('Building Praxis Native (Bun + system WebKit)…')
const cwd = fileURLToPath(new URL('../', import.meta.url))
const build = Bun.spawn([process.execPath, 'scripts/build-native.mjs'], {
  cwd,
  stdout: 'inherit',
  stderr: 'inherit'
})
const code = await build.exited
if (code) process.exit(code)
const child = Bun.spawn([process.execPath, 'out/native/index.cjs', ...args], {
  cwd,
  stdin: 'inherit',
  stdout: 'inherit',
  stderr: 'inherit'
})
process.on('SIGINT', () => child.kill('SIGINT'))
process.on('SIGTERM', () => child.kill('SIGTERM'))
process.exit(await child.exited)
