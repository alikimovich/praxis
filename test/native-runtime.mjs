import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

if (process.platform !== 'darwin') {
  console.log('NATIVE-RUNTIME SKIP — macOS native host required.')
} else if (spawnSync('xcrun', ['--find', 'swiftc'], { stdio: 'ignore' }).status !== 0) {
  console.log('NATIVE-RUNTIME SKIP — Xcode command-line tools are not installed.')
} else {
  const cwd = fileURLToPath(new URL('../', import.meta.url))
  const result = spawnSync('bun', ['run', 'dev:native', '--test', ...process.argv.slice(2)], {
    cwd,
    stdio: 'inherit',
    timeout: 300000
  })
  if (result.error) throw result.error
  process.exitCode = result.status ?? 1
}
