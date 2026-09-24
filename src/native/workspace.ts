import { existsSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

/** Profile-owned workspace storage, independent of WebKit's localhost origin. */
export function workspaceStorage(profile: string) {
  const path = join(profile, 'workspace.json')
  return {
    read(): string | null {
      if (!existsSync(path)) return null
      return readFileSync(path, 'utf8')
    },
    write(raw: string) {
      const value = JSON.parse(raw)
      if (!value || !Array.isArray(value.projects)) throw new Error('Invalid workspace')
      writeFileSync(`${path}.tmp`, raw, { mode: 0o600 })
      renameSync(`${path}.tmp`, path)
    }
  }
}
