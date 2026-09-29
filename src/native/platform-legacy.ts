import { execFile, spawnSync } from 'node:child_process'
import { resolve } from 'node:path'
import { promisify } from 'node:util'

/**
 * The rollback twin of the platform owner's `PlatformOpen.swift` and of the provider
 * owner's Keychain helper calls (LKM-102): Bun's own `/usr/bin/open` runs and
 * `TreziHost --crypto` spawns. `native/platform.ts` reaches the open calls only with no
 * Swift platform owner, and `main/provider-data.ts` the cipher only with no Swift
 * provider data owner (`TREZI_BACKEND_OWNER=legacy`, unit tests).
 */
const run = promisify(execFile)

export async function openExternal(url: string): Promise<void> {
  if (!/^https?:\/\//i.test(url)) throw new Error('Only HTTP(S) external links are supported')
  await run('/usr/bin/open', [url])
}

/** '' on success, else the failure text. */
export async function openPath(path: string): Promise<string> {
  try {
    await run('/usr/bin/open', [resolve(path)])
    return ''
  } catch (error) {
    return String(error)
  }
}

// AES-GCM with a random key held in the macOS Keychain. No secrets in argv.
function crypt(operation: string, value: Buffer) {
  const executable = process.env.TREZI_NATIVE_HOST
  if (!executable) throw new Error('Native Keychain helper unavailable')
  const result = spawnSync(executable, ['--crypto', operation], {
    input: value,
    maxBuffer: 16 * 1024 * 1024
  })
  if (result.status !== 0)
    throw new Error('macOS Keychain encryption unavailable; unlock the keychain and retry.')
  return result.stdout
}
export const safeStorage = {
  isEncryptionAvailable: () => process.platform === 'darwin',
  getSelectedStorageBackend: () => 'keychain',
  encryptString: (text: string) => crypt('encrypt', Buffer.from(text)),
  decryptString: (blob: Buffer) => crypt('decrypt', blob).toString('utf8')
}
