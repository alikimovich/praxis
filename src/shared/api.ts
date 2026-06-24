/**
 * Types shared across the main / preload / renderer boundary. This module is
 * neutral (no electron or node imports) so every tsconfig can include it
 * without dragging in process-specific code.
 */

export type PackageManager = 'bun' | 'pnpm' | 'yarn' | 'npm'
export type Framework = 'vite' | 'next' | 'cra' | 'sveltekit' | 'unknown'

export interface DetectedProject {
  root: string
  name: string
  framework: Framework
  packageManager: PackageManager
  scriptName: string
  /** Full command we'll run, e.g. "bun run dev". User may override this. */
  devCommand: string
}

export interface RunningDevServer {
  url: string
  pid: number
}

/**
 * The agent's permission posture, mirroring the SDK's `PermissionMode`. The
 * toolbar exposes the three that matter for this app:
 * - `default` — ask (the approve/deny cards) for tools the SDK gates.
 * - `acceptEdits` — auto-accept file edits, still ask for the rest (e.g. Bash).
 * - `bypassPermissions` — **Auto**: approve everything via the SDK, no prompts.
 */
export type PermissionMode = 'default' | 'acceptEdits' | 'bypassPermissions'

/** A pending tool-permission prompt surfaced to the user as an approve/deny card. */
export interface PermissionRequest {
  /** Correlates the renderer's decision back to the awaiting SDK callback. */
  id: string
  toolName: string
  /** Full prompt sentence from the SDK when available (else built from tool + input). */
  title: string
  /** Short noun phrase, e.g. "Edit file" — good for compact labels. */
  displayName?: string
  /** A single-line summary of the most relevant input (path / command / pattern). */
  detail?: string
}

export type AgentEvent =
  | { type: 'delta'; text: string }
  | { type: 'status'; text: string }
  | { type: 'commands'; commands: string[] }
  | { type: 'permission-request'; request: PermissionRequest }
  /** A pending request was resolved without the user (abort/session change) — dismiss its card. */
  | { type: 'permission-resolved'; id: string }
  | { type: 'done' }
  | { type: 'error'; message: string }

/** Per-session options the user can set from the chat toolbar. */
export interface AgentOptions {
  /** Model alias ('opus' | 'sonnet' | 'haiku') or undefined for the account default. */
  model?: string
  /** Reasoning effort ('low' | 'medium' | 'high') or undefined for the model default. */
  effort?: string
  /** Permission posture; defaults to 'default' (ask). */
  permissionMode?: PermissionMode
}

export interface Bounds {
  x: number
  y: number
  width: number
  height: number
}

/**
 * An element the user picked in the live preview (v2 select mode). `source` is
 * the repo's opt-in `data-dsgn-source` stamp ("path/File.tsx:line") when present
 * — that's what lets the agent edit the exact component (see DESIGN.md).
 */
export interface SelectedElement {
  tag: string
  id: string | null
  classes: string[]
  selector: string
  source: string | null
  text: string | null
  rect: Bounds
  styles: Record<string, string>
}

/** The surface exposed on `window.api` by the preload bridge. */
export interface DsgnApi {
  preview: {
    setBounds: (bounds: Bounds) => void
    load: (url: string) => Promise<void>
    reset: () => Promise<void>
    /** Hide the native view while the user drags the split (it would otherwise eat mouse events). */
    setDragging: (active: boolean) => void
    /** Toggle click-to-select mode in the previewed app (v2). */
    setSelectMode: (active: boolean) => Promise<void>
    /** Fires when the user clicks an element in select mode. */
    onElementPicked: (cb: (el: SelectedElement) => void) => () => void
    /** Fires when select mode is cancelled from inside the preview (Escape). */
    onSelectCancelled: (cb: () => void) => () => void
  }
  project: {
    pick: () => Promise<string | null>
    detect: (root: string) => Promise<DetectedProject>
  }
  devServer: {
    start: (opts: { root: string; command: string }) => Promise<RunningDevServer>
    stop: () => Promise<void>
    onLog: (cb: (line: string) => void) => () => void
  }
  agent: {
    openProject: (root: string, options?: AgentOptions) => Promise<void>
    send: (text: string) => Promise<void>
    setModel: (model: string) => Promise<void>
    /** Change the permission posture live (drives the SDK's setPermissionMode). */
    setPermissionMode: (mode: PermissionMode) => Promise<void>
    /** Answer a pending approve/deny card. */
    respondPermission: (id: string, behavior: 'allow' | 'deny') => Promise<void>
    interrupt: () => Promise<void>
    onEvent: (cb: (event: AgentEvent) => void) => () => void
  }
}
