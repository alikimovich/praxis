import { useEffect, useMemo, useRef, useState } from 'react'
import {
  DEFAULT_MODEL,
  describeSelectionForPrompt,
  isAuthError,
  oneLine,
  useAnnotations,
  useChat,
  useComposer,
  usePermissions,
  useSelection,
  useSession,
  useSetup,
  useTokens
} from '../store'
import type { PermissionMode, SetupResult, Token } from '../../../shared/api'
import Inspector from './Inspector'
import Markdown from './Markdown'
import NotesPanel from './NotesPanel'
import PermissionCards from './PermissionCards'
import SetupCard from './SetupCard'

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
  const { model, effort, slashCommands, projectRoot, setModel, setEffort } = useSession()
  const { selected, setSelected } = useSelection()
  const inspection = useSelection((s) => s.inspection)
  const inspecting = useSelection((s) => s.inspecting)
  const { mode: permissionMode, pending, setMode, removeRequest } = usePermissions()
  const { list: notes, focusedId, setList: setNotes } = useAnnotations()
  const tokenSet = useTokens((s) => s.set)
  const setup = useSetup()
  const composerSeed = useComposer((s) => s.seed)
  const [publishing, setPublishing] = useState(false)
  const [publishMsg, setPublishMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [input, setInput] = useState('')
  const [menuActive, setMenuActive] = useState(0)
  const [menuDismissed, setMenuDismissed] = useState(false)
  const listRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const streamingId = useRef<string | null>(null)

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

  useEffect(() => {
    return window.api.agent.onEvent((event) => {
      const id = streamingId.current
      if (!id) return
      if (event.type === 'delta') {
        appendDelta(id, event.text)
      } else if (event.type === 'status') {
        appendStatus(id, event.text)
      } else if (event.type === 'error') {
        // Auth failures get a friendly banner (see App); keep the chat line short.
        const note = isAuthError(event.message)
          ? '⚠️ Not connected to Claude — see the notice above.'
          : `⚠️ ${event.message}`
        appendDelta(id, `\n\n${note}`)
        finish()
        // The setup turn failed before wiring — disarm verification so the next
        // unrelated readiness report isn't mistaken for a verdict.
        useSetup.getState().setBusy(false)
        useSetup.getState().setVerifying(false)
        streamingId.current = null
      } else if (event.type === 'done') {
        finish()
        const s = useSetup.getState()
        // `busy` set ⟺ this was the setup turn: it edited the build config, which
        // the dev server only picks up on a full restart. Arm verification and ask
        // App to restart + reload the preview (the post-restart readiness is the
        // verdict). Normal chat turns leave the preview alone.
        if (s.busy) {
          s.setVerifying(true)
          s.setRestartRequested(true)
        }
        s.setBusy(false)
        streamingId.current = null
      }
    })
  }, [appendDelta, appendStatus, finish])

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight })
  }, [messages])

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
      streamingId.current = startAssistant()
      void window.api.agent.send(prompt)
      setup.setStatus(
        `Detected ${res.framework}. Asked dsgn to wire it in and type your components — I'll restart the preview and verify automatically when it finishes.`
      )
    } catch {
      setup.setStatus('Setup could not be started.')
      setup.setBusy(false)
    }
  }

  // Apply a design token to the selected element via the agent. Page-derived
  // element fields (and the repo-derived token) are sanitized + bounded so an
  // injected value can't masquerade as a new instruction in the prompt.
  const pickToken = (group: string, token: Token): void => {
    if (!selected) return
    const id = selected.id ? oneLine(selected.id, 64) : ''
    const cls = selected.classes[0] ? oneLine(selected.classes[0], 64) : ''
    const ident = id ? `#${id}` : cls ? `.${cls}` : ''
    const name = oneLine(token.name, 80)
    const value = oneLine(token.value, 120)
    seedPrompt(
      `Apply the ${oneLine(group, 32)} token “${name}” (${value}) to the selected ` +
        `<${oneLine(selected.tag, 32)}${ident}> element. `
    )
  }

  // "Ask dsgn to change this…" — seed the composer with the element reference
  // (and its source location) so the agent edits the right place, then close
  // the inspector and drop the cursor at the end for the user to type the change.
  const askAboutSelection = (): void => {
    if (!selected) return
    seedPrompt(describeSelectionForPrompt(selected))
    setSelected(null)
  }

  const send = (): void => {
    const text = input.trim()
    if (!text || isRunning) return
    appendUser(text)
    streamingId.current = startAssistant()
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

  return (
    <div className="chat">
      <div className="chat__messages" ref={listRef}>
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
        {messages.length === 0 && !setup.needed && (
          <div className="chat__empty">
            Ask for a change, or open a project to preview it on the right.
          </div>
        )}
        {messages.map((m) => (
          <div key={m.id} className={`msg msg--${m.role}`}>
            <div className="msg__role">{m.role}</div>
            {m.statuses.map((s, i) => (
              <div key={i} className="msg__status">
                › {s}
              </div>
            ))}
            {m.text &&
              (m.role === 'assistant' ? (
                <Markdown>{m.text}</Markdown>
              ) : (
                <div className="msg__text">{m.text}</div>
              ))}
          </div>
        ))}
      </div>

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
        <div className="composer__field">
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
            className="composer__input"
            placeholder="Message dsgn…  (/ for skills)"
            value={input}
            rows={2}
            onChange={(e) => onInputChange(e.target.value)}
            onKeyDown={onKeyDown}
          />
          <div className="composer__bar">
            <select
              className="select"
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
              className="select"
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
              className="select"
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
              <button
                className="composer__send composer__send--stop"
                onClick={stop}
                aria-label="Stop"
                title="Stop"
              >
                <span className="composer__spinner" aria-hidden="true" />
                <span className="composer__stop-icon" aria-hidden="true" />
              </button>
            ) : (
              <button
                className="composer__send"
                onClick={send}
                disabled={!input.trim()}
                aria-label="Send message"
              >
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                  <path
                    d="M8 13V3M8 3L3.5 7.5M8 3l4.5 4.5"
                    stroke="currentColor"
                    strokeWidth="1.6"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
