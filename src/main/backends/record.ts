import { randomUUID } from 'node:crypto'
import { basename } from 'node:path'
import type { SessionRecord } from '../../shared/api'
import { EDIT_TOOLS, describeTool } from './tools'

/**
 * Builds a `SessionRecord` (v5-D "previous agents") as a provider session works,
 * for `agent.ts` to persist on teardown. Shared across backends so every provider
 * captures history the same way: call `appendAssistant` on each streamed text
 * chunk, `noteTool` on each tool-use, `finalize` at each turn boundary + teardown.
 * `agent.ts` reads `record` and calls `finalize` via the `ProviderSession` seam.
 */
export interface RecordCapture {
  record: SessionRecord
  /** Accumulate streamed assistant text (flushed into the transcript on finalize). */
  appendAssistant: (text: string) => void
  /** Note a tool-use line; adds to the transcript + records edited paths. */
  noteTool: (name: string, input: unknown) => void
  /** Flush the in-progress assistant buffer + sync filesTouched. Idempotent. */
  finalize: () => void
  /** Stamp the SDK's own resumable session id (v9 resume) onto the record, once
   *  it's known (off the `system`/init message). Claude-only today. */
  setSdkSessionId: (id: string) => void
}

export function createRecordCapture(root: string, projectKey: string): RecordCapture {
  const record: SessionRecord = {
    id: randomUUID(),
    projectKey,
    projectRoot: root,
    projectName: basename(root) || root,
    startedAt: Date.now(),
    endedAt: null,
    filesTouched: [],
    transcript: []
  }
  const touched = new Set<string>()
  let assistantBuf = ''

  const flushAssistant = (): void => {
    const text = assistantBuf.trim()
    if (text) record.transcript.push({ role: 'assistant', text, at: Date.now() })
    assistantBuf = ''
  }

  return {
    record,
    appendAssistant: (text) => {
      assistantBuf += text
    },
    noteTool: (name, input) => {
      // Keep the transcript readable: text-so-far precedes the tool line.
      flushAssistant()
      record.transcript.push({ role: 'status', text: describeTool(name, input), at: Date.now() })
      if (EDIT_TOOLS.has(name)) {
        const i = input as Record<string, unknown>
        const path = i?.file_path ?? i?.path
        if (typeof path === 'string' && path.trim()) touched.add(path.trim())
      }
    },
    finalize: () => {
      flushAssistant()
      record.filesTouched = [...touched]
    },
    setSdkSessionId: (id) => {
      record.sdkSessionId = id
    }
  }
}
