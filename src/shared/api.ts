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

/**
 * AI-assisted diagnosis of an open/launch failure. dsgn *proposes* a fix (never
 * auto-runs): repo-scoped steps it can apply, host-scoped steps (sudo / global /
 * downloads) the user runs. Cached per-machine by `signature` so a repeat error
 * recalls the plan instead of re-diagnosing.
 */
export interface DiagStep {
  text: string
  /** Optional exact shell command (shown with a copy button). */
  command?: string
  /** 'repo' = dsgn can apply it; 'host' = machine-level, the user must run it. */
  scope: 'repo' | 'host'
}
export interface Diagnosis {
  /** Stable cache key derived from the error. */
  signature: string
  summary: string
  detail?: string
  steps: DiagStep[]
  /** True when recalled from the per-machine cache rather than freshly diagnosed. */
  seenBefore: boolean
  /** Last recorded outcome for this signature on this machine. */
  status?: 'proposed' | 'applied' | 'dismissed'
}

/** Result of ensuring/switching the opened project's `dsgn/*` working branch. */
export interface BranchResult {
  isRepo: boolean
  /** The branch now checked out (null if not a git repo or the switch failed). */
  branch: string | null
  /** True if this call created the branch. */
  created: boolean
  /** Set when a switch failed (e.g. conflicting uncommitted changes). */
  error?: string
}

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
 * The agent's permission posture, mirroring the SDK's `PermissionMode`:
 * - `auto` — **dsgn's default**: a model classifier approves/denies each tool
 *   call; only the ones it flags as risky fall through to dsgn's canUseTool
 *   (approve/deny card). No prompts for routine work, but genuinely dangerous
 *   ops still surface.
 * - `default` — ask (cards) for every tool the SDK gates.
 * - `acceptEdits` — auto-accept file edits, still ask for the rest (e.g. Bash).
 * - `bypassPermissions` — skip all checks (and dsgn's canUseTool guards); unused.
 */
export type PermissionMode = 'auto' | 'default' | 'acceptEdits' | 'bypassPermissions'

/** One selectable choice in an agent question (the SDK's AskUserQuestion tool). */
export interface QuestionOption {
  /** Short display text (1-5 words). */
  label: string
  /** Why this option / what it implies — shown under the label. */
  description?: string
}

/** One question the agent posed to the user via the AskUserQuestion tool. */
export interface QuestionSpec {
  /** Very short chip label (≤12 chars), e.g. "Approach". */
  header: string
  /** The full question sentence. */
  question: string
  options: QuestionOption[]
  /** Allow picking more than one option (else single-choice). */
  multiSelect: boolean
}

/**
 * A pending agent question surfaced to the user as an interactive multiple-choice
 * card (distinct from a tool approve/deny). The user's picks flow back to the
 * agent as the tool result. `id` correlates the answer to the awaiting SDK call.
 */
export interface QuestionRequest {
  id: string
  questions: QuestionSpec[]
}

/**
 * The user's answer to a QuestionRequest: question text → chosen answer string
 * (multi-select answers comma-joined; free text for "Other"). `null` (sent by the
 * renderer) means the user dismissed the question without answering.
 */
export type QuestionAnswers = Record<string, string>

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

export type AgentEvent = (
  | { type: 'delta'; text: string }
  | { type: 'status'; text: string }
  | { type: 'commands'; commands: string[] }
  | { type: 'permission-request'; request: PermissionRequest }
  /** A pending request was resolved without the user (abort/session change) — dismiss its card. */
  | { type: 'permission-resolved'; id: string }
  /** The agent asked the user a multiple-choice question (AskUserQuestion tool). */
  | { type: 'question-request'; request: QuestionRequest }
  /** A pending question was resolved (answered elsewhere / abort / session change) — dismiss its card. */
  | { type: 'question-resolved'; id: string }
  | { type: 'done' }
  | { type: 'error'; message: string }
  /** A queued comment spawn (v8 F1 Phase 3) started running — flip its rail row from
   *  queued → running and attach its branch. */
  | { type: 'spawn-started'; branch: string }
  /** A detached comment spawn (v8 F1) finished — drop its working rail row. `branch`
   *  is null when it auto-applied onto the working tree, else the durable review
   *  branch. `summary` (the agent's closing message) + `files` drive a notification
   *  in the parent project's chat so the user can follow up on it. */
  | { type: 'spawn-finished'; branch: string | null; summary?: string; files?: string[] }
) & {
  /** Which project's session emitted this — set by main so the renderer routes it
   * to the right chat (active project shows live; others accumulate in the rail). */
  projectKey?: string
  /** Set for a detached comment-spawn's events (v8 F1) — the renderer keeps these
   *  out of the main chat stream and routes them to the spawn's own rail row. */
  sessionId?: string
}

/** Per-session options the user can set from the chat toolbar. */
/**
 * An image pasted or dropped into the composer, sent to the agent as a vision
 * content block. `data` is raw base64 (no `data:` prefix); `mediaType` is the
 * MIME type (e.g. "image/png").
 */
export interface ImageAttachment {
  mediaType: string
  data: string
}

export interface AgentOptions {
  /** Model alias ('opus' | 'sonnet' | 'haiku') or undefined for the account default. */
  model?: string
  /** Reasoning effort ('low' | 'medium' | 'high') or undefined for the model default. */
  effort?: string
  /** Permission posture; defaults to 'default' (ask). */
  permissionMode?: PermissionMode
  /**
   * Which subscription-login backend to run (v7): 'claude' (default) | 'codex' | …
   * Undefined → Claude. Each backend authenticates with the user's own subscription
   * (Claude setup-token / Codex sign-in-with-ChatGPT / …) — never an in-repo API key.
   */
  provider?: string
}

/** One line of a recorded agent session's transcript (v5-D history). */
export interface SessionTranscriptEntry {
  role: 'user' | 'assistant' | 'status'
  text: string
  at: number
}

/**
 * A persisted agent session ("previous agent") — captured in main as the agent
 * works and written to disk when the session ends (close / switch-away suspend /
 * quit), so it's reopenable for review or resume after restart. `endedAt` is null
 * while the session is still live.
 */
export interface SessionRecord {
  id: string
  projectKey: string
  projectRoot: string
  projectName: string
  startedAt: number
  endedAt: number | null
  /** The dsgn/* branch it worked on, if the renderer tagged it. */
  branch?: string
  /** The PR it produced, if published. */
  prUrl?: string
  /** Repo-relative (or absolute) paths the agent edited this session. */
  filesTouched: string[]
  transcript: SessionTranscriptEntry[]
  /** A detached comment spawn (v8 F1), vs the interactive project chat. */
  kind?: 'comment'
}

export interface Bounds {
  x: number
  y: number
  width: number
  height: number
  /** Corner radius for the native view (card inset in desktop viewport, iPhone
   *  screen in mobile); 0/omitted = square. */
  radius?: number
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
  /**
   * The nearest COMPONENT-instance call site (v8 F3a) — `data-dsgn-component-source`,
   * which the stamp plugin forwards so the authored `<Component …/>` (not the
   * innermost host) wins. Lets the inspector edit per-instance props. Null when the
   * element isn't inside a stamped component instance (or on a non-React backend).
   */
  componentSource: string | null
  text: string | null
  rect: Bounds
  styles: Record<string, string>
}

/** Figma-style inline overlay modes: comment-to-agent (C) or annotation (Y). */
export type CommentMode = 'comment' | 'annotate' | null

/** A comment/annotation submitted from the preview's inline composer. */
export interface PreviewComment {
  kind: 'comment' | 'annotate'
  el: SelectedElement
  text: string
}

/**
 * A stamped element's source file, read for the inspector's inline code peek —
 * the whole file (so surrounding context is visible) plus the stamp line and,
 * when the JSX parse resolves it, the element's full line span for highlighting.
 */
export interface SourceView {
  /** Repo-relative file path (from the stamp). */
  file: string
  /** The full file content. */
  code: string
  /** 1-based line the stamp points at. */
  line: number
  /** 1-based inclusive line span of the stamped element (open → close tag). */
  elementStart?: number
  elementEnd?: number
}

/** Result of a whole-file save from the v9 code drawer. */
export interface SourceWriteResult {
  ok: boolean
  /** The file drifted on disk since the drawer loaded it — refused to clobber. */
  conflict?: boolean
  /** Human-readable failure (unresolved path, write error). */
  error?: string
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
  /** The component's declared default (react-docgen), when one was resolved.
   *  Drives the "reset to default" affordance — resetting removes the attribute
   *  so the value falls back to this. (v8 F2) */
  default?: string | number | boolean
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

/** Result of an undo/redo over the dsgn source-edit history (v8 F3b). */
export interface UndoResult {
  ok: boolean
  /** The file reverted/re-applied. */
  file?: string
  /** The history stack was empty. */
  empty?: boolean
  /** The file changed on disk since the edit — refused to clobber. */
  conflict?: boolean
}

/**
 * Apply a design token to the selected element directly (agent-free) when it maps
 * to an existing literal — a schema enum/string prop, or a single inline-style
 * property of the same family. Ambiguous cases (add-new, no stamp, className
 * expression, multiple candidates) fall back to the agent (`needsAgent`).
 */
export interface TokenEdit {
  /** The element's `data-dsgn-source` stamp (null → agent). */
  source: string | null
  token: Token
  /** The token's group name (e.g. 'colors' | 'spacing' | 'radius' | 'fontSize'). */
  group: string
  /** How the token source renders a reference (css → var(--name); else the value). */
  tokenSource: TokenSource
  /** The element's current class list (for the future Tailwind-class-swap path). */
  classes: string[]
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
  /** The fresh dsgn/* branch created to continue on (publish.ship). */
  branch?: string
  error?: string
}

/** Result of scaffolding source-stamping into an unprepared project. */
export type Frontend = 'react' | 'react-native' | 'svelte' | 'vue' | 'solid' | 'unknown'
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

/** Result of scaffolding a starter `.dsgn/tokens.json` manifest. */
export interface TokenScaffoldResult {
  ok: boolean
  /** False if a manifest already existed (idempotent — nothing written). */
  written: boolean
  /** The token set after scaffolding (now sourced from the manifest). */
  set?: TokenSet
  error?: string
}

/** One entry in the File → Open Recent menu (pushed from the renderer's store). */
export interface RecentMenuEntry {
  root: string
  name: string
}

/** The surface exposed on `window.api` by the preload bridge. */
export interface DsgnApi {
  /** Subscribe to native-menu (Actions/File) commands: 'reload' | 'stop' | 'select' |
   *  'open-project' | 'new-project' | 'clear-recents' | 'viewport:desktop' |
   *  'viewport:mobile'. Returns an unsubscribe. */
  onMenuAction: (cb: (action: string) => void) => () => void
  /** File menu ↔ renderer recents bridge. The renderer owns the recents list
   *  (localStorage); it pushes the current set so main can build the native
   *  File → Open Recent submenu, and is called back when one is chosen. */
  menu: {
    /** Push the current recents (most-recent-first) so main rebuilds Open Recent. */
    setRecents: (recents: RecentMenuEntry[]) => void
    /** Fires when a project is chosen from File → Open Recent. */
    onOpenRecent: (cb: (root: string) => void) => () => void
  }
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
    /** Toggle the in-page iPhone bezel overlay (mobile viewport); passes clicks through. */
    setFrame: (active: boolean) => void
    /** Drop the in-preview selection toolbar (pill removed / message sent). */
    clearSelected: () => void
    /** Fires when the preview navigates (link clicks, SPA routes) — full URL. */
    onUrlChanged: (cb: (url: string) => void) => () => void
    /** Selection-toolbar actions that resolve in the renderer (code / delete). */
    onToolbarAction: (cb: (kind: 'code' | 'delete') => void) => () => void
    /** Snapshot the live preview as a data URL (freeze-frame under overlay UI). */
    capture: () => Promise<string | null>
    /** Fires after the previewed app loads, reporting source-stamp coverage. */
    onReadiness: (cb: (info: { stamps: number }) => void) => () => void
    /** Fires when the user commits an inline text edit in the preview. */
    onTextEdit: (cb: (edit: { source: string; text: string }) => void) => () => void
    /** Arm/disarm the inline comment (C) or annotation (Y) overlay mode. */
    setCommentMode: (mode: CommentMode) => Promise<void>
    /** Fires when the preview's mode changes from a keyboard shortcut (C/Y/Esc). */
    onCommentMode: (cb: (mode: CommentMode) => void) => () => void
    /** Fires when the user submits an inline comment/annotation in the preview. */
    onComment: (cb: (c: PreviewComment) => void) => () => void
  }
  project: {
    pick: () => Promise<string | null>
    detect: (root: string) => Promise<DetectedProject>
    /** Save-dialog for a folder to create (New Project…). Null when cancelled. */
    pickNew: () => Promise<string | null>
    /** Scaffold a minimal Vite+React app there, git init, install deps. */
    create: (root: string) => Promise<{ ok: boolean; root?: string; error?: string }>
  }
  devServer: {
    start: (opts: {
      root: string
      command: string
      framework?: Framework
    }) => Promise<RunningDevServer>
    /** Stop the dev server for one project (others keep running). */
    stop: (root: string) => Promise<void>
    /** Is this project's dev server still running? (warm servers can die) */
    isRunning: (root: string) => Promise<boolean>
    onLog: (cb: (line: string) => void) => () => void
  }
  git: {
    /** Ensure work happens on a `dsgn/*` branch (creates one off HEAD if needed). */
    ensure: (root: string) => Promise<BranchResult>
    /** Switch to / create a specific branch (name is coerced to `dsgn/<…>`). */
    set: (root: string, name: string) => Promise<BranchResult>
    /** List local branches (current first) so the titlebar pill can switch. */
    list: (root: string) => Promise<{ branches: string[]; current: string | null }>
    /** Check out an existing branch by exact name (no dsgn/ coercion). */
    checkout: (root: string, branch: string) => Promise<BranchResult>
  }
  diagnose: {
    /** Recall a cached fix for this error, else ask the AI; caches the result. Null without auth. */
    run: (root: string, error: string, context?: string) => Promise<Diagnosis | null>
    /** Record the user's decision for a signature (per-machine memory). */
    record: (root: string, signature: string, status: 'applied' | 'dismissed') => Promise<void>
  }
  simulator: {
    /** Probe the host for macOS + Xcode + a bootable simulator (read-only, never throws). */
    preflight: () => Promise<SimPreflight>
    /** Boot a sim, start Metro/Expo, launch the app, stand up the frame bridge. */
    start: (opts: { root: string; command?: string; udid?: string }) => Promise<RunningSimulator>
    stop: () => Promise<void>
    /** Phase 3: arm/disarm element-select (a tap becomes a source pick). */
    setSelectMode: (active: boolean) => Promise<void>
    onLog: (cb: (line: string) => void) => () => void
    /** A tapped simulator element, resolved to its RN source when the testID
     * stamp is present (null source → project not set up for select). */
    onElementPicked: (cb: (pick: { source: string | null; tag: string }) => void) => () => void
  }
  props: {
    /**
     * Inspect the editable props of the element at `source` ("path:line").
     * `text` is the clicked element's rendered text — for Svelte it lets dsgn
     * content-match the click to the concrete component INSTANCE (v8 F3a-svelte)
     * instead of falling back to a definition-default edit.
     */
    inspect: (root: string, source: string, text?: string | null) => Promise<PropInspection | null>
    /** Apply a prop edit; may report it needs the agent for a complex change. */
    apply: (root: string, edit: PropEdit) => Promise<PropEditResult>
    /** Apply a design token directly when it maps to a literal; agent-fallback otherwise. */
    applyToken: (root: string, edit: TokenEdit) => Promise<PropEditResult>
    /** Remove a prop attribute from the element's source (reset-to-default). Reversible
     *  via the F3b edit history. A no-op (already absent) reports applied. (v8 F2) */
    remove: (root: string, source: string, name: string) => Promise<PropEditResult>
  }
  text: {
    /** Rewrite the element's text content in source; agent-fallback for complex content. */
    apply: (root: string, edit: { source: string; text: string }) => Promise<PropEditResult>
  }
  source: {
    /** Read the stamped element's source file for the inspector's code peek. */
    read: (root: string, source: string) => Promise<SourceView | null>
    /** Jump to the stamp in the user's editor (code/cursor/zed/subl CLI → OS default app). */
    openInEditor: (root: string, source: string) => Promise<{ ok: boolean; error?: string }>
    /** Save the whole file from the v9 code drawer. Refuses if disk drifted from
     *  `baseline` (the content the drawer loaded); routes through commitEdit so
     *  undo/redo + HMR just work. */
    write: (
      root: string,
      source: string,
      baseline: string,
      content: string
    ) => Promise<SourceWriteResult>
  }
  /** Undo/redo over ALL direct dsgn source edits — props, text, token swaps (v8 F3b).
   *  Scoped per project root: the rail keeps several projects open at once. */
  edits: {
    undo: (root: string) => Promise<UndoResult>
    redo: (root: string) => Promise<UndoResult>
    can: (root: string) => Promise<{ undo: boolean; redo: boolean }>
  }
  tokens: {
    /** Detect design tokens in the repo (manifest → tailwind → CSS vars). */
    detect: (root: string) => Promise<TokenSet>
    /** Write a starter `.dsgn/tokens.json` (idempotent — skips if one exists). */
    scaffold: (root: string) => Promise<TokenScaffoldResult>
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
    /** Full ship: commit all → push → PR → squash-merge to the default branch →
     *  pull it → delete the merged branch → start a fresh dsgn/* branch. */
    ship: (root: string, summary?: string[], mode?: 'merge' | 'pr') => Promise<PublishResult>
  }
  setup: {
    /** Write the dev-only source-stamping plugin into the repo (deterministic). */
    scaffold: (root: string) => Promise<SetupResult>
    /** Remove dsgn's scaffold files from the repo (the .dsgn helpers + legacy root plugin). */
    uninstall: (root: string) => Promise<SetupResult>
  }
  agent: {
    openProject: (root: string, options?: AgentOptions) => Promise<void>
    /** Close a project's agent session (single-active teardown / rail close). */
    closeProject: (root: string) => Promise<void>
    /** Make an already-open project's session the active one (rail switch). */
    setActive: (root: string) => Promise<void>
    /** Does this project still have a live session? (LRU may have suspended it) */
    isOpen: (root: string) => Promise<boolean>
    send: (text: string, images?: ImageAttachment[]) => Promise<void>
    setModel: (model: string) => Promise<void>
    /** Change the permission posture live (drives the SDK's setPermissionMode). */
    setPermissionMode: (mode: PermissionMode) => Promise<void>
    /** Answer a pending approve/deny card. */
    respondPermission: (id: string, behavior: 'allow' | 'deny') => Promise<void>
    /** Answer a pending agent question (AskUserQuestion). `answers` maps each
     *  question's text to the chosen option label(s); `null` dismisses it. */
    respondQuestion: (id: string, answers: QuestionAnswers | null) => Promise<void>
    interrupt: () => Promise<void>
    /** Tag the live session with branch / PR metadata for its history record. */
    tagSession: (root: string, tag: { branch?: string; prUrl?: string }) => Promise<void>
    /** Spawn a detached comment agent in its own git worktree (v8 F1) — runs in the
     *  background without touching the active chat. Returns `ok:false` (with a reason)
     *  when the project isn't a git repo root, so the caller can fall back to chat. */
    spawnComment: (
      root: string,
      text: string,
      options?: AgentOptions
    ) => Promise<{ ok: boolean; spawnId?: string; branch?: string; queued?: boolean; reason?: string }>
    /** F1 Phase 3 — cancel a running or queued comment spawn (the rail row's ×). */
    spawnInterrupt: (spawnId: string) => Promise<void>
    /** F1 Phase 2 — apply a finished spawn's branch diff onto the live working tree
     *  (the dev server HMRs it). `conflict` when the patch overlapped local edits. */
    spawnApply: (root: string, branch: string) => Promise<{ ok: boolean; conflict?: boolean; error?: string }>
    /** F1 Phase 2 — delete a finished spawn's branch (Discard). */
    spawnDiscard: (root: string, branch: string) => Promise<{ ok: boolean }>
    /** F1 Phase 2 — push a finished spawn's branch + open a PR from it. */
    spawnPr: (
      root: string,
      branch: string,
      title: string,
      recordId: string
    ) => Promise<{ ok: boolean; prUrl?: string; error?: string }>
    onEvent: (cb: (event: AgentEvent) => void) => () => void
  }
  /** Persisted agent-session history ("previous agents") — v5-D. */
  sessions: {
    /** Past sessions for a project, newest first (excludes the live one). */
    list: (root: string) => Promise<SessionRecord[]>
    get: (id: string) => Promise<SessionRecord | null>
    remove: (id: string) => Promise<void>
  }
}
