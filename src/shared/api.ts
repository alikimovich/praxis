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
  props: {
    /** Inspect the editable props of the element at `source` ("path:line"). */
    inspect: (root: string, source: string) => Promise<PropInspection | null>
    /** Apply a prop edit; may report it needs the agent for a complex change. */
    apply: (root: string, edit: PropEdit) => Promise<PropEditResult>
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
