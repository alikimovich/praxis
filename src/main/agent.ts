import { app, ipcMain, type BrowserWindow } from 'electron'
import type { Query, SDKUserMessage } from '@anthropic-ai/claude-agent-sdk'
import type { AgentEvent, AgentOptions } from '../shared/api'

// The Agent SDK is ESM-only; this CJS main bundle must reach it via a dynamic
// import() (preserved by Rollup for external deps) rather than a static require.
type SdkModule = typeof import('@anthropic-ai/claude-agent-sdk')
let sdkPromise: Promise<SdkModule> | null = null
const loadSdk = (): Promise<SdkModule> =>
  (sdkPromise ??= import('@anthropic-ai/claude-agent-sdk'))

/**
 * Agent session — a persistent multi-turn Claude Agent SDK `query()` running in
 * the main process with `cwd` set to the opened repo, so the repo's CLAUDE.md
 * and .claude/skills are discovered (via `settingSources`).
 *
 * Each `agent:send` pushes a user message into the session's input stream; the
 * SDK's output is forwarded to the renderer over `agent:event` as text deltas,
 * tool-use status lines, and a `done` at each turn boundary.
 *
 * Auth: per-user Claude subscription. The SDK uses the credentials from
 * `claude login` / `claude setup-token` (CLAUDE_CODE_OAUTH_TOKEN) or an
 * ANTHROPIC_API_KEY in the environment.
 *
 * NOTE: tool permissions are auto-approved for now (internal tool, user's own
 * repo) and surfaced as status lines. Real approve/deny UI lands with the
 * assistant-ui chat.
 */

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

interface Session {
  root: string
  options: AgentOptions
  input: InputStream
  query: Query
  abort: AbortController
}

let session: Session | null = null
// Bumped whenever the active session changes; a session's output loop only
// emits while its epoch is current, so a replaced/aborted session can't leak
// stale events into the next project's chat.
let currentEpoch = 0

async function startSession(
  root: string,
  options: AgentOptions,
  epoch: number,
  getWindow: () => BrowserWindow | null
): Promise<Session> {
  const { query } = await loadSdk()
  const input = new InputStream()
  const abort = new AbortController()

  const emit = (event: AgentEvent): void => {
    if (epoch !== currentEpoch) return
    getWindow()?.webContents.send('agent:event', event)
  }

  const q = query({
    prompt: input,
    options: {
      cwd: root,
      settingSources: ['user', 'project', 'local'],
      systemPrompt: { type: 'preset', preset: 'claude_code' },
      includePartialMessages: true,
      permissionMode: 'default',
      abortController: abort,
      ...(options.model ? { model: options.model } : {}),
      ...(options.effort ? { effort: options.effort as 'low' | 'medium' | 'high' } : {}),
      canUseTool: async (toolName, toolInput) => {
        emit({ type: 'status', text: describeTool(toolName, toolInput) })
        return { behavior: 'allow', updatedInput: toolInput }
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
            // The init message advertises the available slash commands for this
            // cwd (repo skills/commands + built-ins) — surface them for the menu.
            const commands = (msg as { subtype?: string; slash_commands?: string[] })
              .slash_commands
            if ((msg as { subtype?: string }).subtype === 'init' && Array.isArray(commands)) {
              emit({ type: 'commands', commands })
            }
            break
          }
          case 'stream_event': {
            const text = textDelta(msg)
            if (text) {
              streamedText = true
              emit({ type: 'delta', text })
            }
            break
          }
          case 'assistant': {
            for (const block of msg.message.content) {
              if (block.type === 'text' && !streamedText) {
                emit({ type: 'delta', text: block.text })
              } else if (block.type === 'tool_use') {
                emit({ type: 'status', text: describeTool(block.name, block.input) })
              }
            }
            break
          }
          case 'result': {
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

  return { root, options, input, query: q, abort }
}

/** Pull a text delta out of a streaming partial-message event, shape-tolerant. */
function textDelta(msg: unknown): string | null {
  const event = (msg as { event?: { type?: string; delta?: { type?: string; text?: string } } }).event
  if (event?.type === 'content_block_delta' && event.delta?.type === 'text_delta') {
    return event.delta.text ?? null
  }
  return null
}

function describeTool(name: string, input: unknown): string {
  const i = input as Record<string, unknown>
  const path = i?.file_path ?? i?.path ?? i?.pattern ?? i?.command
  return path ? `${name} · ${String(path)}` : name
}

export function registerAgentIpc(getWindow: () => BrowserWindow | null): void {
  ipcMain.handle('agent:open-project', async (_e, root: string, options: AgentOptions = {}) => {
    session?.abort.abort()
    session?.input.close()
    session = null
    const epoch = ++currentEpoch
    session = await startSession(root, options, epoch, getWindow)
  })

  ipcMain.handle('agent:set-model', async (_e, model: string) => {
    if (!session) return
    session.options.model = model
    await session.query.setModel?.(model)
  })

  ipcMain.handle('agent:send', async (_e, text: string) => {
    if (!session) {
      getWindow()?.webContents.send('agent:event', {
        type: 'error',
        message: 'Open a project first — the agent works inside a repo.'
      } satisfies AgentEvent)
      return
    }
    session.input.push(text)
  })

  ipcMain.handle('agent:interrupt', async () => {
    await session?.query.interrupt?.()
  })

  // Don't leave the SDK's CLI subprocess running after dsgn quits.
  app.on('before-quit', () => {
    currentEpoch++
    session?.abort.abort()
    session?.input.close()
  })
}
