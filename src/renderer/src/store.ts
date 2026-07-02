import { create } from 'zustand'
import type {
  Annotation,
  CommentMode,
  Diagnosis,
  Framework,
  PermissionMode,
  PermissionRequest,
  PreviewKind,
  QuestionRequest,
  PropInspection,
  SelectedElement,
  SessionRecord,
  TokenSet
} from '../../shared/api'
import { projectKey } from '../../shared/projectKey'

export interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  text: string
  /** Tool-use status lines surfaced during the turn (assistant messages). */
  statuses: string[]
}

/** One project's chat. `streamingId` is the assistant message currently being
 * streamed (so a backgrounded project's turn keeps appending to the right one). */
interface ChatSlice {
  messages: ChatMessage[]
  isRunning: boolean
  streamingId: string | null
}
const emptySlice = (): ChatSlice => ({ messages: [], isRunning: false, streamingId: null })

interface ChatState {
  /** Per-project chat, keyed by projectKey ('' is the default / no-project slice). */
  byKey: Record<string, ChatSlice>
  activeKey: string
  // Mirrors of the active slice — what ChatPanel and the tests read.
  messages: ChatMessage[]
  isRunning: boolean
  /** Show a project's chat (preserves each project's history across switches). */
  setActiveChat: (key: string) => void
  /** Drop a project's chat buffer (on close). */
  clearChat: (key: string) => void
  // Actions default to the active project; pass a key to target a backgrounded one.
  appendUser: (text: string, key?: string) => void
  /** Add a standalone assistant note (e.g. a finished comment-spawn notification). */
  appendNote: (text: string, key?: string) => void
  startAssistant: (key?: string) => void
  appendDelta: (text: string, key?: string) => void
  appendStatus: (text: string, key?: string) => void
  finish: (key?: string) => void
  /** Is the given project's turn in flight (for the rail's working dot)? */
  isRunningFor: (key: string) => boolean
}

let counter = 0
const nextId = (): string => `m${++counter}`

/**
 * Per-project chat store. The active project's slice is mirrored into the
 * top-level `messages`/`isRunning` so ChatPanel and the Playwright store harness
 * read it unchanged; backgrounded projects' turns keep streaming into their own
 * slice (the rail shows a "working" dot, and the output is there on switch-back).
 * The `agent:event` stream (tagged with `projectKey` by main) routes here.
 */
export const useChat = create<ChatState>((set, get) => {
  // Transform one project's slice, re-syncing the active mirror when it's active.
  const patch = (key: string | undefined, fn: (s: ChatSlice) => ChatSlice): void =>
    set((state) => {
      // `undefined` → the active project; an explicit '' is its own (no-project)
      // slice (don't collapse it into the active project with `||`).
      const k = key ?? state.activeKey
      const slice = fn(state.byKey[k] ?? emptySlice())
      const byKey = { ...state.byKey, [k]: slice }
      return k === state.activeKey
        ? { byKey, messages: slice.messages, isRunning: slice.isRunning }
        : { byKey }
    })
  return {
    byKey: {},
    activeKey: '',
    messages: [],
    isRunning: false,
    setActiveChat: (key) =>
      set((s) => {
        const slice = s.byKey[key] ?? emptySlice()
        return {
          activeKey: key,
          byKey: { ...s.byKey, [key]: slice },
          messages: slice.messages,
          isRunning: slice.isRunning
        }
      }),
    clearChat: (key) =>
      set((s) => {
        const byKey = { ...s.byKey }
        delete byKey[key]
        return { byKey }
      }),
    appendUser: (text, key) =>
      patch(key, (sl) => ({
        ...sl,
        messages: [...sl.messages, { id: nextId(), role: 'user', text, statuses: [] }]
      })),
    appendNote: (text, key) =>
      patch(key, (sl) => ({
        ...sl,
        messages: [...sl.messages, { id: nextId(), role: 'assistant', text, statuses: [] }]
      })),
    startAssistant: (key) =>
      patch(key, (sl) => {
        const id = nextId()
        return {
          messages: [...sl.messages, { id, role: 'assistant', text: '', statuses: [] }],
          isRunning: true,
          streamingId: id
        }
      }),
    appendDelta: (text, key) =>
      patch(key, (sl) => ({
        ...sl,
        messages: sl.messages.map((m) =>
          m.id === sl.streamingId ? { ...m, text: m.text + text } : m
        )
      })),
    appendStatus: (text, key) =>
      patch(key, (sl) => ({
        ...sl,
        messages: sl.messages.map((m) =>
          m.id === sl.streamingId ? { ...m, statuses: [...m.statuses, text] } : m
        )
      })),
    finish: (key) => patch(key, (sl) => ({ ...sl, isRunning: false, streamingId: null })),
    isRunningFor: (key) => !!get().byKey[key]?.isRunning
  }
})

// Sentinel values mean "use the account/model default" (omit from SDK options).
export const DEFAULT_MODEL = 'default'
export const DEFAULT_EFFORT = 'auto'
/** The default backend (the Claude Agent SDK). */
export const DEFAULT_PROVIDER = 'claude'

interface SessionState {
  model: string
  effort: string
  /** Which backend runs the agent ('claude' | 'codex' | …) — v7. */
  provider: string
  slashCommands: string[]
  /** Set when the agent reports an auth failure — drives the onboarding banner. */
  authNeeded: boolean
  /** Absolute path of the open project (needed to resolve prop-edit sources). */
  projectRoot: string | null
  /** The `dsgn/*` branch dsgn is working on (null if not a git repo). */
  branch: string | null
  setModel: (model: string) => void
  setEffort: (effort: string) => void
  setProvider: (provider: string) => void
  setSlashCommands: (commands: string[]) => void
  setAuthNeeded: (authNeeded: boolean) => void
  setProjectRoot: (projectRoot: string | null) => void
  setBranch: (branch: string | null) => void
}

export const useSession = create<SessionState>((set) => ({
  model: DEFAULT_MODEL,
  effort: 'high',
  provider: DEFAULT_PROVIDER,
  slashCommands: [],
  authNeeded: false,
  projectRoot: null,
  branch: null,
  setModel: (model) => set({ model }),
  setEffort: (effort) => set({ effort }),
  setProvider: (provider) => set({ provider }),
  setSlashCommands: (slashCommands) => set({ slashCommands }),
  setAuthNeeded: (authNeeded) => set({ authNeeded }),
  setProjectRoot: (projectRoot) => set({ projectRoot }),
  setBranch: (branch) => set({ branch })
}))

/**
 * v5 workspace — the set of open projects and which one is active. This is the
 * future source of truth for multi-project: per-project state (preview, dev
 * server, agent session, annotations, tokens…) will hang off `activeKey`. It's
 * additive and dormant for now — App still drives a single project via
 * `useSession.projectRoot`; this store mirrors it and grows as the rail/backends
 * land (see docs/TASKS.md "v5"). Projects are identified by `projectKey(root)`.
 */
/** How to relaunch a project's preview (used to restart it after a config edit). */
export interface LaunchSpec {
  root: string
  command: string
  framework?: Framework
  previewKind: PreviewKind
}

export interface ProjectEntry {
  /** Absolute repo root as opened. */
  root: string
  /** Canonical key (`projectKey(root)`) — the dedupe + map identity. */
  key: string
  /** Display name (folder basename, overridable). */
  name: string
  // Per-project display snapshot, restored on switch (chat lives in useChat byKey;
  // tokens/annotations are re-detected on switch).
  url: string | null
  previewKind: PreviewKind
  branch: string | null
  launchSpec: LaunchSpec | null
  /** Monotonic recency stamp (bumped on activate) — drives LRU warm-server eviction. */
  touchedAt: number
  /** Chat length at the last successful Publish — the next Publish summarizes
   *  only the user asks after this point. */
  publishedMsgCount?: number
}

interface WorkspaceState {
  projects: ProjectEntry[]
  activeKey: string | null
  /** Collapse the left projects rail to a thin strip (persisted across launches). */
  collapsed: boolean
  /** Open a project (or re-activate it if already open). Returns its key. */
  openOrActivate: (root: string, meta?: { name?: string }) => string
  activate: (key: string) => void
  /** Update one project's snapshot fields. */
  patchEntry: (key: string, partial: Partial<ProjectEntry>) => void
  close: (key: string) => void
  toggleCollapsed: () => void
  reset: () => void
}

/**
 * Light/dark theme — the tool ALWAYS matches the OS color scheme (no in-app
 * toggle). A `.dark` class on <html> flips every CSS token (shadcn + app-shell);
 * it's set before first paint and updated live when the OS switches.
 */
type Theme = 'light' | 'dark'
const systemTheme = (): Theme => {
  try {
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
  } catch {
    return 'light'
  }
}
const applyTheme = (t: Theme): void => {
  try {
    document.documentElement.classList.toggle('dark', t === 'dark')
  } catch {
    /* no DOM (tests) */
  }
}
applyTheme(systemTheme()) // set the class before first paint — dsgn always matches the OS

/** Preview viewport: 'desktop' = fill the pane, 'mobile' = a centered phone width. */
export type Viewport = 'desktop' | 'mobile'
export const MOBILE_VIEWPORT_WIDTH = 390
interface ViewportState {
  viewport: Viewport
  setViewport: (v: Viewport) => void
}
export const useViewport = create<ViewportState>((set) => ({
  viewport: 'desktop',
  setViewport: (viewport) => set({ viewport })
}))

/**
 * Freeze the preview under overlay UI: while `frozen`, PreviewPane swaps the
 * native view (which always paints above the DOM) for a pixel-identical
 * snapshot <img>, so dropdowns can stack on top of a still-visible preview.
 * Set by whoever opens the overlay (e.g. the branch switcher).
 */
interface PreviewFreezeState {
  frozen: boolean
  setFrozen: (frozen: boolean) => void
}
export const usePreviewFreeze = create<PreviewFreezeState>((set) => ({
  frozen: false,
  setFrozen: (frozen) => set({ frozen })
}))

/**
 * How Publish ends: 'merge' = create the PR and squash-merge it to the default
 * branch (the button reads "Publish"); 'pr' = stop after creating/updating the
 * PR and stay on the work branch (the button reads "Create PR"). Chosen from
 * the split button's settings menu; persisted across launches.
 */
export type PublishMode = 'merge' | 'pr'
const PUBLISH_MODE_KEY = 'dsgn:publish-mode'
const readPublishMode = (): PublishMode => {
  try {
    return localStorage.getItem(PUBLISH_MODE_KEY) === 'pr' ? 'pr' : 'merge'
  } catch {
    return 'merge'
  }
}
interface PublishModeState {
  mode: PublishMode
  setMode: (mode: PublishMode) => void
}
export const usePublishMode = create<PublishModeState>((set) => ({
  mode: readPublishMode(),
  setMode: (mode) => {
    try {
      localStorage.setItem(PUBLISH_MODE_KEY, mode)
    } catch {
      /* private mode / no storage — keep it in memory only */
    }
    set({ mode })
  }
}))

// Follow the OS live — no manual toggle; the tool's theme is always the Mac's.
try {
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) => {
    applyTheme(e.matches ? 'dark' : 'light')
  })
} catch {
  /* no matchMedia (tests) */
}

// Remember the rail collapse preference across launches (renderer-only UI state).
const RAIL_KEY = 'dsgn:rail-collapsed'
const readCollapsed = (): boolean => {
  try {
    return localStorage.getItem(RAIL_KEY) === '1'
  } catch {
    return false
  }
}

const basename = (p: string): string => p.replace(/[/\\]+$/, '').split(/[/\\]/).pop() || p
// Monotonic recency counter for LRU warm-server eviction (process-lifetime; fine
// to reset to 0 on a fresh launch since the workspace starts empty).
let touchSeq = 0
const bumpTouched = (projects: ProjectEntry[], key: string): ProjectEntry[] =>
  projects.map((p) => (p.key === key ? { ...p, touchedAt: ++touchSeq } : p))

export const useWorkspace = create<WorkspaceState>((set, get) => ({
  projects: [],
  activeKey: null,
  collapsed: readCollapsed(),
  toggleCollapsed: () =>
    set((s) => {
      const collapsed = !s.collapsed
      try {
        localStorage.setItem(RAIL_KEY, collapsed ? '1' : '0')
      } catch {
        /* private mode / no storage — keep it in memory only */
      }
      return { collapsed }
    }),
  openOrActivate: (root, meta) => {
    const key = projectKey(root)
    const exists = get().projects.some((p) => p.key === key)
    set((s) => ({
      projects: bumpTouched(
        exists
          ? s.projects
          : [
              ...s.projects,
              {
                root,
                key,
                name: meta?.name ?? basename(root),
                url: null,
                previewKind: 'web',
                branch: null,
                launchSpec: null,
                touchedAt: 0
              }
            ],
        key
      ),
      activeKey: key
    }))
    return key
  },
  activate: (key) =>
    set((s) =>
      s.projects.some((p) => p.key === key)
        ? { activeKey: key, projects: bumpTouched(s.projects, key) }
        : s
    ),
  patchEntry: (key, partial) =>
    set((s) => ({
      projects: s.projects.map((p) => (p.key === key ? { ...p, ...partial } : p))
    })),
  close: (key) =>
    set((s) => {
      const projects = s.projects.filter((p) => p.key !== key)
      const activeKey =
        s.activeKey === key ? (projects.at(-1)?.key ?? null) : s.activeKey
      return { projects, activeKey }
    }),
  reset: () => set({ projects: [], activeKey: null })
}))

/**
 * v5-D "previous agents" — persisted agent sessions per project, surfaced under
 * each project in the rail. Loaded lazily (on project activate / rail expand) from
 * the on-disk store in main (`window.api.sessions`); the live session isn't here
 * (it's persisted only on teardown), so this is strictly the *past* runs.
 */
interface HistoryState {
  /** Past sessions keyed by `projectKey(root)`, newest first. */
  byKey: Record<string, SessionRecord[]>
  loading: Record<string, boolean>
  /** Fetch (refresh) a project's history. */
  load: (root: string) => Promise<void>
  /** Delete one record and drop it from the list. */
  remove: (root: string, id: string) => Promise<void>
}

export const useHistory = create<HistoryState>((set) => ({
  byKey: {},
  loading: {},
  load: async (root) => {
    const key = projectKey(root)
    set((s) => ({ loading: { ...s.loading, [key]: true } }))
    try {
      const recs = await window.api.sessions.list(root)
      set((s) => ({ byKey: { ...s.byKey, [key]: recs }, loading: { ...s.loading, [key]: false } }))
    } catch {
      set((s) => ({ loading: { ...s.loading, [key]: false } }))
    }
  },
  remove: async (root, id) => {
    const key = projectKey(root)
    try {
      await window.api.sessions.remove(id)
    } catch {
      // best-effort; still drop it from the visible list
    }
    set((s) => ({
      byKey: { ...s.byKey, [key]: (s.byKey[key] ?? []).filter((r) => r.id !== id) }
    }))
  }
}))

/**
 * v8 F1: detached comment spawns currently running, keyed by `projectKey`. A row
 * appears the moment a comment is dispatched and is removed on `spawn-finished` (the
 * finished run reappears in `useHistory` as a "previous agent" carrying its branch).
 * These never enter `useChat` — the main chat stream stays byte-clean.
 */
export interface SpawnRow {
  id: string
  branch: string | null
  label: string
  /** 'queued' until a per-repo slot frees (Phase 3), then 'running'. */
  status: 'running' | 'queued'
}
interface SpawnsState {
  byKey: Record<string, SpawnRow[]>
  add: (key: string, row: SpawnRow) => void
  /** Flip a queued row to running + attach its branch (on `spawn-started`). */
  start: (key: string, id: string, branch: string) => void
  remove: (key: string, id: string) => void
}
export const useSpawns = create<SpawnsState>((set) => ({
  byKey: {},
  add: (key, row) =>
    set((s) => ({ byKey: { ...s.byKey, [key]: [row, ...(s.byKey[key] ?? [])] } })),
  start: (key, id, branch) =>
    set((s) => ({
      byKey: {
        ...s.byKey,
        [key]: (s.byKey[key] ?? []).map((r) =>
          r.id === id ? { ...r, status: 'running', branch } : r
        )
      }
    })),
  remove: (key, id) =>
    set((s) => ({ byKey: { ...s.byKey, [key]: (s.byKey[key] ?? []).filter((r) => r.id !== id) } }))
}))

/** Compact "time ago" for history timestamps (e.g. "3m ago", "2h ago", "5d ago"). */
export const relativeTime = (ms: number, now = Date.now()): string => {
  const s = Math.max(0, Math.round((now - ms) / 1000))
  if (s < 60) return 'just now'
  const m = Math.round(s / 60)
  if (m < 60) return `${m}m ago`
  const h = Math.round(m / 60)
  if (h < 24) return `${h}h ago`
  const d = Math.round(h / 24)
  return `${d}d ago`
}

/**
 * Heuristic: does this agent error look like a missing/invalid Claude login?
 * Per-user auth means a fresh teammate hits this before they've run
 * `claude setup-token` — we want to guide them, not show a raw 401.
 */
export const isAuthError = (message: string): boolean =>
  /\b401\b|invalid authentication|unauthorized|setup-token|not logged in|no credentials|authentication_error/i.test(
    message
  )

/** Convert the UI sentinels into AgentOptions the SDK understands. */
export const toAgentOptions = (s: { model: string; effort: string; provider?: string }): {
  model?: string
  effort?: string
  provider?: string
} => ({
  model: s.model === DEFAULT_MODEL ? undefined : s.model,
  effort: s.effort === DEFAULT_EFFORT ? undefined : s.effort,
  // Default Claude is implied — only send a non-default backend.
  ...(s.provider && s.provider !== DEFAULT_PROVIDER ? { provider: s.provider } : {})
})

/**
 * v2 element selection. `selectMode` mirrors the overlay armed in the preview;
 * `selected` is the most recently picked element. The composer reads `selected`
 * to seed a change request that points the agent at the right source location.
 */
interface SelectionState {
  selectMode: boolean
  /** The armed inline-overlay comment mode (Figma-style C/Y), mirrored from the preview. */
  commentMode: CommentMode
  selected: SelectedElement | null
  /** Prop inspection for the selected element (null while loading / no source). */
  inspection: PropInspection | null
  inspecting: boolean
  setSelectMode: (selectMode: boolean) => void
  setCommentMode: (commentMode: CommentMode) => void
  /** Selecting a new element clears the previous inspection. */
  setSelected: (selected: SelectedElement | null) => void
  setInspection: (inspection: PropInspection | null) => void
  setInspecting: (inspecting: boolean) => void
}

export const useSelection = create<SelectionState>((set) => ({
  selectMode: false,
  commentMode: null,
  selected: null,
  inspection: null,
  inspecting: false,
  // Select and comment/annotate are mutually exclusive overlay modes.
  setSelectMode: (selectMode) => set({ selectMode, ...(selectMode ? { commentMode: null } : {}) }),
  setCommentMode: (commentMode) => set({ commentMode, ...(commentMode ? { selectMode: false } : {}) }),
  setSelected: (selected) => set({ selected, inspection: null, inspecting: false }),
  setInspection: (inspection) => set({ inspection }),
  setInspecting: (inspecting) => set({ inspecting })
}))

/**
 * Tool-permission posture + the queue of pending approve/deny prompts. `mode`
 * is the SDK's PermissionMode: 'default' asks (cards), 'acceptEdits' auto-accepts
 * edits, 'bypassPermissions' is Auto (no prompts — approve-all via the SDK).
 */
interface PermissionState {
  mode: PermissionMode
  pending: PermissionRequest[]
  setMode: (mode: PermissionMode) => void
  addRequest: (request: PermissionRequest) => void
  removeRequest: (id: string) => void
  clearPending: () => void
}

export const usePermissions = create<PermissionState>((set) => ({
  // Auto mode by default — the SDK's model classifier approves/denies each tool
  // call; only the ones it flags as risky fall through to dsgn's canUseTool card.
  // No prompts for routine work, dangerous ops still surface, and canUseTool still
  // runs (so the .dsgn/ sidecar guard + AskUserQuestion card stay in force).
  mode: 'auto',
  pending: [],
  setMode: (mode) => set({ mode }),
  addRequest: (request) =>
    set((s) =>
      s.pending.some((p) => p.id === request.id)
        ? s
        : { pending: [...s.pending, request] }
    ),
  removeRequest: (id) => set((s) => ({ pending: s.pending.filter((p) => p.id !== id) })),
  clearPending: () => set({ pending: [] })
}))

/**
 * Pending agent questions (the AskUserQuestion tool) awaiting the user's picks.
 * Distinct from permission cards: these are the agent *asking the user* (which
 * approach, which option), not requesting a tool. The answer flows back to the
 * agent as the tool result. Deduped by id; cleared on project switch.
 */
interface QuestionState {
  pending: QuestionRequest[]
  addRequest: (request: QuestionRequest) => void
  removeRequest: (id: string) => void
  clearPending: () => void
}

export const useQuestions = create<QuestionState>((set) => ({
  pending: [],
  addRequest: (request) =>
    set((s) =>
      s.pending.some((p) => p.id === request.id) ? s : { pending: [...s.pending, request] }
    ),
  removeRequest: (id) => set((s) => ({ pending: s.pending.filter((p) => p.id !== id) })),
  clearPending: () => set({ pending: [] })
}))

// A picked element's fields come from the (only semi-trusted) previewed page.
// Collapse to a single line (no control chars / newlines, so an injected value
// can't masquerade as a new instruction paragraph) and cap by code point
// (surrogate-safe). The source is additionally validated to a `path:line` shape.
export const oneLine = (s: string, max: number): string =>
  Array.from(s.replace(new RegExp("[\\u0000-\\u001F\\u007F]+", "g"), " "))
    .slice(0, max)
    .join('')
    .trim()

const SOURCE_RE = /^[\w./@-]+:\d+(:\d+)?$/

/**
 * One-shot composer signals from App-level surfaces:
 * - `seed` prefills the chat input (user still presses Enter).
 * - `submit` sends straight to the agent (inline comment mode), or prefills if a
 *   turn is already running so the comment is never dropped.
 */
interface ComposerState {
  seed: string | null
  submit: string | null
  setSeed: (seed: string | null) => void
  setSubmit: (submit: string | null) => void
}

export const useComposer = create<ComposerState>((set) => ({
  seed: null,
  submit: null,
  setSeed: (seed) => set({ seed }),
  setSubmit: (submit) => set({ submit })
}))

/** The on-open "set this project up for editing" offer. */
interface SetupState {
  /** The previewed app isn't source-stamped — offer to set it up. */
  needed: boolean
  dismissed: boolean
  busy: boolean
  /** A setup was applied; the next readiness report verifies stamps actually fired. */
  verifying: boolean
  /**
   * One-shot signal: the setup turn finished, so App should restart the dev
   * server + reload the preview (a config edit only applies on a full restart).
   * App consumes it and clears it.
   */
  restartRequested: boolean
  status: string | null
  setNeeded: (needed: boolean) => void
  setDismissed: (dismissed: boolean) => void
  setBusy: (busy: boolean) => void
  setVerifying: (verifying: boolean) => void
  setRestartRequested: (restartRequested: boolean) => void
  setStatus: (status: string | null) => void
  reset: () => void
}

export const useSetup = create<SetupState>((set) => ({
  needed: false,
  dismissed: false,
  busy: false,
  verifying: false,
  restartRequested: false,
  status: null,
  setNeeded: (needed) => set({ needed }),
  setDismissed: (dismissed) => set({ dismissed }),
  setBusy: (busy) => set({ busy }),
  setVerifying: (verifying) => set({ verifying }),
  setRestartRequested: (restartRequested) => set({ restartRequested }),
  setStatus: (status) => set({ status }),
  reset: () =>
    set({
      needed: false,
      dismissed: false,
      busy: false,
      verifying: false,
      restartRequested: false,
      status: null
    })
}))

/** Design tokens detected for the open project (one source wins). */
interface TokenState {
  set: TokenSet | null
  /** First-run offer to scaffold `.dsgn/tokens.json` when no tokens were found. */
  offerNeeded: boolean
  offerDismissed: boolean
  scaffolding: boolean
  setSet: (set: TokenSet | null) => void
  setOfferNeeded: (offerNeeded: boolean) => void
  setOfferDismissed: (offerDismissed: boolean) => void
  setScaffolding: (scaffolding: boolean) => void
  /** Clear everything on project switch. */
  reset: () => void
}

export const useTokens = create<TokenState>((set) => ({
  set: null,
  offerNeeded: false,
  offerDismissed: false,
  scaffolding: false,
  setSet: (tokenSet) => set({ set: tokenSet }),
  setOfferNeeded: (offerNeeded) => set({ offerNeeded }),
  setOfferDismissed: (offerDismissed) => set({ offerDismissed }),
  setScaffolding: (scaffolding) => set({ scaffolding }),
  reset: () => set({ set: null, offerNeeded: false, offerDismissed: false, scaffolding: false })
}))

/** v3 handoff: reviewer notes pinned to elements + which one is focused. */
interface AnnotationState {
  list: Annotation[]
  focusedId: string | null
  setList: (list: Annotation[]) => void
  setFocused: (focusedId: string | null) => void
}

export const useAnnotations = create<AnnotationState>((set) => ({
  list: [],
  focusedId: null,
  setList: (list) => set({ list }),
  setFocused: (focusedId) => set({ focusedId })
}))

/**
 * Activity log for the open-project flow — detect, attach/spawn decision,
 * dev-server output, readiness, preview, agent. Surfaced in a collapsible
 * console so "it didn't work" has a visible trail.
 */
export type LogKind = 'info' | 'server' | 'success' | 'error'
export interface LogLine {
  id: number
  time: string
  text: string
  kind: LogKind
}

interface LogState {
  lines: LogLine[]
  open: boolean
  append: (text: string, kind?: LogKind) => void
  clear: () => void
  setOpen: (open: boolean) => void
}

let logSeq = 0

export const useLog = create<LogState>((set) => ({
  lines: [],
  open: false,
  append: (text, kind = 'info') =>
    set((s) => {
      const d = new Date()
      const time = d.toTimeString().slice(0, 8)
      // Cap history so a chatty dev server can't grow it without bound.
      const lines = [...s.lines, { id: ++logSeq, time, text, kind }].slice(-500)
      // An error auto-opens the console so the failure is visible.
      return kind === 'error' ? { lines, open: true } : { lines }
    }),
  clear: () => set({ lines: [] }),
  setOpen: (open) => set({ open })
}))

/** AI fix proposal for the current open/launch failure (propose-first). */
interface DiagnosisState {
  current: Diagnosis | null
  busy: boolean
  setCurrent: (current: Diagnosis | null) => void
  setBusy: (busy: boolean) => void
}

export const useDiagnosis = create<DiagnosisState>((set) => ({
  current: null,
  busy: false,
  setCurrent: (current) => set({ current }),
  setBusy: (busy) => set({ busy })
}))

/** Build the chat prompt prefix that anchors the agent to a picked element. */
export const describeSelectionForPrompt = (el: SelectedElement): string => {
  const id = el.id ? oneLine(el.id, 64) : ''
  const cls = el.classes[0] ? oneLine(el.classes[0], 64) : ''
  const ident = id ? `#${id}` : cls ? `.${cls}` : ''
  const source = el.source && SOURCE_RE.test(el.source) ? el.source : null
  const where = source ? ` in ${source}` : ` (selector: ${oneLine(el.selector, 200)})`
  const text = el.text ? ` with text “${oneLine(el.text, 40)}”` : ''
  return `In the preview I selected the <${oneLine(el.tag, 32)}${ident}> element${where}${text}. `
}

// Exposed for the Playwright test harness (and handy for live debugging).
;(
  window as unknown as {
    __dsgnStore?: typeof useChat
    __dsgnSession?: typeof useSession
    __dsgnSelection?: typeof useSelection
    __dsgnPermissions?: typeof usePermissions
    __dsgnQuestions?: typeof useQuestions
    __dsgnAnnotations?: typeof useAnnotations
    __dsgnTokens?: typeof useTokens
    __dsgnSetup?: typeof useSetup
  }
).__dsgnStore = useChat
;(window as unknown as { __dsgnSession?: typeof useSession }).__dsgnSession = useSession
;(window as unknown as { __dsgnSelection?: typeof useSelection }).__dsgnSelection = useSelection
;(window as unknown as { __dsgnPermissions?: typeof usePermissions }).__dsgnPermissions =
  usePermissions
;(window as unknown as { __dsgnQuestions?: typeof useQuestions }).__dsgnQuestions = useQuestions
;(window as unknown as { __dsgnAnnotations?: typeof useAnnotations }).__dsgnAnnotations =
  useAnnotations
;(window as unknown as { __dsgnTokens?: typeof useTokens }).__dsgnTokens = useTokens
;(window as unknown as { __dsgnSetup?: typeof useSetup }).__dsgnSetup = useSetup
;(window as unknown as { __dsgnLog?: typeof useLog }).__dsgnLog = useLog
;(window as unknown as { __dsgnDiagnosis?: typeof useDiagnosis }).__dsgnDiagnosis = useDiagnosis
;(window as unknown as { __dsgnWorkspace?: typeof useWorkspace }).__dsgnWorkspace = useWorkspace
;(window as unknown as { __dsgnHistory?: typeof useHistory }).__dsgnHistory = useHistory
;(window as unknown as { __dsgnSpawns?: typeof useSpawns }).__dsgnSpawns = useSpawns
;(window as unknown as { __dsgnViewport?: typeof useViewport }).__dsgnViewport = useViewport
