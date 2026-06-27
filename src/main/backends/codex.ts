import type { BrowserWindow } from 'electron'
import type { AgentEvent, AgentOptions } from '../../shared/api'
import { projectKey } from '../../shared/projectKey'
import type { ModelProvider, PendingPrompt, ProviderSession } from './types'
import { describeTool } from './tools'
import { createRecordCapture } from './record'

/**
 * EXPERIMENTAL (v7) — OpenAI Codex backend via the `@openai/codex-sdk` (TypeScript).
 * Auth is the user's **ChatGPT subscription** ("sign in with ChatGPT": `codex login`,
 * or `codex login --device-auth` on headless) — NO API key. Codex edits the repo
 * with its OWN tools, so dsgn doesn't define a toolset here; we map Codex's thread
 * output to dsgn's `AgentEvent` stream.
 *
 * Reachable only when `AgentOptions.provider === 'codex'` (the UI doesn't set that
 * yet) — so the default runtime is unaffected. The package is loaded lazily via a
 * NON-LITERAL specifier so typecheck/build stay green without it installed; if it's
 * missing or the user isn't logged in, we emit an `error` the renderer maps to the
 * login banner.
 *
 * ⚠️ The event/result mapping below is written against the documented
 * `new Codex().startThread().run(prompt)` shape + an optional streamed API; the
 * exact streamed event names should be verified against the installed SDK once a
 * real `codex login` turn can be observed. Baseline (non-streamed `run`) is safe.
 */

// `string`-typed (not a literal) specifier: TS treats this import as `any` (no
// module resolution), so the build doesn't require @openai/codex-sdk installed.
const CODEX_PKG: string = '@openai/codex-sdk'

interface CodexThread {
  // Documented: `const result = await thread.run("...")`.
  run?: (prompt: string) => Promise<unknown>
  // Optional streamed API (verify name against the SDK): async-iterable of events.
  runStreamed?: (prompt: string) => AsyncIterable<unknown> | { events: AsyncIterable<unknown> }
}
interface CodexClient {
  startThread: (opts?: Record<string, unknown>) => CodexThread
}

async function loadCodex(): Promise<new (opts?: Record<string, unknown>) => CodexClient> {
  const mod = (await import(CODEX_PKG)) as { Codex: new (o?: Record<string, unknown>) => CodexClient }
  if (!mod?.Codex) throw new Error('codex-sdk: no Codex export')
  return mod.Codex
}

/** Pull a text chunk out of an unknown streamed Codex event, shape-tolerant. */
function eventText(ev: unknown): string | null {
  const e = ev as Record<string, unknown>
  const t = (e?.type ?? e?.kind) as string | undefined
  if (t && /delta|text|message|assistant|output/i.test(t)) {
    const text = (e?.text ?? e?.delta ?? e?.content ?? e?.message) as unknown
    if (typeof text === 'string') return text
  }
  return null
}

/** Resolve a tool-call NAME out of an unknown streamed Codex event (null if not
 * a tool event). Returning the name (not a pre-described label) lets the recorded
 * transcript reuse the SAME describeTool label as the live status line. */
function eventToolName(ev: unknown): string | null {
  const e = ev as Record<string, unknown>
  const t = (e?.type ?? e?.kind) as string | undefined
  if (t && /tool|command|exec|patch|apply/i.test(t)) {
    return String(e?.name ?? e?.tool ?? e?.command ?? t ?? 'tool')
  }
  return null
}

/** Best-effort final text from a non-streamed `thread.run` result. */
function resultText(result: unknown): string {
  const r = result as Record<string, unknown>
  const candidate = r?.finalResponse ?? r?.text ?? r?.output ?? r?.message ?? r?.content
  if (typeof candidate === 'string') return candidate
  if (typeof result === 'string') return result
  return ''
}

async function startSession(
  root: string,
  options: AgentOptions,
  getWindow: () => BrowserWindow | null
): Promise<ProviderSession> {
  const key = projectKey(root)
  const cap = createRecordCapture(root, key)
  const pending = new Map<string, PendingPrompt>()
  let disposed = false
  let aborted = false

  const emit = (event: AgentEvent): void => {
    if (disposed) return
    getWindow()?.webContents.send('agent:event', { ...event, projectKey: key })
  }

  let thread: CodexThread | null = null
  let initErr: Error | null = null
  try {
    const Codex = await loadCodex()
    const client = new Codex()
    // Codex edits the working directory with its own sandboxed tools.
    thread = client.startThread({ workingDirectory: root, cwd: root })
  } catch (err) {
    initErr = err instanceof Error ? err : new Error(String(err))
  }

  // Serialize turns: each send() runs to completion before the next starts.
  let chain: Promise<void> = Promise.resolve()
  const runTurn = async (text: string): Promise<void> => {
    if (aborted || disposed) return
    if (!thread) {
      // Missing package / not logged in → an auth-shaped error so the renderer
      // shows the "sign in with ChatGPT" banner (isAuthError matches it).
      emit({
        type: 'error',
        message: `Codex backend unavailable: ${initErr?.message ?? 'unknown'}. Install @openai/codex-sdk and run \`codex login\` (sign in with ChatGPT).`
      })
      emit({ type: 'done' })
      return
    }
    try {
      // Prefer a streamed API if the SDK exposes one; else fall back to run().
      const streamed = thread.runStreamed?.(text)
      if (streamed) {
        const iterable = (streamed as { events?: AsyncIterable<unknown> }).events ?? streamed
        for await (const ev of iterable as AsyncIterable<unknown>) {
          if (disposed || aborted) break
          const toolName = eventToolName(ev)
          if (toolName) {
            cap.noteTool(toolName, ev)
            emit({ type: 'status', text: describeTool(toolName, ev) })
            continue
          }
          const delta = eventText(ev)
          if (delta) {
            cap.appendAssistant(delta)
            emit({ type: 'delta', text: delta })
          }
        }
      } else if (thread.run) {
        const result = await thread.run(text)
        if (!disposed && !aborted) {
          const out = resultText(result)
          if (out) {
            cap.appendAssistant(out)
            emit({ type: 'delta', text: out })
          }
        }
      }
      cap.finalize()
      emit({ type: 'done' })
    } catch (err) {
      if (!aborted) emit({ type: 'error', message: err instanceof Error ? err.message : String(err) })
      emit({ type: 'done' })
    }
  }

  return {
    key,
    root,
    options,
    send: (text) => {
      chain = chain.then(() => runTurn(text))
    },
    pending,
    emit,
    record: cap.record,
    finalize: cap.finalize,
    dispose: () => {
      disposed = true
    },
    shutdown: () => {
      aborted = true
    }
    // setModel/setPermissionMode/interrupt: Codex equivalents are a follow-up
    // (model via startThread opts; interrupt via the SDK's abort once confirmed).
  }
}

export const codexProvider: ModelProvider = { id: 'codex', startSession }
