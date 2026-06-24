import { useEffect, useMemo, useRef, useState } from 'react'
import {
  DEFAULT_MODEL,
  describeSelectionForPrompt,
  isAuthError,
  oneLine,
  useAnnotations,
  useChat,
  usePermissions,
  useSelection,
  useSession,
  useTokens
} from '../store'
import type { PermissionMode, Token } from '../../../shared/api'
import Inspector from './Inspector'
import Markdown from './Markdown'
import NotesPanel from './NotesPanel'
import PermissionCards from './PermissionCards'

const MODELS = [
  { value: DEFAULT_MODEL, label: 'Default model' },
  { value: 'opus', label: 'Opus' },
  { value: 'sonnet', label: 'Sonnet' },
  { value: 'haiku', label: 'Haiku' }
]

const EFFORTS = [
  { value: 'auto', label: 'Thinking: Auto' },
  { value: 'low', label: 'Thinking: Low' },
  { value: 'medium', label: 'Thinking: Medium' },
  { value: 'high', label: 'Thinking: High' }
]

const PERMISSION_MODES: { value: PermissionMode; label: string }[] = [
  { value: 'default', label: 'Permissions: Ask' },
  { value: 'acceptEdits', label: 'Auto-accept edits' },
  { value: 'bypassPermissions', label: 'Auto: approve all' }
]

export default function ChatPanel(): React.JSX.Element {
  const { messages, isRunning, appendUser, startAssistant, appendDelta, appendStatus, finish } =
    useChat()
  const { model, effort, slashCommands, projectRoot, setModel, setEffort } = useSession()
  const { selected, setSelected } = useSelection()
  const { mode: permissionMode, pending, setMode, removeRequest } = usePermissions()
  const { list: notes, focusedId, setList: setNotes } = useAnnotations()
  const tokenSet = useTokens((s) => s.set)
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
        streamingId.current = null
      } else if (event.type === 'done') {
        finish()
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
        {messages.length === 0 && (
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
            root={projectRoot}
            onAsk={askAboutSelection}
            onClear={() => setSelected(null)}
            onSeedPrompt={seedPrompt}
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
        <div className="composer__toolbar">
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
        </div>

        <div className="composer__row">
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
          <button className="composer__send" onClick={send} disabled={!input.trim() || isRunning}>
            {isRunning ? '…' : 'Send'}
          </button>
        </div>
      </div>
    </div>
  )
}
