import { randomUUID } from 'node:crypto'
import type { NativeView } from '../../native/platform'
import type { AgentEvent, AgentOptions } from '../../shared/api'
import { projectKey } from '../../shared/projectKey'
import { type HelperHandlers, providerOwner } from '../provider-owner'
import { runTreziTool } from '../session-tools'
import type { TreziAgentToolAction } from '../trezi-agent-tools'
import { createRecordCapture } from './record'
import { sendToRenderer } from './tools'
import { claudeProvider } from './claude'
import { codexProvider } from './codex'
import { geminiProvider } from './gemini'
import type { ModelProvider, PendingPrompt, PendingQuestion, ProviderSession, SpawnContext } from './types'
import { withSkillMenu } from './skill-menu'

const ignore = (): void => {}

const builtIn: Record<string, ModelProvider> = {
  claude: claudeProvider,
  codex: withSkillMenu(codexProvider),
  gemini: withSkillMenu(geminiProvider)
}

/**
 * A provider whose sessions run in a provider helper (S10): a separate process the
 * Swift owner spawns, supervises and holds to its grant (`ProviderHelper.swift`).
 * Bun sees an ordinary `ProviderSession`; every command goes through the owner and
 * every event, record delta and tool call comes back from it already validated.
 * Trezi's tools run here, in Bun, after the owner authorized them.
 */
export function helperProvider(id: string): ModelProvider {
  const adapter = builtIn[id]
  return {
    id,
    host: 'helper',
    supportsSpawn: adapter?.supportsSpawn ?? true,
    generateTitle: adapter?.generateTitle,
    updateProjectMemory: adapter?.updateProjectMemory,
    startSession: (root, options, getWindow, ctx) => startHelperSession(id, root, options, getWindow, ctx)
  }
}

async function startHelperSession(
  provider: string,
  root: string,
  options: AgentOptions,
  getWindow: () => NativeView | null,
  ctx?: SpawnContext
): Promise<ProviderSession> {
  const owner = providerOwner()
  const session = randomUUID()
  const key = projectKey(root)
  const emitKey = ctx?.emitKey ?? key
  const cap = createRecordCapture(root, key)
  const record = cap.record
  const pending = new Map<string, PendingPrompt>()
  const pendingQuestions = new Map<string, PendingQuestion>()
  let disposed = false
  let gone: string | null = null
  let reportedResume: string | undefined

  const emit = (event: AgentEvent): void => {
    if (disposed) return
    const tagged = { ...event, projectKey: emitKey, ...(ctx?.sessionId ? { sessionId: ctx.sessionId } : {}) }
    ctx?.onEvent?.(tagged)
    sendToRenderer(getWindow, 'agent:event', tagged)
  }
  const scope = {
    root,
    liveRoot: ctx?.liveRoot ?? root,
    emitKey,
    background: !!ctx?.sessionId,
    connectionId: options.connectionId,
    notify: (channel: string, payload: unknown): void => sendToRenderer(getWindow, channel, payload)
  }

  const handlers: HelperHandlers = {
    event: (event) => {
      if (event.type === 'permission-request') {
        const id = event.request.id
        pending.set(id, {
          toolName: event.request.toolName,
          settle: (behavior) => {
            pending.delete(id)
            void owner.answer(session, id, 'permission', behavior).catch(ignore)
          }
        })
      } else if (event.type === 'question-request') {
        const id = event.request.id
        pendingQuestions.set(id, {
          settle: (answers) => {
            pendingQuestions.delete(id)
            void owner.answer(session, id, 'question', answers).catch(ignore)
          }
        })
      } else if (event.type === 'permission-resolved') pending.delete(event.id)
      else if (event.type === 'question-resolved') pendingQuestions.delete(event.id)
      emit(event)
    },
    record: (delta) => {
      record.transcript.push(...delta.entries)
      if (delta.filesTouched) record.filesTouched = [...new Set([...record.filesTouched, ...delta.filesTouched])]
      if (delta.sdkSessionId && delta.sdkSessionId !== reportedResume) {
        reportedResume = delta.sdkSessionId
        record.sdkSessionId = delta.sdkSessionId
        void owner.resume(session, delta.sdkSessionId, record.id).catch(ignore)
      }
    },
    tool: (tool, args) => runTreziTool(tool as TreziAgentToolAction, args, scope),
    exit: (reason) => {
      gone = reason
    }
  }

  await owner.openHelper(
    { session, chat: emitKey, provider, root, liveRoot: ctx?.liveRoot ?? root, background: !!ctx?.sessionId },
    {
      options,
      context: {
        emitKey,
        ...(ctx?.sessionId ? { sessionId: ctx.sessionId } : {}),
        ...(ctx?.resumeSessionId ? { resumeSessionId: ctx.resumeSessionId } : {}),
        ...(ctx?.liveRoot ? { liveRoot: ctx.liveRoot } : {}),
        ...(ctx?.projectMemory ? { projectMemory: ctx.projectMemory } : {})
      }
    },
    handlers
  )

  /** A turn the helper can no longer take still ends: one `error`, one `done`. */
  const refuse = (message: string): void => {
    emit({ type: 'error', message })
    emit({ type: 'done' })
  }

  return {
    key,
    root,
    options,
    send: (text, images) => {
      if (gone) return refuse(`The provider helper is not running (${gone}). Start a new chat to continue.`)
      void owner.send(session, text, images).catch((error) => refuse(error instanceof Error ? error.message : String(error)))
    },
    pending,
    pendingQuestions,
    emit,
    record,
    // Assistant text is flushed into the record by the helper, before each terminal event.
    finalize: () => {},
    dispose: () => {
      disposed = true
    },
    shutdown: () => {
      void owner.close(session).catch(ignore)
    },
    setModel: async (model) => {
      await owner.configure(session, { model })
    },
    setPermissionMode: async (mode) => {
      await owner.configure(session, { mode })
    },
    // The owner holds the deadline and kills the helper itself; it has then already
    // ended the turn (an `error`, one `done`), so the chat only needs rebuilding.
    interrupt: async () => {
      const { escalate } = await owner.cancel(session).catch(() => ({ escalate: false }))
      return escalate ? { hardStopped: true } : undefined
    }
  }
}
