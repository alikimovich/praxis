import type { BrowserWindow } from 'electron'
import type { Query, SDKUserMessage } from '@anthropic-ai/claude-agent-sdk'
import type {
  AgentEvent,
  AgentOptions,
  ImageAttachment,
  PermissionRequest,
  QuestionAnswers,
  QuestionRequest,
  QuestionSpec,
  SessionTranscriptEntry,
  SlashCommandItem
} from '../../shared/api'
import { projectKey } from '../../shared/projectKey'
import { discoverProjectSkills, mergeSlashCommands } from '../skills'
import type {
  ModelProvider,
  PendingPrompt,
  PendingQuestion,
  ProviderSession,
  SpawnContext
} from './types'
import { existsSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { join } from 'node:path'
import { z } from 'zod'
import { AUTO_ALLOW_TOOLS, describeTool, toolDetail, touchesSidecar } from './tools'
import { createRecordCapture } from './record'
import { sanitizeTitle, transcriptDigest } from './title'
import { dsgnRules } from '../rules'
import { capturePreview, getPreviewUrl } from '../preview-state'
import { lexLiteral, locateAnchor, validateManifest } from '../control-manifest'
import { saveManifest } from '../control-panels'

// The bundled Praxis agent plugin (skills teaching the preview workflow). Lives
// at the repo root; resolved relative to the compiled main (out/main →
// ../../agent-plugin), the same walk as index.ts's appIcon. Only wired in when
// present so a stripped build degrades gracefully instead of erroring.
const PLUGIN_PATH = join(__dirname, '../../agent-plugin')

// The two in-process `praxis` MCP tools, fully-qualified (mcp__<server>__<tool>).
// Read-only observers of the user's preview — auto-allowed so they never prompt.
const PREVIEW_TOOL_NAMES = new Set([
  'mcp__praxis__preview_location',
  'mcp__praxis__preview_screenshot'
])
// All in-process `praxis` tools — the observers above plus `define_controls`
// (v10 Custom Controls). define_controls DOES persist state, but only through
// main's own validated `saveManifest` path (main stays the sole `.dsgn/`
// writer), so it's equally safe to auto-allow: allowedTools + the canUseTool
// short-circuit both use this set.
const PRAXIS_TOOL_NAMES = new Set([...PREVIEW_TOOL_NAMES, 'mcp__praxis__define_controls'])

// `define_controls` input — ControlPanelManifest minus `id`/`createdAt` (main
// assigns those). The SDK converts this zod shape to JSON Schema over MCP, so
// the model sees the exact manifest schema without any prompt bloat. Structural
// security limits live in validateManifest (control-manifest.ts) — the shape
// here stays permissive-but-typed and every input re-runs the real validator.
const defineControlsShape = {
  manifest: z.object({
    file: z.string().describe('Repo-relative path of the source file the params live in'),
    component: z.string().describe('The component the panel targets (its exported name)'),
    title: z.string().describe('Panel heading shown to the user (≤80 chars)'),
    params: z
      .array(
        z.object({
          id: z.string().describe('Stable id, unique in the panel: ^[a-z0-9][a-z0-9-]{0,40}$'),
          label: z.string().describe('Human label rendered next to the control (≤80 chars)'),
          kind: z.enum(['number', 'color', 'select', 'toggle', 'text', 'bezier']),
          unit: z.string().optional().describe("Display unit for kind 'number', e.g. 'px' | 'ms'"),
          min: z.number().optional().describe("Clamp minimum (kind 'number' only)"),
          max: z.number().optional().describe("Clamp maximum (kind 'number' only)"),
          step: z.number().optional().describe("Scrub increment (kind 'number' only)"),
          options: z
            .array(z.string())
            .optional()
            .describe("Allowed values (kind 'select' only, 1-20 entries)"),
          apply: z
            .discriminatedUnion('strategy', [
              z.object({
                strategy: z.literal('prop'),
                propName: z.string().describe('Component prop to edit (per-instance values)')
              }),
              z.object({
                strategy: z.literal('style'),
                styleProp: z.string().describe("CSS longhand routed through the Styles engine, e.g. 'border-radius'")
              }),
              z.object({
                strategy: z.literal('literal'),
                anchor: z
                  .string()
                  .describe(
                    'Unique substring of the file (4-200 chars) ending immediately before the ' +
                      "literal to edit — ideal shape: 'const STAGGER_MS = '. Must occur exactly once."
                  )
              })
            ])
            .describe('How the param writes back to source')
        })
      )
      .min(1)
      .max(12)
  })
}

/** Panel id assigned by main: component slug + a short hash of file+component,
 *  matching validateManifest's `^[a-z0-9][a-z0-9-]{0,40}$` by construction. */
function panelId(file: string, component: string): string {
  const slug =
    component
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 32) || 'panel'
  const hash = createHash('sha1').update(`${file}:${component}`).digest('hex').slice(0, 6)
  return `${slug}-${hash}`
}

// The Agent SDK is ESM-only; this CJS main bundle must reach it via a dynamic
// import() (preserved by Rollup for external deps) rather than a static require.
type SdkModule = typeof import('@anthropic-ai/claude-agent-sdk')
let sdkPromise: Promise<SdkModule> | null = null
const loadSdk = (): Promise<SdkModule> => (sdkPromise ??= import('@anthropic-ai/claude-agent-sdk'))

/** A push-driven async queue of user messages for the SDK's streaming input. */
class InputStream implements AsyncIterable<SDKUserMessage> {
  private buffer: SDKUserMessage[] = []
  private waiting: ((r: IteratorResult<SDKUserMessage>) => void)[] = []
  private closed = false

  push(text: string, images?: ImageAttachment[]): void {
    // Plain string when there are no images; otherwise a content-block array so the
    // Claude Agent SDK sees the text + each pasted/dropped image as a vision block.
    const content =
      images && images.length
        ? [
            ...(text ? [{ type: 'text', text }] : []),
            ...images.map((im) => ({
              type: 'image',
              source: { type: 'base64', media_type: im.mediaType, data: im.data }
            }))
          ]
        : text
    const msg = {
      type: 'user',
      message: { role: 'user', content }
    } as unknown as SDKUserMessage
    const next = this.waiting.shift()
    if (next) next({ value: msg, done: false })
    else this.buffer.push(msg)
  }

  close(): void {
    this.closed = true
    let r: ((res: IteratorResult<SDKUserMessage>) => void) | undefined
    while ((r = this.waiting.shift())) r({ value: undefined as never, done: true })
  }

  [Symbol.asyncIterator](): AsyncIterator<SDKUserMessage> {
    return {
      next: (): Promise<IteratorResult<SDKUserMessage>> => {
        const buffered = this.buffer.shift()
        if (buffered) return Promise.resolve({ value: buffered, done: false })
        if (this.closed) return Promise.resolve({ value: undefined as never, done: true })
        return new Promise((resolve) => this.waiting.push(resolve))
      }
    }
  }
}

/** Pull a text delta out of a streaming partial-message event, shape-tolerant. */
function textDelta(msg: unknown): string | null {
  const event = (msg as { event?: { type?: string; delta?: { type?: string; text?: string } } })
    .event
  if (event?.type === 'content_block_delta' && event.delta?.type === 'text_delta') {
    return event.delta.text ?? null
  }
  return null
}

/**
 * Coerce the AskUserQuestion tool input into our `QuestionSpec[]`, tolerating the
 * SDK's loosely-typed payload. Returns [] when nothing usable is present (the
 * caller then lets the tool fall through rather than showing an empty card).
 */
function parseQuestions(input: unknown): QuestionSpec[] {
  const raw = (input as { questions?: unknown })?.questions
  if (!Array.isArray(raw)) return []
  const out: QuestionSpec[] = []
  for (const q of raw) {
    const question = typeof (q as { question?: unknown })?.question === 'string' ? (q as { question: string }).question : ''
    const options = Array.isArray((q as { options?: unknown })?.options)
      ? (q as { options: unknown[] }).options
          .map((o) => ({
            label: typeof (o as { label?: unknown })?.label === 'string' ? (o as { label: string }).label : '',
            ...(typeof (o as { description?: unknown })?.description === 'string'
              ? { description: (o as { description: string }).description }
              : {})
          }))
          .filter((o) => o.label)
      : []
    if (!question || options.length === 0) continue
    out.push({
      question,
      header:
        typeof (q as { header?: unknown })?.header === 'string' && (q as { header: string }).header
          ? (q as { header: string }).header
          : 'Question',
      options,
      multiSelect: (q as { multiSelect?: unknown })?.multiSelect === true
    })
  }
  return out
}

/**
 * Feed the user's picks back to the model as the AskUserQuestion tool result. We
 * DENY the tool with the answer as its message: in headless SDK mode there is no
 * built-in interactive prompt to run, so intercepting `canUseTool` and returning
 * the answer here keeps the whole exchange under dsgn's control. The message is
 * phrased as an answer so the model continues with the user's choice in hand.
 */
function formatAnswers(questions: QuestionSpec[], answers: QuestionAnswers): string {
  const lines = questions.map((q) => {
    const a = (answers[q.question] ?? '').trim()
    return `- ${q.question}\n  → ${a || '(no answer)'}`
  })
  return `The user answered your question(s):\n${lines.join('\n')}`
}

/**
 * The incumbent backend: a persistent multi-turn Claude Agent SDK `query()` with
 * `cwd` = the opened repo, so the repo's CLAUDE.md + .claude/skills are discovered
 * (`settingSources`). Auth = the user's Claude subscription (`claude login` /
 * `setup-token`). This is the verbatim pre-v7 `startSession`, now behind the
 * `ModelProvider` seam.
 */
async function startSession(
  root: string,
  options: AgentOptions,
  getWindow: () => BrowserWindow | null,
  ctx?: SpawnContext
): Promise<ProviderSession> {
  const key = projectKey(root)
  // A detached comment spawn (v8 F1) files its events + history under the PARENT
  // project's key (so the rail/history surface it), and stamps `sessionId` so the
  // renderer keeps it out of the main chat stream.
  const emitKey = ctx?.emitKey ?? key
  // The persisted record's `projectKey` must stay the canonical project key (not
  // `emitKey`) — `sessions-store.ts#list` and `agent:sessions-list` always query by
  // the plain `projectKey(root)`, so an additional/resumed chat (whose `emitKey` is
  // `${key}#…`) would otherwise get a history record no rail lookup can ever find.
  const cap = createRecordCapture(root, key)
  const { query, createSdkMcpServer, tool } = await loadSdk()
  const input = new InputStream()
  const abort = new AbortController()
  const pending = new Map<string, PendingPrompt>()
  const pendingQuestions = new Map<string, PendingQuestion>()
  // Per-session: disposed when replaced/closed; namespaces fallback permission ids.
  let disposed = false
  let permCounter = 0

  const emit = (event: AgentEvent): void => {
    if (disposed) return
    const tagged = {
      ...event,
      projectKey: emitKey,
      ...(ctx?.sessionId ? { sessionId: ctx.sessionId } : {})
    }
    // agent.ts watches this in-process hook for a spawn's terminal done/error, and
    // (v9) an interactive session's for workspace-snapshot isRunning tracking.
    ctx?.onEvent?.(tagged)
    getWindow()?.webContents.send('agent:event', tagged)
  }

  // In-process SDK MCP server exposing read-only views of the user's live
  // preview (the native WebContentsView that index.ts owns, reached via the
  // preview-state registry). These OBSERVE what the user sees; agent-browser is
  // the agent's own headless copy for interaction. Both tools take no input and
  // are auto-allowed (see allowedTools + canUseTool) so they never prompt.
  const previewServer = createSdkMcpServer({
    name: 'praxis',
    version: '1.0.0',
    tools: [
      tool(
        'preview_location',
        "The page/route currently shown in the user's live preview pane.",
        {},
        async () => {
          const url = getPreviewUrl()
          if (!url) return { content: [{ type: 'text', text: 'No project preview is open.' }] }
          let text = `The preview is currently showing ${url}.`
          try {
            const u = new URL(url)
            text += ` (path: ${u.pathname}${u.search}${u.hash})`
          } catch {
            /* non-parseable URL — the full string above is enough */
          }
          return { content: [{ type: 'text', text }] }
        }
      ),
      tool(
        'preview_screenshot',
        "A screenshot of exactly what the user sees in their preview pane right now (their route, viewport, simulator included).",
        {},
        async () => {
          const img = await capturePreview()
          if (!img || img.isEmpty()) {
            return { content: [{ type: 'text', text: 'No project preview is open.' }] }
          }
          // Downscale like feedback.ts's captureWindow so the base64 payload
          // stays reasonable; 1200px keeps UI legible for verification.
          const { width } = img.getSize()
          const scaled = width > 1200 ? img.resize({ width: 1200 }) : img
          const jpeg = scaled.toJPEG(70)
          return {
            content: [{ type: 'image', data: jpeg.toString('base64'), mimeType: 'image/jpeg' }]
          }
        }
      ),
      // v10 Custom Controls: register an AI-surfaced control panel. The manifest
      // is UNTRUSTED — main re-validates structure, checks every literal anchor
      // against the file the agent just wrote (this session's cwd, which may be
      // a per-chat worktree), and persists to the LIVE root (ctx.liveRoot) so
      // the panel isn't stranded when the worktree merges/drops. Failures come
      // back as tool-result text (never a throw) so the model can fix + retry.
      tool(
        'define_controls',
        'Register a control panel of tweakable parameters (sliders, color pickers, toggles) ' +
          'for a component, after instrumenting its source so each parameter is a clean ' +
          'target: a named top-level constant in the component file (literal strategy), a ' +
          'typed prop with a literal default (prop strategy), or a CSS property (style ' +
          'strategy). The user tweaks these live in the Praxis island.',
        defineControlsShape,
        async (args) => {
          const fail = (text: string) => ({
            content: [{ type: 'text' as const, text: `define_controls failed: ${text}` }],
            isError: true
          })
          const input = args.manifest
          // Main assigns identity; the model never picks ids or timestamps.
          const manifest = validateManifest({
            ...input,
            id: panelId(input.file, input.component),
            createdAt: new Date().toISOString()
          })
          if ('error' in manifest) return fail(manifest.error)
          // Anchor check against THIS session's tree (the worktree, where the
          // agent just wrote) — the live tree may not have the constant yet.
          let code: string
          try {
            code = await readFile(join(root, manifest.file), 'utf8')
          } catch {
            return fail(`could not read ${manifest.file} — does the file exist?`)
          }
          for (const param of manifest.params) {
            if (param.apply.strategy !== 'literal') continue
            const loc = locateAnchor(code, param.apply.anchor)
            if ('error' in loc) {
              const why =
                loc.error === 'missing'
                  ? 'does not occur in the file'
                  : 'occurs more than once (must be unique)'
              return fail(`param '${param.id}': anchor ${why}. Adjust the anchor or the code.`)
            }
            if (!lexLiteral(code, loc.at, param.kind)) {
              return fail(
                `param '${param.id}': no ${param.kind} literal immediately after the anchor. ` +
                  'The anchor must end right before the literal value.'
              )
            }
          }
          const saved = await saveManifest(ctx?.liveRoot ?? root, manifest)
          if ('error' in saved) return fail(saved.error)
          getWindow()?.webContents.send('controls:updated', { root: ctx?.liveRoot ?? root })
          const n = manifest.params.length
          return {
            content: [
              {
                type: 'text',
                text:
                  `Registered control panel "${manifest.title}" for ${manifest.component} ` +
                  `(${manifest.file}) with ${n} param${n === 1 ? '' : 's'}: ` +
                  `${manifest.params.map((p) => p.id).join(', ')}. ` +
                  'The user can now tweak them live from the Custom tab of the selection island.'
              }
            ]
          }
        }
      )
    ]
  })

  const q: Query = query({
    prompt: input,
    options: {
      cwd: root,
      settingSources: ['user', 'project', 'local'],
      // The repo's CLAUDE.md + skills load via settingSources; Praxis's own
      // operating rules (v8 R) are appended to the Claude Code preset, with the
      // preview-tools section (Claude alone can call the in-process praxis tools).
      systemPrompt: { type: 'preset', preset: 'claude_code', append: dsgnRules({ previewTools: true }) },
      // The praxis MCP server (preview_location / preview_screenshot /
      // define_controls). Its tools are auto-allowed here so they never surface
      // a permission card (canUseTool also short-circuits them, belt-and-
      // suspenders) — main validates everything define_controls persists.
      mcpServers: { praxis: previewServer },
      allowedTools: [...PRAXIS_TOOL_NAMES],
      // The bundled Praxis skill plugin (only when present in this build).
      ...(existsSync(PLUGIN_PATH) ? { plugins: [{ type: 'local' as const, path: PLUGIN_PATH }] } : {}),
      includePartialMessages: true,
      permissionMode: options.permissionMode ?? 'default',
      allowDangerouslySkipPermissions: true,
      abortController: abort,
      ...(options.model ? { model: options.model } : {}),
      ...(options.effort ? { effort: options.effort as 'low' | 'medium' | 'high' } : {}),
      // v9 resume: reload a past conversation's context (the record's captured
      // sdkSessionId) instead of starting fresh. Absent for the default open/new-chat path.
      ...(ctx?.resumeSessionId ? { resume: ctx.resumeSessionId } : {}),
      canUseTool: async (toolName, toolInput, opts) => {
        // The agent asking the user a question isn't a permission decision — surface
        // it as an interactive multiple-choice card and feed the answer back as the
        // tool result. (Handled before the permission machinery so it never shows an
        // approve/deny card.)
        if (toolName === 'AskUserQuestion') {
          const questions = parseQuestions(toolInput)
          if (questions.length === 0) {
            return { behavior: 'deny', message: 'The question had no answerable options.' }
          }
          if (disposed || abort.signal.aborted || opts.signal.aborted) {
            return { behavior: 'deny', message: 'Session no longer active.' }
          }
          const id = opts.toolUseID || `${key}:q${++permCounter}`
          const request: QuestionRequest = { id, questions }
          return await new Promise((resolve) => {
            const cleanup = (): void => {
              pendingQuestions.delete(id)
              opts.signal.removeEventListener('abort', onAbort)
            }
            const onAbort = (): void => {
              cleanup()
              emit({ type: 'question-resolved', id })
              resolve({ behavior: 'deny', message: 'Interrupted.' })
            }
            pendingQuestions.set(id, {
              settle: (answers) => {
                cleanup()
                resolve({
                  behavior: 'deny',
                  message: answers
                    ? formatAnswers(questions, answers)
                    : 'The user dismissed the question without answering.'
                })
              }
            })
            opts.signal.addEventListener('abort', onAbort, { once: true })
            emit({ type: 'question-request', request })
          })
        }
        // The in-process praxis tools are auto-allowed: the preview pair are
        // read-only observers of the user's own view, and define_controls only
        // persists through main's validated saveManifest path. They're also in
        // allowedTools, but guard here too so a canUseTool call for them can
        // never reach a prompt.
        if (PRAXIS_TOOL_NAMES.has(toolName)) {
          emit({ type: 'status', text: describeTool(toolName, toolInput) })
          return { behavior: 'allow', updatedInput: toolInput }
        }
        if (touchesSidecar(toolName, toolInput)) {
          return {
            behavior: 'deny',
            message: 'The .dsgn/ sidecar is managed by dsgn, not the agent.'
          }
        }
        if (AUTO_ALLOW_TOOLS.has(toolName)) {
          emit({ type: 'status', text: describeTool(toolName, toolInput) })
          return { behavior: 'allow', updatedInput: toolInput }
        }
        if (disposed || abort.signal.aborted || opts.signal.aborted) {
          return { behavior: 'deny', message: 'Session no longer active.' }
        }
        // In `auto` mode the SDK's classifier auto-approves routine tools without
        // calling this hook; a call reaching here is one the classifier flagged as
        // risky (the 'ask' path). Surface an approve/deny card so the user decides —
        // this is the only prompt in auto mode, for genuinely dangerous ops.
        emit({ type: 'status', text: describeTool(toolName, toolInput) })
        const id = opts.toolUseID || `${key}:perm${++permCounter}`
        const request: PermissionRequest = {
          id,
          toolName,
          title: opts.title || `Allow ${toolName}?`,
          ...(opts.displayName ? { displayName: opts.displayName } : {}),
          ...(toolDetail(toolName, toolInput) ? { detail: toolDetail(toolName, toolInput)! } : {})
        }
        return await new Promise((resolve) => {
          const cleanup = (): void => {
            pending.delete(id)
            opts.signal.removeEventListener('abort', onAbort)
          }
          const onAbort = (): void => {
            cleanup()
            emit({ type: 'permission-resolved', id })
            resolve({ behavior: 'deny', message: 'Interrupted.' })
          }
          pending.set(id, {
            toolName,
            settle: (behavior) => {
              cleanup()
              resolve(
                behavior === 'allow'
                  ? { behavior: 'allow', updatedInput: toolInput }
                  : { behavior: 'deny', message: 'Denied by the user in Praxis.' }
              )
            }
          })
          opts.signal.addEventListener('abort', onAbort, { once: true })
          emit({ type: 'permission-request', request })
        })
      }
    }
  })

  // The "/" menu (LKM-54): project skills — the opened repo's
  // `.claude/skills/**/SKILL.md`, discovered + described here in main so the
  // renderer never touches the filesystem — rank ahead of the SDK's advertised
  // commands, shadowing same-named ones. Either side may resolve first, so both
  // land in this closure and re-emit the merged list.
  let projectSkills: SlashCommandItem[] = []
  let sdkCommandNames: string[] = []
  const emitCommands = (): void => {
    const merged = mergeSlashCommands(projectSkills, sdkCommandNames)
    if (merged.length) emit({ type: 'commands', commands: merged })
  }
  void discoverProjectSkills(root).then((skills) => {
    if (disposed || !skills.length) return
    projectSkills = skills
    emitCommands()
  })

  // Populate the "/" menu immediately: with a streaming input, the SDK's `init`
  // system message (which carries slash_commands) only arrives after the FIRST
  // user message — so a freshly-opened project's "/" menu would be empty until you
  // chat once. supportedCommands() (captured at initialize) fetches them eagerly.
  void q
    .supportedCommands()
    .then((cmds) => {
      if (disposed || !cmds.length) return
      sdkCommandNames = cmds.map((c) => c.name)
      emitCommands()
    })
    .catch(() => {
      /* older SDK / not ready — the init message will still populate on first turn */
    })

  // Drive the output stream for the life of the session.
  void (async () => {
    let streamedText = false
    try {
      for await (const msg of q) {
        switch (msg.type) {
          case 'system': {
            const sys = msg as { subtype?: string; slash_commands?: string[]; session_id?: string }
            if (sys.subtype === 'init') {
              // v9 resume: capture the SDK's own resumable session id off the init
              // message — this is what a later `agent:resume-session` forwards back
              // as `options.resume`. Distinct from `ctx.sessionId` (v8 F1 spawn bookkeeping).
              if (typeof sys.session_id === 'string' && sys.session_id) {
                cap.setSdkSessionId(sys.session_id)
              }
              if (Array.isArray(sys.slash_commands)) {
                sdkCommandNames = sys.slash_commands
                emitCommands()
              }
            }
            break
          }
          case 'stream_event': {
            const text = textDelta(msg)
            if (text) {
              streamedText = true
              cap.appendAssistant(text)
              emit({ type: 'delta', text })
            }
            break
          }
          case 'assistant': {
            for (const block of msg.message.content) {
              if (block.type === 'text' && !streamedText) {
                cap.appendAssistant(block.text)
                emit({ type: 'delta', text: block.text })
              } else if (block.type === 'tool_use') {
                // Capture in the assistant stream (not canUseTool) so tools are
                // recorded even under bypassPermissions, where canUseTool is skipped.
                cap.noteTool(block.name, block.input)
                emit({ type: 'status', text: describeTool(block.name, block.input) })
              }
            }
            break
          }
          case 'result': {
            cap.finalize()
            emit({ type: 'done' })
            streamedText = false
            break
          }
        }
      }
    } catch (err) {
      if (!abort.signal.aborted) {
        emit({ type: 'error', message: err instanceof Error ? err.message : String(err) })
      }
    }
  })()

  return {
    key,
    root,
    options,
    send: (text, images) => input.push(text, images),
    pending,
    pendingQuestions,
    emit,
    record: cap.record,
    finalize: cap.finalize,
    dispose: () => {
      disposed = true
    },
    shutdown: () => {
      abort.abort()
      input.close()
    },
    setModel: async (model) => {
      await q.setModel?.(model)
    },
    setPermissionMode: async (mode) => {
      await q.setPermissionMode?.(mode)
    },
    interrupt: async () => {
      await q.interrupt?.()
    }
  }
}

/**
 * One-shot, tool-less completion that names a chat by its subject (see the
 * `ModelProvider.generateTitle` contract). Runs a fresh headless `query()` with
 * no setting sources (skip the repo's CLAUDE.md/skills — a title needs none) and
 * every tool denied, so it can't touch the repo or drift into work. Aborts after
 * a short deadline; any failure resolves to null (the rail keeps its heuristic
 * name). Reuses the session's model so it honours the user's provider auth.
 */
async function generateTitle(
  transcript: SessionTranscriptEntry[],
  options: AgentOptions
): Promise<string | null> {
  const convo = transcriptDigest(transcript)
  if (!convo) return null

  const { query } = await loadSdk()
  const abort = new AbortController()
  const timer = setTimeout(() => abort.abort(), 20_000)
  try {
    const prompt =
      'Below is the start of a conversation between a user and a coding assistant working on a UI/design project.\n\n' +
      `${convo}\n\n` +
      'Write a short, specific title (3–6 words, Title Case, no quotes, no trailing punctuation) naming what this ' +
      'conversation is actually about — the task or subject, not a greeting and not the literal opening words. ' +
      'Reply with ONLY the title.'
    let out = ''
    const q = query({
      prompt,
      options: {
        settingSources: [],
        allowedTools: [],
        includePartialMessages: false,
        permissionMode: 'default',
        abortController: abort,
        // A title needs no tools; deny everything so it can never edit the repo.
        canUseTool: async () => ({ behavior: 'deny', message: 'Titling uses no tools.' }),
        ...(options.model ? { model: options.model } : {})
      }
    })
    for await (const msg of q) {
      if (msg.type === 'assistant') {
        for (const block of msg.message.content) {
          if (block.type === 'text') out += block.text
        }
      } else if (msg.type === 'result') {
        break
      }
    }
    return sanitizeTitle(out)
  } catch {
    return null
  } finally {
    clearTimeout(timer)
  }
}

export const claudeProvider: ModelProvider = {
  id: 'claude',
  supportsSpawn: true,
  startSession,
  generateTitle
}
