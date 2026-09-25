import assert from 'node:assert/strict'
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
  const host = fileURLToPath(new URL('../out/native/Praxis Native.app/Contents/MacOS/PraxisHost', import.meta.url))
  for (const args of [[], ['/tmp']]) {
    const direct = spawnSync(host, args, { encoding: 'utf8', timeout: 10000 })
    if (direct.error) throw direct.error
    assert.equal(direct.signal, null, 'Direct launch must not crash or trigger Crash Reporter')
    assert.equal(direct.status, 64)
    assert.match(direct.stderr, /requires the Bun service launcher/)
    assert.equal(direct.stdout, '')
  }
  console.log('Native host direct launch: missing arguments exit cleanly without a signal.')
  process.exitCode = result.status ?? 1
}
