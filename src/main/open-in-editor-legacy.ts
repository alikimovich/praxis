import { execFile } from 'child_process'
import { promisify } from 'util'
import { openPath } from '../native/platform-legacy'

/**
 * "Open in editor" without the Swift platform owner (`TREZI_BACKEND_OWNER=legacy`, unit
 * tests): the rollback twin of `PlatformOpen.editor` (LKM-102). The caller has already
 * resolved the stamp to an existing file inside the project.
 */
const execFileP = promisify(execFile)

// Editor CLIs tried in order — each accepts a file:line[:col] jump target. A missing
// CLI fails fast (ENOENT) and the next is tried; when none exist the file opens with
// the OS default app (no jump).
const EDITOR_CLIS: Array<{ cmd: string; args: (target: string) => string[] }> = [
  { cmd: 'code', args: (t) => ['-g', t] },
  { cmd: 'cursor', args: (t) => ['-g', t] },
  { cmd: 'zed', args: (t) => [t] },
  { cmd: 'subl', args: (t) => [t] }
]

export async function openInEditorLegacy(loc: { file: string; line: number; column?: number }): Promise<{ ok: boolean; error?: string }> {
  const target = `${loc.file}:${loc.line}${loc.column != null ? `:${loc.column}` : ''}`
  for (const editor of EDITOR_CLIS) {
    try {
      await execFileP(editor.cmd, editor.args(target), { timeout: 5000 })
      return { ok: true }
    } catch {
      /* not installed / failed — try the next */
    }
  }
  const err = await openPath(loc.file) // '' on success
  return err ? { ok: false, error: err } : { ok: true }
}
