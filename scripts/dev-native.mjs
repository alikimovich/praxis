import { fileURLToPath } from 'node:url'

if (process.platform !== 'darwin') {
  console.error('The native runtime prototype currently requires macOS. Use bun run dev for Electron.')
  process.exit(1)
}

console.log('Launching the native runtime prototype (the full Praxis app still uses bun run dev).')
const cwd = fileURLToPath(new URL('../experimental/native-runtime/', import.meta.url))
const child = Bun.spawn([process.execPath, 'run', 'dev', ...process.argv.slice(2)], {
  cwd,
  stdin: 'inherit',
  stdout: 'inherit',
  stderr: 'inherit'
})
process.on('SIGINT', () => child.kill('SIGINT'))
process.on('SIGTERM', () => child.kill('SIGTERM'))
process.exit(await child.exited)
