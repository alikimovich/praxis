import type { BrowserWindow } from 'electron'
import type { Query, SDKUserMessage } from '@anthropic-ai/claude-agent-sdk'
import type { AgentEvent, AgentOptions, PermissionRequest } from '../../shared/api'
import { projectKey } from '../../shared/projectKey'
import type { ModelProvider, PendingPrompt, ProviderSession } from './types'
import { AUTO_ALLOW_TOOLS, describeTool, toolDetail, touchesSidecar } from './tools'
import { createRecordCapture } from './record'

// The Agent SDK is ESM-only; this CJS main bundle must reach it via a dynamic
// import() (preserved by Rollup for external deps) rather than a static require.
type SdkModule = typeof import('@anthropic-ai/claude-agent-sdk')
let sdkPromise: Promise<SdkModule> | null = null
const loadSdk = (): Promise<SdkModule> => (sdkPromise ??= import('@anthropic-ai/claude-agent-sdk'))

/** A push-driven async queue of user messages for the SDK's streaming input. */
class InputStream implements AsyncIterable<SDKUserMessage> {
  private buffer: SDKUserMessage[] = []
  private waiting: ((r: IteratorResult<SDKUserMessage>) => void)[] = []
  private closed = false

  push(text: string): void {
    const msg = {
      type: 'user',
      message: { role: 'user', content: text }
    } as unknown as SDKUserMessage
    const next = this.waiting.shift()
    if (next) next({ value: msg, done: false })
    else this.buffer.push(msg)
  }

  close(): void {
    this.closed = true
    let r: ((res: IteratorResult<SDKUserMessage>) => void) | undefined
    while ((r = this.waiting.shift())) r({ value: undefined as never, done: true })
  }

  [Symbol.asyncIterator](): AsyncIterator<SDKUserMessage> {
    return {
      next: (): Promise<IteratorResult<SDKUserMessage>> => {
        const buffered = this.buffer.shift()
        if (buffered) return Promise.resolve({ value: buffered, done: false })
        if (this.closed) return Promise.resolve({ value: undefined as never, done: true })
        return new Promise((resolve) => this.waiting.push(resolve))
      }
    }
  }
}

/** Pull a text delta out of a streaming partial-message event, shape-tolerant. */
function textDelta(msg: unknown): string | null {
  const event = (msg as { event?: { type?: string; delta?: { type?: string; text?: string } } })
    .event
  if (event?.type === 'content_block_delta' && event.delta?.type === 'text_delta') {
    return event.delta.text ?? null
  }
  return null
}

/**
 * The incumbent backend: a persistent multi-turn Claude Agent SDK `query()` with
 * `cwd` = the opened repo, so the repo's CLAUDE.md + .claude/skills are discovered
 * (`settingSources`). Auth = the user's Claude subscription (`claude login` /
 * `setup-token`). This is the verbatim pre-v7 `startSession`, now behind the
 * `ModelProvider` seam.
 */
async function startSession(
  root: string,
  options: AgentOptions,
  getWindow: () => BrowserWindow | null
): Promise<ProviderSession> {
  const key = projectKey(root)
  const cap = createRecordCapture(root, key)
  const { query } = await loadSdk()
  const input = new InputStream()
  const abort = new AbortController()
  const pending = new Map<string, PendingPrompt>()
  // Per-session: disposed when replaced/closed; namespaces fallback permission ids.
  let disposed = false
  let permCounter = 0

  const emit = (event: AgentEvent): void => {
    if (disposed) return
    getWindow()?.webContents.send('agent:event', { ...event, projectKey: key })
  }

  const q: Query = query({
    prompt: input,
    options: {
      cwd: root,
      settingSources: ['user', 'project', 'local'],
      systemPrompt: { type: 'preset', preset: 'claude_code' },
      includePartialMessages: true,
      permissionMode: options.permissionMode ?? 'default',
      allowDangerouslySkipPermissions: true,
      abortController: abort,
      ...(options.model ? { model: options.model } : {}),
      ...(options.effort ? { effort: options.effort as 'low' | 'medium' | 'high' } : {}),
      canUseTool: async (toolName, toolInput, opts) => {
        if (touchesSidecar(toolName, toolInput)) {
          return {
            behavior: 'deny',
            message: 'The .dsgn/ sidecar is managed by dsgn, not the agent.'
          }
        }
        if (AUTO_ALLOW_TOOLS.has(toolName)) {
          emit({ type: 'status', text: describeTool(toolName, toolInput) })
          return { behavior: 'allow', updatedInput: toolInput }
        }
        if (disposed || abort.signal.aborted || opts.signal.aborted) {
          return { behavior: 'deny', message: 'Session no longer active.' }
        }
        emit({ type: 'status', text: describeTool(toolName, toolInput) })
        const id = opts.toolUseID || `${key}:perm${++permCounter}`
        const request: PermissionRequest = {
          id,
          toolName,
          title: opts.title || `Allow ${toolName}?`,
          ...(opts.displayName ? { displayName: opts.displayName } : {}),
          ...(toolDetail(toolName, toolInput) ? { detail: toolDetail(toolName, toolInput)! } : {})
        }
        return await new Promise((resolve) => {
          const cleanup = (): void => {
            pending.delete(id)
            opts.signal.removeEventListener('abort', onAbort)
          }
          const onAbort = (): void => {
            cleanup()
            emit({ type: 'permission-resolved', id })
            resolve({ behavior: 'deny', message: 'Interrupted.' })
          }
          pending.set(id, {
            toolName,
            settle: (behavior) => {
              cleanup()
              resolve(
                behavior === 'allow'
                  ? { behavior: 'allow', updatedInput: toolInput }
                  : { behavior: 'deny', message: 'Denied by the user in dsgn.' }
              )
            }
          })
          opts.signal.addEventListener('abort', onAbort, { once: true })
          emit({ type: 'permission-request', request })
        })
      }
    }
  })

  // Drive the output stream for the life of the session.
  void (async () => {
    let streamedText = false
    try {
      for await (const msg of q) {
        switch (msg.type) {
          case 'system': {
            const commands = (msg as { subtype?: string; slash_commands?: string[] }).slash_commands
            if ((msg as { subtype?: string }).subtype === 'init' && Array.isArray(commands)) {
              emit({ type: 'commands', commands })
            }
            break
          }
          case 'stream_event': {
            const text = textDelta(msg)
            if (text) {
              streamedText = true
              cap.appendAssistant(text)
              emit({ type: 'delta', text })
            }
            break
          }
          case 'assistant': {
            for (const block of msg.message.content) {
              if (block.type === 'text' && !streamedText) {
                cap.appendAssistant(block.text)
                emit({ type: 'delta', text: block.text })
              } else if (block.type === 'tool_use') {
                // Capture in the assistant stream (not canUseTool) so tools are
                // recorded even under bypassPermissions, where canUseTool is skipped.
                cap.noteTool(block.name, block.input)
                emit({ type: 'status', text: describeTool(block.name, block.input) })
              }
            }
            break
          }
          case 'result': {
            cap.finalize()
            emit({ type: 'done' })
            streamedText = false
            break
          }
        }
      }
    } catch (err) {
      if (!abort.signal.aborted) {
        emit({ type: 'error', message: err instanceof Error ? err.message : String(err) })
      }
    }
  })()

  return {
    key,
    root,
    options,
    send: (text) => input.push(text),
    pending,
    emit,
    record: cap.record,
    finalize: cap.finalize,
    dispose: () => {
      disposed = true
    },
    shutdown: () => {
      abort.abort()
      input.close()
    },
    setModel: async (model) => {
      await q.setModel?.(model)
    },
    setPermissionMode: async (mode) => {
      await q.setPermissionMode?.(mode)
    },
    interrupt: async () => {
      await q.interrupt?.()
    }
  }
}

export const claudeProvider: ModelProvider = { id: 'claude', startSession }
