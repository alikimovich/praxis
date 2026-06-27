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
  useSelection,
  useSession,
  useSetup,
  useSpawns,
  useTokens
} from '../store'
import { projectKey } from '../../../shared/projectKey'
import type { PermissionMode, SetupResult, Token } from '../../../shared/api'
import Inspector from './Inspector'
import Markdown from './Markdown'
import NotesPanel from './NotesPanel'
import PermissionCards from './PermissionCards'
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
import { ArrowUp } from 'lucide-react'

const MODELS = [
  { value: DEFAULT_MODEL, label: 'Default' },
  { value: 'opus', label: 'Opus' },
  { value: 'sonnet', label: 'Sonnet' },
  { value: 'haiku', label: 'Haiku' }
]

const EFFORTS = [
  { value: 'auto', label: 'Auto' },
  { value: 'low', label: 'Low' },
  { value: 'medium', label: 'Medium' },
  { value: 'high', label: 'High' }
]

const PERMISSION_MODES: { value: PermissionMode; label: string }[] = [
  { value: 'default', label: 'Ask' },
  { value: 'acceptEdits', label: 'Auto-accept edits' },
  { value: 'bypassPermissions', label: 'Auto: approve all' }
]

// Selectable backends (v7). Each authenticates with the user's own subscription
// login — no API keys. Only backends that exist in main's pickProvider are listed
// (Gemini/Grok land when their adapters do). `login` is the one-time CLI step.
const PROVIDERS: { value: string; label: string; login: string | null; blurb: string | null }[] = [
  { value: 'claude', label: 'Claude', login: null, blurb: null },
  {
    value: 'codex',
    label: 'Codex (GPT)',
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
  const { model, effort, provider, slashCommands, projectRoot, setModel, setEffort, setProvider } =
    useSession()
  const { selected, setSelected } = useSelection()
  const inspection = useSelection((s) => s.inspection)
  const inspecting = useSelection((s) => s.inspecting)
  const { mode: permissionMode, pending, setMode, removeRequest } = usePermissions()
  const { list: notes, focusedId, setList: setNotes } = useAnnotations()
  const tokenSet = useTokens((s) => s.set)
  const tokens = useTokens()
  const setup = useSetup()
  const composerSeed = useComposer((s) => s.seed)
  const composerSubmit = useComposer((s) => s.submit)
  const [publishing, setPublishing] = useState(false)
  const [publishMsg, setPublishMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [input, setInput] = useState('')
  const [menuActive, setMenuActive] = useState(0)
  const [menuDismissed, setMenuDismissed] = useState(false)
  const inputRef = useRef<HTMLTextAreaElement>(null)

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
        if (event.type === 'spawn-finished') {
          const pkey = event.projectKey ?? ''
          useSpawns.getState().remove(pkey, event.sessionId)
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
        // Auth failures get a friendly banner (see App); keep the chat line short.
        const note = isAuthError(event.message)
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

  // Apply a design token to the selected element. Direct-first: when the token
  // maps to an existing literal (a schema enum prop, a single inline-style
  // property), it's spliced straight to source (instant hot-reload, no agent);
  // ambiguous cases fall back to a sanitized agent prompt. Page/repo-derived
  // strings are bounded via oneLine so an injected value can't masquerade as a new
  // instruction in that fallback.
  const pickToken = (group: string, token: Token): void => {
    if (!selected || !projectRoot) return
    const id = selected.id ? oneLine(selected.id, 64) : ''
    const cls = selected.classes[0] ? oneLine(selected.classes[0], 64) : ''
    const ident = id ? `#${id}` : cls ? `.${cls}` : ''
    const seedFallback = (): void =>
      seedPrompt(
        `Apply the ${oneLine(group, 32)} token “${oneLine(token.name, 80)}” (${oneLine(token.value, 120)}) to the selected ` +
          `<${oneLine(selected.tag, 32)}${ident}> element. `
      )
    // Snapshot the target so a mid-flight selection/project switch can't have a
    // stale re-inspect stamp this element's props over the new selection.
    const root = projectRoot
    const src = selected.source
    void window.api.props
      .applyToken(root, { source: src, token, group, tokenSource: tokenSet?.source ?? 'none', classes: selected.classes })
      .then((res) => {
        if (!res.applied) {
          seedFallback() // needsAgent or error → let the agent handle it
          return
        }
        // Refresh the panel from the now-edited source — only if still current.
        if (src)
          void window.api.props
            .inspect(root, src)
            .then((r) => {
              if (
                r &&
                useSession.getState().projectRoot === root &&
                useSelection.getState().selected?.source === src
              )
                useSelection.getState().setInspection(r)
            })
            .catch(() => {})
      })
      .catch(seedFallback)
  }

  // "Ask dsgn to change this…" — seed the composer with the element reference
  // (and its source location) so the agent edits the right place, then close
  // the inspector and drop the cursor at the end for the user to type the change.
  const askAboutSelection = (): void => {
    if (!selected) return
    seedPrompt(describeSelectionForPrompt(selected))
    setSelected(null)
  }

  const send = (raw: string = input): void => {
    const text = raw.trim()
    if (!text || isRunning) return
    appendUser(text)
    startAssistant()
    setInput('')
    void window.api.agent.send(text)
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

  const onPermissionModeChange = (value: PermissionMode): void => {
    const prev = usePermissions.getState().mode
    setMode(value)
    // Keep the toolbar honest: if the SDK refuses the change, revert the control.
    window.api.agent.setPermissionMode(value).catch(() => setMode(prev))
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

  const addNote = async (text: string): Promise<boolean> => {
    if (!projectRoot || !selected) return false
    try {
      const list = await window.api.annotations.add(projectRoot, {
        source: selected.source,
        selector: selected.selector,
        tag: selected.tag,
        text
      })
      setNotes(list)
      return true
    } catch {
      return false
    }
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
    'cursor-pointer appearance-none rounded-md border-0 bg-transparent px-1.5 py-1 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:bg-accent focus-visible:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'

  return (
    <div className="chat flex h-full flex-col">
      {/* AI Elements Conversation = stick-to-bottom scroller (auto-follows the
          stream, with a scroll-to-bottom affordance). Replaces the old manual
          listRef scroll effect. */}
      <Conversation className="chat__messages min-h-0 flex-1">
        <ConversationContent className="gap-3.5 p-4">
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
          {messages.map((m) => (
            <div key={m.id} className={cn('msg flex flex-col gap-1', `msg--${m.role}`)}>
              <div className="msg__role text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                {m.role}
              </div>
              {m.statuses.map((s, i) => (
                <div key={i} className="msg__status font-mono text-xs text-muted-foreground">
                  › {s}
                </div>
              ))}
              {m.text &&
                (m.role === 'assistant' ? (
                  <Markdown>{m.text}</Markdown>
                ) : (
                  <div className="msg__text w-fit rounded-lg border border-border bg-muted px-3 py-2 text-sm">
                    {m.text}
                  </div>
                ))}
            </div>
          ))}
        </ConversationContent>
        <ConversationScrollButton aria-label="Scroll to bottom" />
      </Conversation>

      <div className="composer">
        <PermissionCards requests={pending} onRespond={respondPermission} />
        {selected && (
          <Inspector
            element={selected}
            propsReady={!!inspection?.hasSchema}
            inspecting={inspecting}
            onSetup={() => {
              useSetup.getState().setDismissed(false)
              useSetup.getState().setNeeded(true)
            }}
            onAsk={askAboutSelection}
            onClear={() => setSelected(null)}
            onAddNote={addNote}
            tokens={tokenSet}
            onPickToken={pickToken}
            onSelectOwner={() => {
              // v8 F3a: re-point the selection at the component-instance call site
              // so the panel (props.inspect) edits this instance's props. One level
              // up; the new selection has no further owner (it came from the DOM).
              if (selected?.componentSource) {
                setSelected({
                  ...selected,
                  source: selected.componentSource,
                  componentSource: null
                })
              }
            }}
          />
        )}
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
        <InputGroup className="relative rounded-2xl">
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
            placeholder="Message dsgn…  (/ for skills)"
            value={input}
            rows={2}
            onChange={(e) => onInputChange(e.target.value)}
            onKeyDown={onKeyDown}
          />
          <InputGroupAddon align="block-end" className="gap-1">
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
            <select
              className={selectCls}
              value={effort}
              onChange={(e) => setEffort(e.target.value)}
              aria-label="Thinking level"
            >
              {EFFORTS.map((eo) => (
                <option key={eo.value} value={eo.value}>
                  {eo.label}
                </option>
              ))}
            </select>
            <select
              className={selectCls}
              value={permissionMode}
              onChange={(e) => onPermissionModeChange(e.target.value as PermissionMode)}
              aria-label="Permission mode"
            >
              {PERMISSION_MODES.map((pm) => (
                <option key={pm.value} value={pm.value}>
                  {pm.label}
                </option>
              ))}
            </select>
            {isRunning ? (
              <Button
                type="button"
                size="icon"
                className="composer__send composer__send--stop ml-auto"
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
                className="composer__send ml-auto"
                onClick={() => send()}
                disabled={!input.trim()}
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
