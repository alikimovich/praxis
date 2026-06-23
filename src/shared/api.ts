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

export type AgentEvent =
  | { type: 'delta'; text: string }
  | { type: 'status'; text: string }
  | { type: 'commands'; commands: string[] }
  | { type: 'done' }
  | { type: 'error'; message: string }

/** Per-session options the user can set from the chat toolbar. */
export interface AgentOptions {
  /** Model alias ('opus' | 'sonnet' | 'haiku') or undefined for the account default. */
  model?: string
  /** Reasoning effort ('low' | 'medium' | 'high') or undefined for the model default. */
  effort?: string
}

export interface Bounds {
  x: number
  y: number
  width: number
  height: number
}

/** The surface exposed on `window.api` by the preload bridge. */
export interface DsgnApi {
  preview: {
    setBounds: (bounds: Bounds) => void
    load: (url: string) => Promise<void>
    reset: () => Promise<void>
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
    interrupt: () => Promise<void>
    onEvent: (cb: (event: AgentEvent) => void) => () => void
  }
}
