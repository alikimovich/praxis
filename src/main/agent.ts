import { app, ipcMain, type BrowserWindow } from 'electron'
import type { Query, SDKUserMessage } from '@anthropic-ai/claude-agent-sdk'
import type { AgentEvent, AgentOptions, PermissionMode, PermissionRequest } from '../shared/api'
import { projectKey } from '../shared/projectKey'

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

interface PendingPrompt {
  toolName: string
  settle: (behavior: 'allow' | 'deny') => void
}

interface Session {
  /** projectKey(root) — the map identity. */
  key: string
  root: string
  options: AgentOptions
  input: InputStream
  query: Query
  abort: AbortController
  /** In-flight approve/deny prompts, keyed by request id. */
  pending: Map<string, PendingPrompt>
  /** Emit an agent event to the renderer, tagged with this project's key (the
   * renderer routes it; emits while the session is live, not just when active). */
  emit: (event: AgentEvent) => void
  /** Stop this session emitting (replaced / closed). */
  dispose: () => void
}

// v5: one persistent session per open project (keyed by projectKey). Only the
// ACTIVE project's session streams to the renderer; the guard is forward-looking
// for the rail (which will keep backgrounded sessions warm). Today the renderer
// is single-active — it closes a project's session when switching away — so no
// backgrounded-but-live session exists yet.
const sessions = new Map<string, Session>()
let activeKey: string | null = null
const activeSession = (): Session | null => (activeKey ? (sessions.get(activeKey) ?? null) : null)

/** Tear down a session: stop it emitting, deny its prompts, abort, close input. */
function closeSession(s: Session): void {
  s.dispose()
  ;[...s.pending.keys()].forEach((id) => resolvePending(s, id, 'deny'))
  s.abort.abort()
  s.input.close()
}

// Read-only tools are auto-approved even in "Ask" mode — they can't mutate the
// repo, and prompting for every file read would make the agent unusable. The
// cards are reserved for writes / Bash / anything that can change or exfiltrate.
const AUTO_ALLOW_TOOLS = new Set(['Read', 'Glob', 'Grep', 'LS', 'NotebookRead'])
// Tools that 'acceptEdits' auto-approves (mirrors the SDK's edit semantics).
const EDIT_TOOLS = new Set(['Edit', 'Write', 'MultiEdit', 'NotebookEdit'])

/** Settle a pending prompt and tell the renderer to drop its card. */
function resolvePending(s: Session, id: string, behavior: 'allow' | 'deny'): void {
  const p = s.pending.get(id)
  if (!p) return
  p.settle(behavior)
  s.emit({ type: 'permission-resolved', id })
}

async function startSession(
  root: string,
  options: AgentOptions,
  getWindow: () => BrowserWindow | null
): Promise<Session> {
  const key = projectKey(root)
  const { query } = await loadSdk()
  const input = new InputStream()
  const abort = new AbortController()
  const pending = new Map<string, PendingPrompt>()
  // Per-session: disposed when replaced/closed; namespaces fallback permission ids.
  let disposed = false
  let permCounter = 0

  // Every live (non-disposed) session emits, TAGGED with its project key — the
  // renderer routes the active project to the live chat and backgrounded projects
  // to their own buffer (a "working" dot in the rail). A replaced session is
  // disposed, so reopening a project can't leak stale events.
  const emit = (event: AgentEvent): void => {
    if (disposed) return
    getWindow()?.webContents.send('agent:event', { ...event, projectKey: key })
  }

  const q = query({
    prompt: input,
    options: {
      cwd: root,
      settingSources: ['user', 'project', 'local'],
      systemPrompt: { type: 'preset', preset: 'claude_code' },
      includePartialMessages: true,
      permissionMode: options.permissionMode ?? 'default',
      // Ack required by the SDK so that the "Auto: approve all" mode
      // (permissionMode 'bypassPermissions') is actually honored — without this
      // the CLI refuses to bypass and cards would still appear. Bypass only takes
      // effect when the user explicitly selects it; default stays 'ask'.
      allowDangerouslySkipPermissions: true,
      abortController: abort,
      ...(options.model ? { model: options.model } : {}),
      ...(options.effort ? { effort: options.effort as 'low' | 'medium' | 'high' } : {}),
      // Tools the SDK decides need confirming reach here (under bypassPermissions
      // they don't — that's the "Auto" mode). We surface an approve/deny card and
      // await the user's decision, denying cleanly if the session/turn is torn down.
      canUseTool: async (toolName, toolInput, opts) => {
        // The .dsgn/ sidecar (annotations) is owned by the reviewer UI — never
        // let the agent write it via an edit tool OR a Bash command. (Note: under
        // 'Auto'/bypassPermissions the SDK skips canUseTool entirely, so this only
        // protects the Ask/acceptEdits modes.)
        if (touchesSidecar(toolName, toolInput)) {
          return { behavior: 'deny', message: 'The .dsgn/ sidecar is managed by dsgn, not the agent.' }
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

  return {
    key,
    root,
    options,
    input,
    query: q,
    abort,
    pending,
    emit,
    dispose: () => {
      disposed = true
    }
  }
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
  const detail = toolDetail(name, input)
  return detail ? `${name} · ${detail}` : name
}

const SIDECAR_RE = /(^|[\s/\\"'])\.dsgn([/\\]|$)/

/** Does this tool target the .dsgn/ sidecar (edit-tool path or a Bash command)? */
function touchesSidecar(toolName: string, input: unknown): boolean {
  const i = input as Record<string, unknown>
  if (EDIT_TOOLS.has(toolName)) {
    const path = i?.file_path ?? i?.path
    if (typeof path === 'string' && SIDECAR_RE.test(path)) return true
  }
  if (toolName === 'Bash' && typeof i?.command === 'string' && SIDECAR_RE.test(i.command)) {
    return true
  }
  return false
}

/** The single most relevant input field for a tool, trimmed to one short line. */
function toolDetail(_name: string, input: unknown): string | undefined {
  const i = input as Record<string, unknown>
  const raw = i?.file_path ?? i?.path ?? i?.pattern ?? i?.command
  if (raw == null) return undefined
  const s = String(raw).replace(/\s+/g, ' ').trim()
  return s ? s.slice(0, 160) : undefined
}

export function registerAgentIpc(getWindow: () => BrowserWindow | null): void {
  ipcMain.handle('agent:open-project', async (_e, root: string, options: AgentOptions = {}) => {
    const key = projectKey(root)
    // Reopening the same project starts a fresh session — close the old one.
    const existing = sessions.get(key)
    if (existing) {
      closeSession(existing)
      sessions.delete(key)
    }
    const s = await startSession(root, options, getWindow)
    sessions.set(key, s)
    activeKey = key
  })

  // Close a project's session (renderer single-active teardown; the rail uses
  // this when a project is closed, not merely switched away from).
  ipcMain.handle('agent:close-project', async (_e, root: string) => {
    const key = projectKey(root)
    const s = sessions.get(key)
    if (s) {
      closeSession(s)
      sessions.delete(key)
    }
    // Closing the active project clears `active` — never auto-promote an arbitrary
    // backgrounded session (it would start emitting into a chat the renderer isn't
    // showing). The renderer re-activates explicitly via open-project (and, once
    // the rail keeps sessions warm, a future activate path).
    if (activeKey === key) activeKey = null
  })

  // Switch the active project to an already-open (warm) session, without
  // recreating it — used by the rail when switching between open projects.
  ipcMain.handle('agent:set-active', async (_e, root: string) => {
    const key = projectKey(root)
    if (sessions.has(key)) activeKey = key
  })

  ipcMain.handle('agent:set-model', async (_e, model: string) => {
    const session = activeSession()
    if (!session) return
    await session.query.setModel?.(model)
    session.options.model = model
  })

  ipcMain.handle('agent:set-permission-mode', async (_e, mode: PermissionMode) => {
    const session = activeSession()
    if (!session) return
    // Apply to the SDK first; only commit our copy if it took (keeps the toolbar
    // and the live agent in agreement).
    await session.query.setPermissionMode?.(mode)
    session.options.permissionMode = mode
    // Switching to a more permissive posture should also release prompts already
    // on screen — otherwise the user picks "Auto" but the pending card stays.
    if (mode === 'bypassPermissions' || mode === 'acceptEdits') {
      for (const [id, p] of [...session.pending.entries()]) {
        if (mode === 'bypassPermissions' || EDIT_TOOLS.has(p.toolName)) {
          resolvePending(session, id, 'allow')
        }
      }
    }
  })

  ipcMain.handle('agent:respond-permission', async (_e, id: string, behavior: 'allow' | 'deny') => {
    const session = activeSession()
    if (session) resolvePending(session, id, behavior)
  })

  ipcMain.handle('agent:send', async (_e, text: string) => {
    const session = activeSession()
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
    const session = activeSession()
    if (!session) return
    // Release any open prompts (interrupt() may not abort their per-call signal),
    // so cards don't orphan and the SDK callbacks unblock.
    ;[...session.pending.keys()].forEach((id) => resolvePending(session, id, 'deny'))
    await session.query.interrupt?.()
  })

  // Don't leave any SDK CLI subprocess running after dsgn quits.
  app.on('before-quit', () => {
    for (const s of sessions.values()) closeSession(s)
    sessions.clear()
    activeKey = null
  })
}
