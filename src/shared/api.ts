/**
 * Types shared across the main / preload / renderer boundary. This module is
 * neutral (no electron or node imports) so every tsconfig can include it
 * without dragging in process-specific code.
 */

export type PackageManager = 'bun' | 'pnpm' | 'yarn' | 'npm'
export type Framework =
  | 'vite'
  | 'next'
  | 'cra'
  | 'sveltekit'
  | 'expo'
  | 'react-native'
  | 'unknown'

/**
 * What the right pane previews: a web dev server in the native WebContentsView
 * ('web'), or a booted iOS Simulator streamed through the local sim bridge
 * ('simulator'). Threads through detection so the renderer drives the right
 * lifecycle (devServer.* vs simulator.*) while everything downstream of the URL
 * — bounds, load, retry — stays identical.
 */
export type PreviewKind = 'web' | 'simulator'

export interface DetectedProject {
  root: string
  name: string
  framework: Framework
  packageManager: PackageManager
  scriptName: string
  /** Full command we'll run, e.g. "bun run dev". User may override this. */
  devCommand: string
  /** Web dev server vs iOS Simulator (React Native / Expo → 'simulator'). */
  previewKind: PreviewKind
}

export interface RunningDevServer {
  url: string
  pid: number
  /** True when we attached to a server the user was already running (we don't own it). */
  attached?: boolean
}

/**
 * A booted simulator served through the local sim bridge. `url` is that bridge's
 * HTTP URL (an MJPEG device page) so `preview.load(url)` is unchanged at the call
 * site — the simulator preview is "just another local URL".
 */
export interface RunningSimulator {
  url: string
  /** PID of the Metro/Expo dev-server process group (for teardown). */
  pid: number
  /** The booted device's UDID. */
  udid: string
  /** The launched app's bundle id (so subsequent runs relaunch without rebuilding). */
  bundleId: string
  previewKind: 'simulator'
}

/** One bootable iOS simulator device. */
export interface SimDevice {
  udid: string
  name: string
  runtime: string
}

/**
 * Result of probing the host for iOS-Simulator capability — all read-only. The
 * renderer surfaces `reason` (a human message) when `ok` is false, instead of
 * crashing on a non-macOS host or one without Xcode.
 */
export interface SimPreflight {
  ok: boolean
  reason?: string
  isMac: boolean
  hasXcode: boolean
  /** `idb` present (enables Phase-2 interaction); mirroring works without it. */
  hasIdb: boolean
  runtimes: string[]
  devices: SimDevice[]
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

export type PropKind = 'string' | 'number' | 'boolean' | 'enum' | 'other'

/** One editable prop/attribute of a selected element. */
export interface PropField {
  name: string
  kind: PropKind
  /** Allowed values for `kind: 'enum'`. */
  options?: string[]
  /** Current literal value at the usage site, if set and literal. */
  value?: string | number | boolean
  /** Currently set with a non-literal expression — editing it routes to the agent. */
  expression?: boolean
  /** From react-docgen, when a schema was resolved. */
  description?: string
  required?: boolean
  /** This prop isn't currently on the element (offered from the schema to add). */
  fromSchema?: boolean
}

/** Result of inspecting a selected element's editable props. */
export interface PropInspection {
  component: string
  /** The `path:line` we edit at (from the element's data-dsgn-source). */
  source: string
  fields: PropField[]
  /**
   * True when a real prop schema resolved (react-docgen). This is the gate: only
   * schema-backed components get the prop panel; otherwise it's prompt-only.
   */
  hasSchema: boolean
  /** Why the schema is limited (e.g. no react-docgen match), if applicable. */
  note?: string
}

export interface PropEdit {
  source: string
  name: string
  kind: PropKind
  value: string | number | boolean
}

export interface PropEditResult {
  applied: boolean
  /** When not applied directly: the change needs the agent (complex / non-literal). */
  needsAgent?: boolean
  /** A ready-to-send prompt describing the change, when `needsAgent`. */
  agentPrompt?: string
  error?: string
}

/** A reviewer note pinned to an element, stored in the repo's .dsgn sidecar. */
export interface Annotation {
  id: string
  /** The element's data-dsgn-source, if any. */
  source: string | null
  selector: string
  tag: string
  /** The reviewer's note. */
  text: string
  createdAt: string
}

/** What the renderer supplies to create an annotation (id/createdAt assigned in main). */
export interface AnnotationInput {
  source: string | null
  selector: string
  tag: string
  text: string
}

export interface PublishResult {
  ok: boolean
  /** The created PR URL on success. */
  url?: string
  error?: string
}

/** Result of scaffolding source-stamping into an unprepared project. */
export type Frontend = 'react' | 'svelte' | 'vue' | 'solid' | 'unknown'
/** How dsgn instruments source mapping for the detected framework. */
export type SetupStrategy =
  | 'babel-plugin'
  | 'babel-plugin-rn'
  | 'svelte-preprocess'
  | 'inspector'
  | 'none'

export interface SetupResult {
  ok: boolean
  /** The detected UI framework (NOT the build tool) — drives everything. */
  framework?: Frontend
  /** The instrumentation approach chosen for that framework. */
  strategy?: SetupStrategy
  /** Svelte major version (4 or 5), so the prop-typing idiom is right. */
  svelteMajor?: number
  /** Repo-relative files dsgn wrote (under `.dsgn/`). */
  files?: string[]
  /** False if the helper already existed (idempotent). */
  written?: boolean
  error?: string
}

export type TokenSource = 'manifest' | 'tailwind' | 'css' | 'none'

export interface Token {
  name: string
  value: string
}

export interface TokenGroup {
  name: string
  tokens: Token[]
}

/** Design tokens detected in the opened repo (one source wins per project). */
export interface TokenSet {
  source: TokenSource
  /** Human label for where they came from, e.g. ".dsgn/tokens.json". */
  origin?: string
  groups: TokenGroup[]
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
    /** Render annotation pins in the preview, located by CSS selector. */
    setAnnotations: (pins: { id: string; selector: string }[]) => void
    /** Reserve a right-edge strip (px) so the floating prop panel isn't covered. */
    setPanelInset: (inset: number) => void
    /** Fires after the previewed app loads, reporting source-stamp coverage. */
    onReadiness: (cb: (info: { stamps: number }) => void) => () => void
    /** Fires when the user commits an inline text edit in the preview. */
    onTextEdit: (cb: (edit: { source: string; text: string }) => void) => () => void
  }
  project: {
    pick: () => Promise<string | null>
    detect: (root: string) => Promise<DetectedProject>
  }
  devServer: {
    start: (opts: {
      root: string
      command: string
      framework?: Framework
    }) => Promise<RunningDevServer>
    stop: () => Promise<void>
    onLog: (cb: (line: string) => void) => () => void
  }
  simulator: {
    /** Probe the host for macOS + Xcode + a bootable simulator (read-only, never throws). */
    preflight: () => Promise<SimPreflight>
    /** Boot a sim, start Metro/Expo, launch the app, stand up the frame bridge. */
    start: (opts: { root: string; command?: string; udid?: string }) => Promise<RunningSimulator>
    stop: () => Promise<void>
    onLog: (cb: (line: string) => void) => () => void
  }
  props: {
    /** Inspect the editable props of the element at `source` ("path:line"). */
    inspect: (root: string, source: string) => Promise<PropInspection | null>
    /** Apply a prop edit; may report it needs the agent for a complex change. */
    apply: (root: string, edit: PropEdit) => Promise<PropEditResult>
  }
  text: {
    /** Rewrite the element's text content in source; agent-fallback for complex content. */
    apply: (root: string, edit: { source: string; text: string }) => Promise<PropEditResult>
  }
  tokens: {
    /** Detect design tokens in the repo (manifest → tailwind → CSS vars). */
    detect: (root: string) => Promise<TokenSet>
  }
  annotations: {
    list: (root: string) => Promise<Annotation[]>
    add: (root: string, input: AnnotationInput) => Promise<Annotation[]>
    remove: (root: string, id: string) => Promise<Annotation[]>
    /** Fires when the user clicks an annotation pin in the preview. */
    onPinClick: (cb: (id: string) => void) => () => void
  }
  publish: {
    /** Create a branch + GitHub PR with the annotations; returns the PR URL. */
    toPr: (root: string, opts: { title: string }) => Promise<PublishResult>
  }
  setup: {
    /** Write the dev-only source-stamping plugin into the repo (deterministic). */
    scaffold: (root: string) => Promise<SetupResult>
    /** Remove dsgn's scaffold files from the repo (the .dsgn helpers + legacy root plugin). */
    uninstall: (root: string) => Promise<SetupResult>
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
