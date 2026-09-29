import { spawnSync } from 'node:child_process'
import { chmodSync, copyFileSync, existsSync, mkdirSync, readFileSync, renameSync, rmSync, statSync } from 'node:fs'
import { dirname, join } from 'node:path'

/**
 * Copies the Bun that runs the build into `Trezi.app/Contents/Helpers/bun`, the runtime
 * `open -a Trezi` starts the backend and the provider helpers with (`HostLaunch.swift`),
 * so no installed Bun is needed once Trezi is built. An identical copy is left alone
 * (an update rebuilds with the bundled Bun itself); a new one replaces the old by
 * rename, never in place, because a running Trezi may be executing it. A copy without
 * a valid signature is signed ad hoc so the app bundle can be sealed.
 */
export function bundleBun(contents, source = process.execPath) {
  const target = join(contents, 'Helpers/bun')
  mkdirSync(dirname(target), { recursive: true })
  if (existsSync(target) && statSync(target).size === statSync(source).size &&
      Bun.hash(readFileSync(target)) === Bun.hash(readFileSync(source))) return { path: target, copied: false }
  const temporary = `${target}.${process.pid}.tmp`
  try {
    copyFileSync(source, temporary)
    chmodSync(temporary, 0o755)
    if (spawnSync('codesign', ['--verify', temporary]).status !== 0) {
      const signed = spawnSync('codesign', ['--force', '--sign', '-', temporary], { encoding: 'utf8' })
      if (signed.status !== 0) throw new Error(`Could not sign the bundled Bun: ${signed.stderr}`)
    }
    renameSync(temporary, target)
  } finally { rmSync(temporary, { force: true }) }
  return { path: target, copied: true }
}
