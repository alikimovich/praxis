import type { BrowserWindow } from 'electron'
import type {
  AgentEvent,
  AgentOptions,
  ImageAttachment,
  PermissionMode,
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
 * A detached comment-spawn run (v8 F1). When a session is started with a
 * SpawnContext it is NOT the project's interactive chat — it's a one-shot agent
 * running in its own git worktree. The context routes its events away from the main
 * chat (stamped with `sessionId`) and gives agent.ts an in-process `onEvent` hook to
 * watch for the terminal `done`/`error` without adding an IPC channel.
 */
export interface SpawnContext {
  /** Stable id for this spawn — stamped on every event so the renderer keeps it out
   *  of the active chat stream and into its own rail row. */
  sessionId: string
  /** The projectKey the spawn's events + history record file under (the PARENT
   *  project, so `sessions:list(repoRoot)` surfaces the finished run). */
  emitKey: string
  /** In-process choke point agent.ts listens on for the terminal event. */
  onEvent?: (e: AgentEvent) => void
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
  startSession: (
    root: string,
    options: AgentOptions,
    getWindow: () => BrowserWindow | null,
    /** Present only for a detached comment spawn (v8 F1); absent for the interactive
     *  chat. A provider that doesn't support spawning can ignore it. */
    ctx?: SpawnContext
  ) => Promise<ProviderSession>
}
