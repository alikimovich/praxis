import type { BrowserWindow } from 'electron'
import type { Query, SDKUserMessage } from '@anthropic-ai/claude-agent-sdk'
import type {
  AgentEvent,
  AgentOptions,
  ImageAttachment,
  PermissionRequest,
  QuestionAnswers,
  QuestionRequest,
  QuestionSpec
} from '../../shared/api'
import { projectKey } from '../../shared/projectKey'
import type {
  ModelProvider,
  PendingPrompt,
  PendingQuestion,
  ProviderSession,
  SpawnContext
} from './types'
import { AUTO_ALLOW_TOOLS, describeTool, toolDetail, touchesSidecar } from './tools'
import { createRecordCapture } from './record'
import { dsgnRules } from '../rules'

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

  push(text: string, images?: ImageAttachment[]): void {
    // Plain string when there are no images; otherwise a content-block array so the
    // Claude Agent SDK sees the text + each pasted/dropped image as a vision block.
    const content =
      images && images.length
        ? [
            ...(text ? [{ type: 'text', text }] : []),
            ...images.map((im) => ({
              type: 'image',
              source: { type: 'base64', media_type: im.mediaType, data: im.data }
            }))
          ]
        : text
    const msg = {
      type: 'user',
      message: { role: 'user', content }
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
 * Coerce the AskUserQuestion tool input into our `QuestionSpec[]`, tolerating the
 * SDK's loosely-typed payload. Returns [] when nothing usable is present (the
 * caller then lets the tool fall through rather than showing an empty card).
 */
function parseQuestions(input: unknown): QuestionSpec[] {
  const raw = (input as { questions?: unknown })?.questions
  if (!Array.isArray(raw)) return []
  const out: QuestionSpec[] = []
  for (const q of raw) {
    const question = typeof (q as { question?: unknown })?.question === 'string' ? (q as { question: string }).question : ''
    const options = Array.isArray((q as { options?: unknown })?.options)
      ? (q as { options: unknown[] }).options
          .map((o) => ({
            label: typeof (o as { label?: unknown })?.label === 'string' ? (o as { label: string }).label : '',
            ...(typeof (o as { description?: unknown })?.description === 'string'
              ? { description: (o as { description: string }).description }
              : {})
          }))
          .filter((o) => o.label)
      : []
    if (!question || options.length === 0) continue
    out.push({
      question,
      header:
        typeof (q as { header?: unknown })?.header === 'string' && (q as { header: string }).header
          ? (q as { header: string }).header
          : 'Question',
      options,
      multiSelect: (q as { multiSelect?: unknown })?.multiSelect === true
    })
  }
  return out
}

/**
 * Feed the user's picks back to the model as the AskUserQuestion tool result. We
 * DENY the tool with the answer as its message: in headless SDK mode there is no
 * built-in interactive prompt to run, so intercepting `canUseTool` and returning
 * the answer here keeps the whole exchange under dsgn's control. The message is
 * phrased as an answer so the model continues with the user's choice in hand.
 */
function formatAnswers(questions: QuestionSpec[], answers: QuestionAnswers): string {
  const lines = questions.map((q) => {
    const a = (answers[q.question] ?? '').trim()
    return `- ${q.question}\n  → ${a || '(no answer)'}`
  })
  return `The user answered your question(s):\n${lines.join('\n')}`
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
  getWindow: () => BrowserWindow | null,
  ctx?: SpawnContext
): Promise<ProviderSession> {
  const key = projectKey(root)
  // A detached comment spawn (v8 F1) files its events + history under the PARENT
  // project's key (so the rail/history surface it), and stamps `sessionId` so the
  // renderer keeps it out of the main chat stream.
  const emitKey = ctx?.emitKey ?? key
  // The persisted record's `projectKey` must stay the canonical project key (not
  // `emitKey`) — `sessions-store.ts#list` and `agent:sessions-list` always query by
  // the plain `projectKey(root)`, so an additional/resumed chat (whose `emitKey` is
  // `${key}#…`) would otherwise get a history record no rail lookup can ever find.
  const cap = createRecordCapture(root, key)
  const { query } = await loadSdk()
  const input = new InputStream()
  const abort = new AbortController()
  const pending = new Map<string, PendingPrompt>()
  const pendingQuestions = new Map<string, PendingQuestion>()
  // Per-session: disposed when replaced/closed; namespaces fallback permission ids.
  let disposed = false
  let permCounter = 0

  const emit = (event: AgentEvent): void => {
    if (disposed) return
    const tagged = {
      ...event,
      projectKey: emitKey,
      ...(ctx?.sessionId ? { sessionId: ctx.sessionId } : {})
    }
    // agent.ts watches this in-process hook for the spawn's terminal done/error.
    ctx?.onEvent?.(tagged)
    getWindow()?.webContents.send('agent:event', tagged)
  }

  const q: Query = query({
    prompt: input,
    options: {
      cwd: root,
      settingSources: ['user', 'project', 'local'],
      // The repo's CLAUDE.md + skills load via settingSources; dsgn's own operating
      // rules (v8 R) are appended to the Claude Code preset.
      systemPrompt: { type: 'preset', preset: 'claude_code', append: dsgnRules() },
      includePartialMessages: true,
      permissionMode: options.permissionMode ?? 'default',
      allowDangerouslySkipPermissions: true,
      abortController: abort,
      ...(options.model ? { model: options.model } : {}),
      ...(options.effort ? { effort: options.effort as 'low' | 'medium' | 'high' } : {}),
      // v9 resume: reload a past conversation's context (the record's captured
      // sdkSessionId) instead of starting fresh. Absent for the default open/new-chat path.
      ...(ctx?.resumeSessionId ? { resume: ctx.resumeSessionId } : {}),
      canUseTool: async (toolName, toolInput, opts) => {
        // The agent asking the user a question isn't a permission decision — surface
        // it as an interactive multiple-choice card and feed the answer back as the
        // tool result. (Handled before the permission machinery so it never shows an
        // approve/deny card.)
        if (toolName === 'AskUserQuestion') {
          const questions = parseQuestions(toolInput)
          if (questions.length === 0) {
            return { behavior: 'deny', message: 'The question had no answerable options.' }
          }
          if (disposed || abort.signal.aborted || opts.signal.aborted) {
            return { behavior: 'deny', message: 'Session no longer active.' }
          }
          const id = opts.toolUseID || `${key}:q${++permCounter}`
          const request: QuestionRequest = { id, questions }
          return await new Promise((resolve) => {
            const cleanup = (): void => {
              pendingQuestions.delete(id)
              opts.signal.removeEventListener('abort', onAbort)
            }
            const onAbort = (): void => {
              cleanup()
              emit({ type: 'question-resolved', id })
              resolve({ behavior: 'deny', message: 'Interrupted.' })
            }
            pendingQuestions.set(id, {
              settle: (answers) => {
                cleanup()
                resolve({
                  behavior: 'deny',
                  message: answers
                    ? formatAnswers(questions, answers)
                    : 'The user dismissed the question without answering.'
                })
              }
            })
            opts.signal.addEventListener('abort', onAbort, { once: true })
            emit({ type: 'question-request', request })
          })
        }
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
        // In `auto` mode the SDK's classifier auto-approves routine tools without
        // calling this hook; a call reaching here is one the classifier flagged as
        // risky (the 'ask' path). Surface an approve/deny card so the user decides —
        // this is the only prompt in auto mode, for genuinely dangerous ops.
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

  // Populate the "/" menu immediately: with a streaming input, the SDK's `init`
  // system message (which carries slash_commands) only arrives after the FIRST
  // user message — so a freshly-opened project's "/" menu would be empty until you
  // chat once. supportedCommands() (captured at initialize) fetches them eagerly.
  void q
    .supportedCommands()
    .then((cmds) => {
      if (!disposed && cmds.length) emit({ type: 'commands', commands: cmds.map((c) => c.name) })
    })
    .catch(() => {
      /* older SDK / not ready — the init message will still populate on first turn */
    })

  // Drive the output stream for the life of the session.
  void (async () => {
    let streamedText = false
    try {
      for await (const msg of q) {
        switch (msg.type) {
          case 'system': {
            const sys = msg as { subtype?: string; slash_commands?: string[]; session_id?: string }
            if (sys.subtype === 'init') {
              // v9 resume: capture the SDK's own resumable session id off the init
              // message — this is what a later `agent:resume-session` forwards back
              // as `options.resume`. Distinct from `ctx.sessionId` (v8 F1 spawn bookkeeping).
              if (typeof sys.session_id === 'string' && sys.session_id) {
                cap.setSdkSessionId(sys.session_id)
              }
              if (Array.isArray(sys.slash_commands)) {
                emit({ type: 'commands', commands: sys.slash_commands })
              }
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
    send: (text, images) => input.push(text, images),
    pending,
    pendingQuestions,
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

export const claudeProvider: ModelProvider = { id: 'claude', supportsSpawn: true, startSession }
