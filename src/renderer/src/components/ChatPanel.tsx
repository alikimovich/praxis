import { useEffect, useMemo, useRef, useState } from 'react'
import {
  DEFAULT_MODEL,
  describeSelectionForPrompt,
  isAuthError,
  oneLine,
  toAgentOptions,
  useAnnotations,
  useChat,
  useComposer,
  useHistory,
  usePermissions,
  useQuestions,
  useCodeDrawer,
  useSelection,
  useSession,
  useSetup,
  useSpawns,
  useTokens,
  useUiActions,
  usePropsIsland
} from '../store'
import { projectKey } from '../../../shared/projectKey'
import type { QuestionAnswers, SetupResult } from '../../../shared/api'
import Inspector from './Inspector'
import Markdown from './Markdown'
import NotesPanel from './NotesPanel'
import PermissionCards from './PermissionCards'
import QuestionCards from './QuestionCards'
import SetupCard from './SetupCard'
import TokenOfferCard from './TokenOfferCard'
import {
  Conversation,
  ConversationContent,
  ConversationScrollButton
} from '@/components/ai-elements/conversation'
import { InputGroup, InputGroupAddon } from '@/components/ui/input-group'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { ArrowUp, Check, ChevronRight, Copy, MousePointer2 } from 'lucide-react'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import CatLoader from './CatLoader'

const MODELS = [
  { value: DEFAULT_MODEL, label: 'Default' },
  { value: 'opus', label: 'Opus' },
  { value: 'sonnet', label: 'Sonnet' },
  { value: 'haiku', label: 'Haiku' }
]


// Selectable backends (v7). Each authenticates with the user's own subscription
// login — no API keys. Only backends that exist in main's pickProvider are listed
// (Gemini/Grok land when their adapters do). `login` is the one-time CLI step.
const PROVIDERS: { value: string; label: string; login: string | null; blurb: string | null }[] = [
  { value: 'claude', label: 'Claude', login: null, blurb: null },
  {
    value: 'codex',
    label: 'Codex',
    login: 'codex login',
    blurb: 'OpenAI Codex runs on your ChatGPT subscription'
  },
  {
    value: 'gemini',
    label: 'Gemini',
    login: 'gemini',
    blurb: 'Google Gemini CLI runs on your Google account'
  }
]

/**
 * Framework-correct setup instructions for the agent. Returns null when the
 * framework isn't one dsgn can instrument — never hand React instructions to a
 * non-React repo.
 */
/**
 * A collapsible disclosure for an assistant turn's tool-use steps (v6 — the AI
 * Elements Task/Reasoning pattern, built on the already-vendored shadcn Collapsible,
 * no new deps). A long tool run used to bury the answer under a flat status list;
 * now the steps collapse to a one-line summary (latest step + count) the user can
 * expand. Collapsed by default (the cat loader signals progress); a manual toggle
 * is respected, and it re-collapses once the turn finishes.
 */
function StepDisclosure({
  statuses,
  active
}: {
  statuses: string[]
  active: boolean
}): React.JSX.Element {
  const [open, setOpen] = useState(false)
  const wasActive = useRef(active)
  useEffect(() => {
    // Tidy up if the user expanded a live turn: collapse when it finishes.
    if (wasActive.current && !active) setOpen(false)
    wasActive.current = active
  }, [active])
  const last = statuses[statuses.length - 1] ?? ''
  return (
    <Collapsible open={open} onOpenChange={setOpen} className="msg__steps">
      <CollapsibleTrigger className="msg__steps-trigger group flex w-fit max-w-full items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground">
        <ChevronRight className="size-3 shrink-0 transition-transform group-data-[state=open]:rotate-90" />
        <span className="min-w-0 max-w-[240px] truncate font-mono">{open ? 'Steps' : last}</span>
        <span className="shrink-0 opacity-60">
          · {statuses.length} step{statuses.length === 1 ? '' : 's'}
        </span>
      </CollapsibleTrigger>
      <CollapsibleContent className="mt-1 flex flex-col gap-0.5 border-l border-border pl-2.5">
        {statuses.map((s, i) => (
          <div key={i} className="msg__status font-mono text-xs text-muted-foreground">
            › {s}
          </div>
        ))}
      </CollapsibleContent>
    </Collapsible>
  )
}

/** Hover action row under a finished assistant message — just Copy for now. */
function CopyAction({ text }: { text: string }): React.JSX.Element {
  const [copied, setCopied] = useState(false)
  return (
    <div className="msg__actions">
      <button
        className="msg__action"
        aria-label="Copy message"
        title="Copy"
        onClick={() => {
          void navigator.clipboard.writeText(text).then(() => {
            setCopied(true)
            setTimeout(() => setCopied(false), 1500)
          })
        }}
      >
        {copied ? <Check className="size-3.5" aria-hidden="true" /> : <Copy className="size-3.5" aria-hidden="true" />}
      </button>
    </div>
  )
}

function setupPrompt(res: SetupResult): string | null {
  const file = res.files?.[0]
  switch (res.framework) {
    case 'react':
      return (
        `dsgn detected a React project and added a dev-only Babel plugin at \`${file}\`. Please: ` +
        `(1) read the actual vite.config and wire ${file} into the React plugin's Babel config ` +
        `(\`react({ babel: { plugins: [...] } })\`) FOR DEVELOPMENT ONLY — gate it on the serve/dev ` +
        `command; if the config shape differs, adapt to the real file or tell me what's blocking ` +
        `rather than guessing. (2) Add an explicit \`interface Props\` to the components so their ` +
        `props are editable. Then I'll reload the preview.`
      )
    case 'react-native':
      return (
        `dsgn detected a React Native / Expo project and added a dev-only Babel plugin at ` +
        `\`${file}\` that stamps \`testID="dsgn:path:line:col"\` on elements (the RN analog of ` +
        `data-dsgn-source — iOS surfaces testID as the accessibility id, which dsgn reads from ` +
        `the simulator's view hierarchy). Please: (1) read babel.config.js (or .babelrc) and add ` +
        `${file} to the \`plugins\` array FOR DEVELOPMENT ONLY (gate on a dev env check; adapt to ` +
        `the real config, don't guess its shape). (2) Add an explicit \`interface Props\` to your ` +
        `components so their props are editable. Then I'll reload the preview.`
      )
    case 'solid':
      return (
        `dsgn detected a Solid project and added a dev-only Babel JSX plugin at \`${file}\`. Please ` +
        `wire ${file} into the Solid Vite plugin's Babel config for development only (adapt to the ` +
        `real config), and type each component's props with an explicit \`Props\` type. Then I'll ` +
        `reload the preview.`
      )
    case 'svelte': {
      const typing =
        res.svelteMajor && res.svelteMajor < 5
          ? 'Type props with typed `export let` declarations (Svelte 4)'
          : 'Type props with `interface Props` + `let { ... }: Props = $props()` (Svelte 5)'
      return (
        `dsgn detected a Svelte project and added a dev-only markup preprocessor at \`${file}\`. ` +
        `Please: (1) read svelte.config.* and add ${file}'s default export to the \`preprocess\` ` +
        `array FOR DEVELOPMENT ONLY (gate on dev; adapt to the real config, don't guess its shape). ` +
        `(2) ${typing} so props are editable. Then I'll reload the preview.`
      )
    }
    case 'vue':
      return (
        `dsgn detected a Vue project. Please add a DEV-ONLY way to map elements to their source as a ` +
        `\`data-dsgn-source="path:line:col"\` attribute (e.g. vite-plugin-vue-inspector, or a small ` +
        `template transform), and type props with \`defineProps<Props>()\`. Then I'll reload the preview.`
      )
    default:
      return null
  }
}

export default function ChatPanel(): React.JSX.Element {
  const { messages, isRunning, appendUser, startAssistant, appendDelta, appendStatus, finish } =
    useChat()
  const { model, provider, slashCommands, projectRoot, setModel, setProvider } =
    useSession()
  const { selected, setSelected } = useSelection()
  const selectMode = useSelection((s) => s.selectMode)
  const inspection = useSelection((s) => s.inspection)
  const inspecting = useSelection((s) => s.inspecting)
  const { pending, removeRequest } = usePermissions()
  const questions = useQuestions((s) => s.pending)
  const removeQuestion = useQuestions((s) => s.removeRequest)
  const { list: notes, focusedId, setList: setNotes } = useAnnotations()
  const tokens = useTokens()
  const setup = useSetup()
  const composerSeed = useComposer((s) => s.seed)
  const composerSubmit = useComposer((s) => s.submit)
  const [publishing, setPublishing] = useState(false)
  const [publishMsg, setPublishMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [input, setInput] = useState('')
  const [menuActive, setMenuActive] = useState(0)
  const [menuDismissed, setMenuDismissed] = useState(false)
  // Images pasted/dropped into the composer, sent as vision blocks with the turn.
  const [attachments, setAttachments] = useState<
    { id: string; mediaType: string; data: string; url: string }[]
  >([])
  const [dragOver, setDragOver] = useState(false)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  // Auto-grow the composer with the text — from 2 lines up to 6, then scroll.
  useEffect(() => {
    const ta = inputRef.current
    if (!ta) return
    const cs = getComputedStyle(ta)
    const lh = parseFloat(cs.lineHeight) || 20
    const padY = parseFloat(cs.paddingTop) + parseFloat(cs.paddingBottom)
    const min = lh * 2 + padY
    const max = lh * 6 + padY
    ta.style.height = 'auto'
    ta.style.height = `${Math.max(min, Math.min(ta.scrollHeight, max))}px`
    ta.style.overflowY = ta.scrollHeight > max ? 'auto' : 'hidden'
  }, [input])

  // Don't carry a publish result across projects (it'd show under the new repo).
  useEffect(() => {
    setPublishMsg(null)
    setPublishing(false)
  }, [projectRoot])

  // App-level components (prop panel, setup) seed the composer via the store.
  useEffect(() => {
    if (composerSeed == null) return
    setInput((cur) => (cur.trim() ? `${composerSeed} ${cur}` : composerSeed))
    useComposer.getState().setSeed(null)
    requestAnimationFrame(() => {
      const el = inputRef.current
      if (!el) return
      el.focus()
      el.setSelectionRange(el.value.length, el.value.length)
    })
  }, [composerSeed])

  // Inline comment-mode (C) sends straight to the agent. If a turn is already
  // running, prefill instead so the comment is never dropped.
  useEffect(() => {
    if (composerSubmit == null) return
    useComposer.getState().setSubmit(null)
    if (isRunning) seedPrompt(composerSubmit)
    else send(composerSubmit)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [composerSubmit])

  useEffect(() => {
    return window.api.agent.onEvent((event) => {
      // v8 F1: a detached comment spawn's events carry a `sessionId` — they NEVER
      // enter the main chat stream. We only react to the terminal `spawn-finished`
      // (drop the working rail row; the finished run reappears in history). This
      // guard is what guarantees the active chat stays byte-clean under parallel spawns.
      if (event.sessionId) {
        const pkey = event.projectKey ?? ''
        if (event.type === 'spawn-started') {
          useSpawns.getState().start(pkey, event.sessionId, event.branch)
        } else if (event.type === 'spawn-finished') {
          useSpawns.getState().remove(pkey, event.sessionId)
          // Notify in the parent project's chat so the user can follow up on it. A
          // null branch means it auto-applied onto the working tree; a branch means
          // it couldn't (conflict) and is waiting in the rail for review.
          const files = event.files?.length ? ` · ${event.files.join(', ')}` : ''
          const head = event.branch
            ? `💬 Comment finished — couldn't auto-apply, review it in the sidebar${files}`
            : `💬 Comment applied${files}`
          useChat
            .getState()
            .appendNote(event.summary ? `${head}\n\n${event.summary}` : head, pkey)
          const root = useSession.getState().projectRoot
          if (root && projectKey(root) === pkey) void useHistory.getState().load(root)
        }
        return
      }
      // Route to the emitting project's chat slice (main tags every event). The
      // active project's slice is what's shown; a backgrounded project keeps
      // streaming into its own (a "working" dot in the rail).
      const key = event.projectKey ?? ''
      const isActive = key === useChat.getState().activeKey
      if (event.type === 'delta') {
        appendDelta(event.text, key)
      } else if (event.type === 'status') {
        appendStatus(event.text, key)
      } else if (event.type === 'error') {
        // A Claude auth failure gets a short line pointing at the (Claude-specific)
        // onboarding banner. Non-Claude backends (Codex/Gemini) have no such banner
        // and emit a descriptive "install the CLI + log in" message — show that as-is
        // rather than a misleading "not connected to Claude". (v7)
        const isClaude = (useSession.getState().provider ?? 'claude') === 'claude'
        const note =
          isAuthError(event.message) && isClaude
            ? '⚠️ Not connected to Claude — see the notice above.'
            : `⚠️ ${event.message}`
        appendDelta(`\n\n${note}`, key)
        finish(key)
        // The setup turn failed before wiring — disarm verification so the next
        // unrelated readiness report isn't mistaken for a verdict. Setup state is
        // the active project's, so only its failed turn touches it.
        if (isActive) {
          useSetup.getState().setBusy(false)
          useSetup.getState().setVerifying(false)
        }
      } else if (event.type === 'done') {
        finish(key)
        if (isActive) {
          const s = useSetup.getState()
          // `busy` set ⟺ this was the setup turn: it edited the build config, which
          // the dev server only picks up on a full restart. Arm verification and ask
          // App to restart + reload the preview. Normal chat turns leave it alone.
          if (s.busy) {
            s.setVerifying(true)
            s.setRestartRequested(true)
          }
          s.setBusy(false)
        }
      }
    })
  }, [appendDelta, appendStatus, finish])

  // "/" slash-command menu state.
  const slashQuery = input.startsWith('/') && !input.includes(' ') ? input.slice(1) : null
  const matches = useMemo(() => {
    if (slashQuery === null) return []
    const q = slashQuery.toLowerCase()
    return slashCommands.filter((c) => c.toLowerCase().includes(q)).slice(0, 8)
  }, [slashQuery, slashCommands])
  const menuOpen = slashQuery !== null && matches.length > 0 && !menuDismissed

  useEffect(() => {
    // Re-arm the menu for each distinct "/" query (Escape only hides the current one).
    setMenuActive(0)
    setMenuDismissed(false)
  }, [slashQuery])

  const onInputChange = (value: string): void => {
    setInput(value)
    if (!value.startsWith('/')) setMenuDismissed(false)
  }

  const pickCommand = (cmd: string): void => {
    setInput(`/${cmd} `)
    setMenuDismissed(true)
    inputRef.current?.focus()
  }

  // Seed the composer with `text` and drop the cursor at the end.
  const seedPrompt = (text: string): void => {
    setInput((cur) => (cur.trim() ? `${text} ${cur}` : text))
    requestAnimationFrame(() => {
      const el = inputRef.current
      if (!el) return
      el.focus()
      el.setSelectionRange(el.value.length, el.value.length)
    })
  }

  // Accept the setup offer: write the stamping plugin (deterministic), then hand
  // the wiring + component typing to the agent.
  const acceptSetup = async (): Promise<void> => {
    if (!projectRoot || setup.busy || isRunning) return
    setup.setBusy(true)
    setup.setStatus('Detecting framework + adding source-mapping…')
    try {
      const res = await window.api.setup.scaffold(projectRoot)
      if (!res.ok) {
        setup.setStatus(`Setup failed: ${res.error ?? 'unknown error'}`)
        setup.setBusy(false)
        return
      }
      const prompt = setupPrompt(res)
      if (!prompt) {
        // Unsupported / undetected framework — stop and say so, never send a
        // React prompt into a repo we couldn't classify.
        setup.setStatus(
          res.framework && res.framework !== 'unknown'
            ? `Detected ${res.framework}, which dsgn can't auto-instrument yet. Ask me directly to add element→source mapping.`
            : `Couldn't detect a supported framework (React/Svelte/Vue/Solid). Open one of those, or ask me directly.`
        )
        setup.setBusy(false)
        return
      }
      // Stream the agent turn into the chat (and flip `isRunning`) so the user can
      // watch progress and stop it. `busy` stays true until the turn finishes —
      // cleared by the `done`/`error` handler — so the card can't be re-triggered.
      // `busy` also marks "this is the setup turn"; verification is armed only when
      // it finishes (see the `done` handler), so a mid-turn dev-server auto-restart
      // can't be mistaken for the verdict.
      startAssistant()
      void window.api.agent.send(prompt)
      setup.setStatus(
        `Detected ${res.framework}. Asked dsgn to wire it in and type your components — I'll restart the preview and verify automatically when it finishes.`
      )
    } catch {
      setup.setStatus('Setup could not be started.')
      setup.setBusy(false)
    }
  }

  // Write a starter `.dsgn/tokens.json` (deterministic — no agent turn) and show
  // the new tokens in the palette. Idempotent on the main side.
  const acceptTokenScaffold = async (): Promise<void> => {
    if (!projectRoot || tokens.scaffolding) return
    const root = projectRoot
    tokens.setScaffolding(true)
    try {
      const res = await window.api.tokens.scaffold(root)
      // If the user switched projects while the write was in flight, the new
      // project owns the token state now — don't stamp this project's tokens over
      // it (mirrors the detect handler's guard in App).
      if (useSession.getState().projectRoot !== root) return
      if (!res.ok) return
      if (res.set) tokens.setSet(res.set)
      tokens.setOfferNeeded(false)
    } catch {
      /* leave the offer up so the user can retry */
    } finally {
      if (useSession.getState().projectRoot === root) tokens.setScaffolding(false)
    }
  }

  // Ask the agent to remove the selected element. The transcript shows a short
  // human-readable request; the element reference travels hidden (like send()).
  const deleteSelection = (): void => {
    if (!selected || isRunning) return
    const ident = selected.id
      ? `#${selected.id}`
      : selected.classes[0]
        ? `.${selected.classes[0]}`
        : ''
    appendUser(`Delete the <${selected.tag}${ident}> element`)
    startAssistant()
    void window.api.agent.send(
      describeSelectionForPrompt(selected) +
        'Delete this element from the source. Remove it cleanly — including any wrappers, imports, or styles that exist only for it.'
    )
    setSelected(null)
  }
  // The in-preview selection toolbar routes its code/delete actions here (its
  // comment/annotate open the preview's own composer). Ref-indirected so the
  // one-time listener always runs the current closure.
  const deleteSelectionRef = useRef<() => void>(() => {})
  deleteSelectionRef.current = deleteSelection
  useEffect(
    () =>
      window.api.preview.onToolbarAction((kind) => {
        const sel = useSelection.getState().selected
        if (!sel) return
        if (kind === 'code' && sel.source) {
          const drawer = useCodeDrawer.getState()
          if (drawer.source === sel.source) drawer.close()
          else drawer.open(sel.source)
        } else if (kind === 'delete') {
          deleteSelectionRef.current()
        } else if (kind === 'props') {
          usePropsIsland.getState().setOpen(!usePropsIsland.getState().open)
        }
      }),
    []
  )

  // Read image files (paste/drop) into base64 attachments + a preview URL.
  const addImageFiles = (files: File[]): void => {
    let nextId = Date.now()
    for (const file of files) {
      if (!file.type.startsWith('image/')) continue
      const reader = new FileReader()
      reader.onload = () => {
        const url = String(reader.result) // data:<mime>;base64,<data>
        const data = url.slice(url.indexOf(',') + 1)
        setAttachments((a) => [...a, { id: `att${nextId++}`, mediaType: file.type, data, url }])
      }
      reader.readAsDataURL(file)
    }
  }

  const onPaste = (e: React.ClipboardEvent<HTMLTextAreaElement>): void => {
    const files = Array.from(e.clipboardData.files).filter((f) => f.type.startsWith('image/'))
    if (files.length) {
      e.preventDefault() // don't also paste the image's path/text
      addImageFiles(files)
    }
  }

  const onDrop = (e: React.DragEvent): void => {
    const files = Array.from(e.dataTransfer.files).filter((f) => f.type.startsWith('image/'))
    if (files.length) {
      e.preventDefault()
      addImageFiles(files)
    }
    setDragOver(false)
  }

  const send = (raw: string = input): void => {
    const text = raw.trim()
    if ((!text && attachments.length === 0) || isRunning) return
    const images = attachments.map((a) => ({ mediaType: a.mediaType, data: a.data }))
    // The selection pill rides along as hidden context: the transcript shows the
    // user's own words; the model gets the element reference prepended.
    const ctx = selected ? describeSelectionForPrompt(selected) : ''
    appendUser(text || (images.length ? `🖼 ${images.length} image(s)` : ''))
    startAssistant()
    setInput('')
    setAttachments([])
    void window.api.agent.send(ctx + text, images.length ? images : undefined)
    if (selected) setSelected(null)
  }

  // Interrupt the in-flight turn. The SDK emits a `result` → `done`, which clears
  // `isRunning` via the agent-event handler. An interrupt is indistinguishable
  // from a clean completion at the `done` handler, so if this is a *setup* turn
  // being cancelled, drop `busy` now: that's what marks "the setup turn finished
  // successfully", so clearing it stops the incoming `done` from restarting the
  // dev server + arming a (bogus) verdict against half-written config.
  const stop = (): void => {
    const s = useSetup.getState()
    if (s.busy) {
      s.setBusy(false)
      s.setStatus('Setup cancelled.')
    }
    void window.api.agent.interrupt()
  }

  const onModelChange = (value: string): void => {
    setModel(value)
    if (value !== DEFAULT_MODEL) void window.api.agent.setModel(value)
  }


  // Switching the backend means a different agent session entirely — the model
  // can't change live across providers. Reopen the active project's session on the
  // new backend (the visible transcript stays; context resets, like an LRU reopen).
  const onProviderChange = (value: string): void => {
    setProvider(value)
    if (!projectRoot) return
    void window.api.agent.openProject(projectRoot, {
      ...toAgentOptions({ ...useSession.getState(), provider: value }),
      permissionMode: usePermissions.getState().mode
    })
    // The reopened session starts idle — clear any turn left "running" on the slice.
    useChat.getState().finish()
  }

  const respondPermission = (id: string, behavior: 'allow' | 'deny'): void => {
    removeRequest(id)
    void window.api.agent.respondPermission(id, behavior)
  }

  const respondQuestion = (id: string, answers: QuestionAnswers | null): void => {
    removeQuestion(id)
    void window.api.agent.respondQuestion(id, answers)
  }

  const removeNote = async (id: string): Promise<void> => {
    if (!projectRoot) return
    setNotes(await window.api.annotations.remove(projectRoot, id))
  }

  const publish = async (): Promise<void> => {
    if (!projectRoot || publishing) return
    setPublishing(true)
    setPublishMsg(null)
    try {
      const res = await window.api.publish.toPr(projectRoot, { title: 'dsgn: design handoff' })
      // Tag the session's history record with the PR it produced (v5-D).
      if (res.ok && res.url) void window.api.agent.tagSession(projectRoot, { prUrl: res.url })
      setPublishMsg(
        res.ok
          ? { ok: true, text: res.url ? `Opened ${res.url}` : 'PR opened.' }
          : { ok: false, text: res.error ?? 'Publish failed.' }
      )
    } finally {
      setPublishing(false)
    }
  }

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>): void => {
    if (menuOpen) {
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setMenuActive((i) => (i + 1) % matches.length)
        return
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault()
        setMenuActive((i) => (i - 1 + matches.length) % matches.length)
        return
      }
      if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault()
        pickCommand(matches[menuActive])
        return
      }
      if (e.key === 'Escape') {
        e.preventDefault()
        setMenuDismissed(true)
        return
      }
    }
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      send()
    }
  }

  // Reusable Tailwind for the three quiet inline picker <select>s. Native (not
  // shadcn Select) on purpose: tiny controls, and the permission-mode test reads
  // native <option> values via $$eval — a Radix portal would break it.
  const selectCls =
    'cursor-pointer appearance-none rounded-md border-0 bg-transparent px-1 py-0.5 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:bg-accent focus-visible:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'

  return (
    <div className="chat flex h-full flex-col">
      {/* AI Elements Conversation = stick-to-bottom scroller (auto-follows the
          stream, with a scroll-to-bottom affordance). Replaces the old manual
          listRef scroll effect. */}
      <Conversation className="chat__messages min-h-0 flex-1">
        <ConversationContent className="gap-3.5 p-4 pt-11">
          {setup.needed && !setup.dismissed && (
            <SetupCard
              busy={setup.busy}
              status={setup.status}
              onAccept={() => void acceptSetup()}
              onStop={stop}
              onDismiss={() => {
                setup.setDismissed(true)
                setup.setNeeded(false)
              }}
            />
          )}
          {/* Token offer yields to the setup offer — only one card at a time. */}
          {!setup.needed && tokens.offerNeeded && !tokens.offerDismissed && (
            <TokenOfferCard
              scaffolding={tokens.scaffolding}
              status={null}
              onAccept={() => void acceptTokenScaffold()}
              onDismiss={() => {
                tokens.setOfferDismissed(true)
                tokens.setOfferNeeded(false)
              }}
            />
          )}
          {messages.length === 0 && !setup.needed && !tokens.offerNeeded && (
            <div className="chat__empty">
              Ask for a change, or open a project to preview it on the right.
            </div>
          )}
          {messages.map((m, idx) => (
            // No role labels — the user's bubble vs the assistant's plain
            // markdown is distinction enough (m.role still drives styling).
            <div key={m.id} className={cn('msg flex flex-col gap-1', `msg--${m.role}`)}>
              {m.statuses.length > 0 && (
                <StepDisclosure
                  statuses={m.statuses}
                  active={isRunning && idx === messages.length - 1 && m.role === 'assistant'}
                />
              )}
              {m.text &&
                (m.role === 'assistant' ? (
                  <Markdown>{m.text}</Markdown>
                ) : (
                  <div className="msg__text w-fit rounded-lg border border-border bg-muted px-3 py-2 text-sm">
                    {m.text}
                  </div>
                ))}
              {m.role === 'assistant' && m.text && !(isRunning && idx === messages.length - 1) && (
                <CopyAction text={m.text} />
              )}
            </div>
          ))}
        </ConversationContent>
        <ConversationScrollButton aria-label="Scroll to bottom" />
      </Conversation>

      {/* Live status line — a cat that runs (with the current step, like a
          terminal "Architecting…" indicator) while a turn is in flight and
          settles on the idle sprite while waiting for input. */}
      <div className="chat__status" aria-live="polite">
        <CatLoader running={isRunning} />
        {isRunning && (
          <span className="chat__status-text">
            {messages[messages.length - 1]?.statuses.at(-1) ?? 'Working…'}
          </span>
        )}
      </div>

      <div className="composer">
        <QuestionCards requests={questions} onRespond={respondQuestion} />
        <PermissionCards requests={pending} onRespond={respondPermission} />
        <NotesPanel
          notes={notes}
          focusedId={focusedId}
          publishing={publishing}
          publishMsg={publishMsg}
          onRemove={(id) => void removeNote(id)}
          onPublish={() => void publish()}
        />
        {/* v7: when a non-Claude backend is selected, point the user at its
            one-time subscription login (no API keys). */}
        {(() => {
          const p = PROVIDERS.find((x) => x.value === provider)
          if (!p?.login) return null
          return (
            <div
              className="provider-hint rounded-md border border-blue-200 bg-blue-50 px-2.5 py-1.5 text-[11.5px] text-blue-900"
              role="note"
            >
              {p.blurb} — run{' '}
              <code className="rounded bg-blue-100 px-1 font-mono text-[11px]">{p.login}</code> once
              if a turn says it’s not connected.
            </div>
          )
        })()}
        {/* shadcn InputGroup = the rounded, focus-ringed composer frame. The
            textarea carries data-slot="input-group-control" so the group lights
            up on focus. Native textarea (not InputGroupTextarea) to keep the ref
            for seeding/cursor control on React 18. */}
        <InputGroup
          className={`relative rounded-2xl ${dragOver ? 'ring-2 ring-blue-400' : ''}`}
          onDrop={onDrop}
          onDragOver={(e) => {
            if (Array.from(e.dataTransfer.types).includes('Files')) {
              e.preventDefault()
              setDragOver(true)
            }
          }}
          onDragLeave={() => setDragOver(false)}
        >
          {selected && <Inspector element={selected} onClear={() => setSelected(null)} />}
          {attachments.length > 0 && (
            <div className="flex flex-wrap gap-1.5 px-2 pt-2">
              {attachments.map((a) => (
                <div key={a.id} className="relative h-12 w-12 overflow-hidden rounded-md border border-border">
                  <img src={a.url} alt="attachment" className="h-full w-full object-cover" />
                  <button
                    type="button"
                    onClick={() => setAttachments((list) => list.filter((x) => x.id !== a.id))}
                    aria-label="Remove image"
                    className="absolute right-0.5 top-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-black/60 text-[10px] leading-none text-white"
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          )}
          {menuOpen && (
            <div className="slash" role="listbox">
              <div className="slash__hint">Skills & commands</div>
              {matches.map((cmd, i) => (
                <button
                  key={cmd}
                  className={`slash__item ${i === menuActive ? 'is-active' : ''}`}
                  onMouseEnter={() => setMenuActive(i)}
                  onClick={() => pickCommand(cmd)}
                >
                  /{cmd}
                </button>
              ))}
            </div>
          )}
          <textarea
            ref={inputRef}
            data-slot="input-group-control"
            className="composer__input"
            placeholder="Ask Praxis  (/ for skills)"
            value={input}
            rows={2}
            onChange={(e) => onInputChange(e.target.value)}
            onKeyDown={onKeyDown}
            onPaste={onPaste}
          />
          <InputGroupAddon align="block-end" className="gap-1">
            {/* The selectors shrink + wrap when the chat pane is narrow so the send
                button (shrink-0, below) is never pushed off the edge. */}
            <div className="mr-auto flex min-w-0 flex-wrap items-center gap-1">
            {/* Element-select toggle — lives here (Figma Make-style), not in the
                preview bar. Routing to web/simulator select mode is App's. */}
            {projectRoot && (
              <button
                type="button"
                className={`iconbtn iconbtn--sm ${selectMode ? 'is-active' : ''}`}
                onClick={() => useUiActions.getState().toggleSelect()}
                aria-pressed={selectMode}
                aria-label="Select"
                title="Select an element to edit (S)"
              >
                <MousePointer2 className="size-3.5" aria-hidden="true" />
              </button>
            )}
            <select
              className={selectCls}
              value={provider}
              onChange={(e) => onProviderChange(e.target.value)}
              aria-label="Backend"
            >
              {PROVIDERS.map((p) => (
                <option key={p.value} value={p.value}>
                  {p.label}
                </option>
              ))}
            </select>
            <select
              className={selectCls}
              value={model}
              onChange={(e) => onModelChange(e.target.value)}
              aria-label="Model"
            >
              {MODELS.map((m) => (
                <option key={m.value} value={m.value}>
                  {m.label}
                </option>
              ))}
            </select>
            </div>
            {isRunning ? (
              <Button
                type="button"
                size="icon"
                className="composer__send composer__send--stop shrink-0"
                onClick={stop}
                aria-label="Stop"
                title="Stop"
              >
                <span className="composer__spinner" aria-hidden="true" />
                <span className="composer__stop-icon" aria-hidden="true" />
              </Button>
            ) : (
              <Button
                type="button"
                size="icon"
                className="composer__send shrink-0"
                onClick={() => send()}
                disabled={!input.trim() && attachments.length === 0}
                aria-label="Send message"
              >
                <ArrowUp className="size-4" aria-hidden="true" />
              </Button>
            )}
          </InputGroupAddon>
        </InputGroup>
      </div>
    </div>
  )
}
