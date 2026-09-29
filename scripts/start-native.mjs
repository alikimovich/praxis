import { existsSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs'
import { homedir, tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import '../src/shared/rename-compat.ts'
import { nativeProfilePath } from '../src/native/profile-path.ts'

export function nativeServiceLaunchSpec(root, args, env, bun, testDirectory = null) {
  const owner = env.TREZI_BACKEND_OWNER ?? 'swift'
  if (!['swift', 'legacy'].includes(owner)) throw new Error('TREZI_BACKEND_OWNER must be swift or legacy')
  const profile = resolve(testDirectory ? join(testDirectory, 'profile') : env.TREZI_USER_DATA || nativeProfilePath(join(homedir(), 'Library/Application Support')))
  const out = join(root, 'out/native')
  const host = join(out, 'Trezi Native.app/Contents/MacOS/TreziHost')
  const common = ['--bun', bun, '--backend', join(out, 'index.cjs'), '--profile', profile, '--', ...args]
  return {
    command: owner === 'legacy' ? join(out, 'TreziService') : host,
    args: owner === 'legacy' ? ['--legacy', '--host', host, ...common] : [out, testDirectory ? 'ephemeral' : 'persistent', '--service', ...common],
    env: { ...env, TREZI_USER_DATA: profile, ...(testDirectory ? { TREZI_NATIVE_TEST_DIR: testDirectory } : {}) },
    profile
  }
}

async function main() {
  if (process.platform !== 'darwin') throw new Error('Trezi requires macOS 13.3 or later.')
  const args = process.argv.slice(2)
  if (args[0] === '--wait-for-owner') {
    const pid = Number(args[1])
    if (!Number.isSafeInteger(pid) || pid <= 1) throw new Error('Invalid prior owner PID')
    args.splice(0, 2)
    const deadline = Date.now() + 15_000
    while (true) {
      try { process.kill(pid, 0) } catch (error) { if (error.code === 'ESRCH') break; throw error }
      if (Date.now() >= deadline) throw new Error('Prior service did not stop; restart refused')
      await Bun.sleep(100)
    }
  }
  const root = fileURLToPath(new URL('../', import.meta.url))
  const testDirectory = args.includes('--test') ? mkdtempSync(join(tmpdir(), 'trezi-native-')) : null
  try {
    const spec = nativeServiceLaunchSpec(root, args, process.env, process.execPath, testDirectory)
    mkdirSync(spec.profile, { recursive: true })
    const child = Bun.spawn([spec.command, ...spec.args], { cwd: root, env: spec.env, stdin: 'inherit', stdout: 'inherit', stderr: 'inherit' })
    for (const signal of ['SIGINT', 'SIGTERM', 'SIGHUP']) process.on(signal, () => child.kill(signal))
    process.exitCode = await child.exited
  } finally {
    if (testDirectory) {
      // A failed host must not remove stores while its XPC service still drains.
      const marker = join(testDirectory, 'service-stopped')
      const deadline = Date.now() + 10_000
      while (!existsSync(marker) && Date.now() < deadline) await Bun.sleep(100)
      if (existsSync(marker)) rmSync(testDirectory, { recursive: true, force: true })
      else console.error(`Retained test profile pending service shutdown: ${testDirectory}`)
    }
  }
}
if (import.meta.main) main().catch(error => { console.error(error); process.exitCode = 1 })
