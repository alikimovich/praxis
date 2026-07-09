import type { BrowserWindow } from 'electron'
import type {
  AgentEvent,
  AgentOptions,
  ImageAttachment,
  PermissionMode,
  QuestionAnswers,
  SessionRecord
} from '../../shared/api'

/**
 * The model-provider seam (v7). dsgn's chat is backend-agnostic: `agent.ts` owns
 * the per-project `sessions` map, `activeKey`, teardown, the permission-card
 * settle loop, and every `agent:*` IPC handler — all in terms of `ProviderSession`
 * + `AgentEvent`. A `ModelProvider` plugs a specific backend (Claude Agent SDK,
 * OpenAI Codex SDK, Gemini CLI, …) behind that seam.
 *
 * Auth is **per-user subscription login** for every provider (Claude
 * `setup-token`, Codex "sign in with ChatGPT", Gemini "login with Google", Grok
 * `grok login`) — never API keys committed in-repo. A provider whose CLI/SDK
 * isn't logged in surfaces an `error` event the renderer maps to its login banner.
 */

/** An in-flight approve/deny prompt awaiting the user's decision. */
export interface PendingPrompt {
  toolName: string
  settle: (behavior: 'allow' | 'deny') => void
}

/**
 * An in-flight agent question (the SDK's AskUserQuestion tool) awaiting the user's
 * choice. `settle(null)` means the user dismissed it without answering.
 */
export interface PendingQuestion {
  settle: (answers: QuestionAnswers | null) => void
}

/**
 * Extra context for a `startSession` call beyond the plain single-session-per-
 * project case. Two unrelated uses share this shape:
 * - A detached comment-spawn run (v8 F1): `sessionId` is set, which stamps every
 *   event so the renderer routes it away from the main chat (its own rail row)
 *   instead of into a chat slice, and `onEvent` gives agent.ts an in-process hook
 *   for the terminal `done`/`error` without adding an IPC channel.
 * - An additional or resumed interactive chat (v9 resume/multi-chat): `sessionId`
 *   is left unset so events keep flowing into the normal chat pipeline, just
 *   tagged with `emitKey` = that session's own `sessionKey` (not the bare
 *   `projectKey`) so the renderer's `byKey` gives it its own slice. `resumeSessionId`
 *   asks the backend to resume a past SDK session instead of starting fresh
 *   (Claude-only; other backends accept and ignore it).
 */
export interface SpawnContext {
  /** Stable id for a detached comment spawn — stamped on every event so the
   *  renderer keeps it out of the active chat stream and into its own rail row.
   *  Absent for an additional/resumed interactive chat. */
  sessionId?: string
  /** The key the session's events + history record file under. For a spawn this
   *  is the PARENT project's projectKey; for an additional/resumed chat this is
   *  that chat's own sessionKey. */
  emitKey: string
  /** In-process choke point agent.ts listens on for the terminal event (spawns only). */
  onEvent?: (e: AgentEvent) => void
  /** Resume a past SDK session instead of starting fresh (v9 resume). Claude-only —
   *  other backends accept and ignore this. */
  resumeSessionId?: string
}

/**
 * A live, multi-turn session for one open project. Providers MUST:
 * - emit exactly the `AgentEvent` contract: `delta` (assistant text), `status`
 *   (tool-use lines), `done` (exactly one per turn — clean finish AND interrupt),
 *   `error`; and SHOULD emit `permission-request`/`permission-resolved` and
 *   `commands` when the backend supports them.
 * - route ALL emission through `emit` (it tags `projectKey` and goes silent once
 *   `dispose()` is called, so a replaced/closed session can't leak into a chat).
 */
export interface ProviderSession {
  /** projectKey(root) — the map identity in agent.ts. */
  key: string
  root: string
  options: AgentOptions
  /** Enqueue a user turn (the renderer already called startAssistant()). */
  /** Send a user turn; `images` (paste/drop) go as vision blocks where supported. */
  send: (text: string, images?: ImageAttachment[]) => void
  /** In-flight approve/deny prompts, keyed by request id (settled by agent.ts). */
  pending: Map<string, PendingPrompt>
  /** In-flight agent questions (AskUserQuestion), keyed by request id. Only backends
   *  that support the tool populate it; agent.ts settles it from the renderer's answer. */
  pendingQuestions?: Map<string, PendingQuestion>
  /** Emit an event to the renderer (tagged projectKey; no-op once disposed). */
  emit: (event: AgentEvent) => void
  /** Growing history record for this session (v5-D), persisted by agent.ts on teardown. */
  record: SessionRecord
  /** Flush any in-progress assistant turn + sync filesTouched into `record`. Idempotent. */
  finalize: () => void
  /** Stop emitting (replaced/closed) — called before teardown so nothing leaks. */
  dispose: () => void
  /** Provider-specific teardown: abort the run, close any input stream/subprocess. */
  shutdown: () => void
  // Optional live controls — agent.ts optional-chains these and layers the generic
  // bookkeeping (options update, pending release) around them.
  setModel?: (model: string) => Promise<void>
  setPermissionMode?: (mode: PermissionMode) => Promise<void>
  interrupt?: () => Promise<void>
}

export interface ModelProvider {
  /** Stable id used for dispatch ('claude' | 'codex' | …). */
  id: string
  /** Whether this backend can run a detached comment spawn (v8 F1) — it must
   *  honor the `SpawnContext` (route events through `ctx.onEvent`, emit the
   *  terminal `done`/`error`). Only Claude does today; others would silently
   *  leak a worktree + rail row, so agent.ts refuses to spawn on them. */
  supportsSpawn?: boolean
  startSession: (
    root: string,
    options: AgentOptions,
    getWindow: () => BrowserWindow | null,
    /** Present for a detached comment spawn (v8 F1) OR an additional/resumed
     *  interactive chat (v9 resume/multi-chat); absent for the plain default
     *  single-session-per-project case. A provider that doesn't support these can
     *  ignore it (Codex/Gemini accept it and no-op the resume). */
    ctx?: SpawnContext
  ) => Promise<ProviderSession>
}
