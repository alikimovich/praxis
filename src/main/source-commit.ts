import { writeFile } from 'fs/promises'
import type { PropEditResult } from '../shared/api'
import { recordEdit } from './edit-history'
import { contentHash, sourceOwner } from './source-owner'

export const STALE_PROPOSAL = 'The file changed since it was read, so nothing was written. Try the edit again.'

/**
 * Commit ONE parser proposal: `before` is the exact text the parser read and computed
 * `after` from. This is the only place a source-edit engine's result becomes a file
 * write (v8 F3b Undo included). Under the Swift owner the proposal is committed only
 * if the file still holds `before` (hash-bound: an external edit, a cancelled or an
 * out-of-order parse is refused with nothing written); the legacy owner writes as it
 * always did. A no-op (after === before) reports success without writing.
 *
 * `key` coalesces rapid edits of one target (retyping a prop) into one Undo step;
 * `group` batches the distinct-key edits of one gesture into one atomic Undo;
 * `gesture` keeps coalescing for as long as the gesture lasts (an island drag).
 */
export async function proposeEdit(
  root: string,
  file: string,
  before: string,
  after: string,
  key: string,
  group?: string,
  gesture = false
): Promise<PropEditResult> {
  if (after === before) return { applied: true }
  const owner = sourceOwner()
  if (owner) {
    try {
      const result = await owner.commit(root, [{ path: file, expectedHash: contentHash(before), content: after }], { key, group, gesture })
      return result.ok ? { applied: true } : { applied: false, error: STALE_PROPOSAL }
    } catch (error) {
      return { applied: false, error: error instanceof Error ? error.message : 'Could not write the source file.' }
    }
  }
  try {
    await writeFile(file, after, 'utf8')
  } catch {
    return { applied: false, error: 'Could not write the source file.' }
  }
  recordEdit(root, file, before, after, key, group, gesture ? Infinity : undefined)
  return { applied: true }
}
