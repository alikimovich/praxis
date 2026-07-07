import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
import type { BrowserWindow } from 'electron'
import type { AgentEvent, AgentOptions } from '../../shared/api'
import { projectKey } from '../../shared/projectKey'
import type { ModelProvider, PendingPrompt, ProviderSession } from './types'
import { describeTool } from './tools'
import { createRecordCapture } from './record'
import { dsgnRules } from '../rules'

/**
 * EXPERIMENTAL / UNWIRED (v7) — Google Gemini backend via the **Gemini CLI**
 * (`gemini`). Unlike the Claude and Codex backends, this provider has NO SDK
 * dependency in package.json — it shells out to an external `gemini` binary that
 * most installs won't have. Because a selectable-but-missing backend is a runtime
 * trap, `pickProvider` (see ./index.ts) does NOT route to it by default: it is
 * gated behind the DSGN_EXPERIMENTAL_GEMINI=1 opt-in env flag. Do not add a Gemini
 * SDK / wire this into the default provider list without revisiting that gate.
 *
 * Auth is the user's **Google account** ("Login with Google": run `gemini` once and
 * sign in) — NO API key. Gemini edits the repo with its own tools; we just map its
 * headless JSONL event stream to dsgn's `AgentEvent` stream.
 *
 * Each turn spawns `gemini -p <prompt> --output-format stream-json` in the repo and
 * streams its JSONL events (`init`/`message`/`tool_use`/`tool_result`/`error`/
 * `result`). Reachable only when `AgentOptions.provider === 'gemini'`. If the CLI
 * isn't installed or the user isn't signed in, the turn fails soft (error + done).
 *
 * KNOWN LIMITATION: headless `-p` runs one turn per process, so conversation
 * context does not carry across turns yet (a follow-up can use the CLI's session/
 * checkpoint mode or ACP for a persistent thread).
 */

// Overridable so tests can force the CLI-absent path even on machines where a
// real `gemini` is installed (provider-seam asserts the fail-soft behavior).
const GEMINI_BIN = process.env.DSGN_GEMINI_BIN || 'gemini'

/** Map one parsed Gemini JSONL event to a dsgn AgentEvent (or null to ignore). */
function mapEvent(ev: unknown): AgentEvent | null {
  const e = ev as Record<string, unknown>
  const type = e?.type as string | undefined
  switch (type) {
    case 'message': {
      // Assistant text chunk. Shape-tolerant: text may be nested.
      const text =
        (e?.text as string | undefined) ??
        (e?.content as string | undefined) ??
        ((e?.message as Record<string, unknown> | undefined)?.text as string | undefined)
      const role = (e?.role as string | undefined) ?? 'assistant'
      if (role === 'assistant' && typeof text === 'string' && text) return { type: 'delta', text }
      return null
    }
    case 'tool_use': {
      const name = (e?.name ?? e?.tool ?? 'tool') as string
      return { type: 'status', text: describeTool(String(name), e) }
    }
    case 'error': {
      const msg = (e?.message ?? e?.error ?? 'Gemini error') as string
      return { type: 'error', message: String(msg) }
    }
    // 'init' / 'tool_result' / 'result' carry no chat text we surface; 'result'
    // ends the turn (handled on process close).
    default:
      return null
  }
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
  let child: ChildProcessWithoutNullStreams | null = null
  // dsgn rules (v8 R): no system-prompt arg here, so prepend them to the first turn.
  let firstTurn = true

  const emit = (event: AgentEvent): void => {
    if (disposed) return
    getWindow()?.webContents.send('agent:event', { ...event, projectKey: key })
  }

  // Serialize turns: each send() runs one `gemini -p` process to completion.
  let chain: Promise<void> = Promise.resolve()
  const runTurn = (text: string): Promise<void> =>
    new Promise<void>((resolve) => {
      if (aborted || disposed) return resolve()
      let proc: ChildProcessWithoutNullStreams
      try {
        proc = spawn(GEMINI_BIN, ['-p', text, '--output-format', 'stream-json'], {
          cwd: root,
          env: process.env
        })
      } catch (err) {
        emit({
          type: 'error',
          message: `Gemini backend unavailable: ${err instanceof Error ? err.message : String(err)}. Install the Gemini CLI and run \`gemini\` to sign in with Google.`
        })
        emit({ type: 'done' })
        return resolve()
      }
      child = proc
      let buf = ''
      const onLine = (line: string): void => {
        const s = line.trim()
        if (!s) return
        let ev: unknown
        try {
          ev = JSON.parse(s)
        } catch {
          return // non-JSON noise
        }
        const mapped = mapEvent(ev)
        if (!mapped || disposed || aborted) return
        if (mapped.type === 'delta') cap.appendAssistant(mapped.text)
        else if (mapped.type === 'status') cap.noteTool('gemini', ev)
        emit(mapped)
      }
      proc.stdout.on('data', (d: Buffer) => {
        buf += d.toString()
        let nl: number
        while ((nl = buf.indexOf('\n')) >= 0) {
          onLine(buf.slice(0, nl))
          buf = buf.slice(nl + 1)
        }
      })
      // Surface a spawn failure (e.g. CLI not installed) as an auth-shaped error.
      proc.on('error', (err) => {
        emit({
          type: 'error',
          message: `Gemini CLI not found: ${err.message}. Install it and run \`gemini\` to sign in with Google.`
        })
      })
      proc.on('close', (codeNum) => {
        if (buf.trim()) onLine(buf)
        // A non-zero exit with no streamed text usually means not-signed-in / bad input.
        if (codeNum !== 0 && !aborted) {
          emit({
            type: 'error',
            message: `Gemini exited with code ${codeNum}. If you haven't signed in, run \`gemini\` and Login with Google.`
          })
        }
        cap.finalize()
        emit({ type: 'done' })
        child = null
        resolve()
      })
    })

  return {
    key,
    root,
    options,
    // Gemini CLI is text-only here; images (paste/drop) are ignored for now.
    send: (text, _images) => {
      const prompt = firstTurn ? `${dsgnRules()}\n\n---\n\n${text}` : text
      firstTurn = false
      chain = chain.then(() => runTurn(prompt))
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
      child?.kill()
    }
  }
}

export const geminiProvider: ModelProvider = { id: 'gemini', startSession }
