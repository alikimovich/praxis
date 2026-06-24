import { useEffect, useRef, useState } from 'react'
import ChatPanel from './components/ChatPanel'
import PreviewPane from './components/PreviewPane'
import {
  isAuthError,
  toAgentOptions,
  useChat,
  usePermissions,
  useSelection,
  useSession
} from './store'

const MIN_CHAT_WIDTH = 320
const MAX_CHAT_WIDTH = 760

type Status =
  | { kind: 'idle' }
  | { kind: 'busy'; label: string }
  | { kind: 'running'; name: string; url: string }
  | { kind: 'error'; message: string }

export default function App(): React.JSX.Element {
  const [status, setStatus] = useState<Status>({ kind: 'idle' })
  const [log, setLog] = useState('')
  const [chatWidth, setChatWidth] = useState(440)
  const dragging = useRef(false)
  // When a launch fails we remember the folder so the user can retry with a
  // custom command (monorepos, non-standard dev scripts).
  const [retry, setRetry] = useState<{ root: string; command: string } | null>(null)

  const { selectMode, setSelectMode, setSelected } = useSelection()
  const authNeeded = useSession((s) => s.authNeeded)
  const setAuthNeeded = useSession((s) => s.setAuthNeeded)

  useEffect(() => window.api.devServer.onLog(setLog), [])

  // Capture the SDK's advertised slash commands for the "/" menu, and drive the
  // first-run onboarding banner: raise it on an auth failure, and clear it the
  // moment the agent makes progress (the user fixed auth and a turn is flowing).
  useEffect(
    () =>
      window.api.agent.onEvent((event) => {
        const session = useSession.getState()
        if (event.type === 'commands') {
          session.setSlashCommands(event.commands)
        } else if (event.type === 'error' && isAuthError(event.message)) {
          session.setAuthNeeded(true)
        } else if (event.type === 'delta' || event.type === 'done') {
          if (session.authNeeded) session.setAuthNeeded(false)
        } else if (event.type === 'permission-request') {
          usePermissions.getState().addRequest(event.request)
        } else if (event.type === 'permission-resolved') {
          usePermissions.getState().removeRequest(event.id)
        }
      }),
    []
  )

  // v2: receive element picks / cancellations from the preview overlay. Escape
  // cancels the mode *and* clears the pick, matching the toggle-off behaviour.
  useEffect(() => {
    const offPicked = window.api.preview.onElementPicked((el) => setSelected(el))
    const offCancel = window.api.preview.onSelectCancelled(() => {
      setSelectMode(false)
      setSelected(null)
    })
    return () => {
      offPicked()
      offCancel()
    }
  }, [setSelected, setSelectMode])

  // Drag-to-resize the split. The native preview is hidden while dragging.
  useEffect(() => {
    const onMove = (e: MouseEvent): void => {
      if (!dragging.current) return
      setChatWidth(Math.min(MAX_CHAT_WIDTH, Math.max(MIN_CHAT_WIDTH, e.clientX)))
    }
    const endDrag = (): void => {
      if (!dragging.current) return
      dragging.current = false
      document.body.classList.remove('is-resizing')
      window.api.preview.setDragging(false)
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', endDrag)
    // Recover if the terminal mouseup is lost (focus steal, cmd-tab, etc.).
    window.addEventListener('blur', endDrag)
    document.addEventListener('visibilitychange', endDrag)
    return () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', endDrag)
      window.removeEventListener('blur', endDrag)
      document.removeEventListener('visibilitychange', endDrag)
    }
  }, [])

  const startResize = (e: React.MouseEvent): void => {
    e.preventDefault()
    dragging.current = true
    document.body.classList.add('is-resizing')
    window.api.preview.setDragging(true)
  }

  const attempt = async (root: string, commandOverride?: string): Promise<void> => {
    let attemptedCommand = commandOverride ?? ''
    // Opening (or re-opening) a project starts fresh: a pick from the previous
    // repo points at a file that may not exist in the new one. Disarm + clear,
    // and drop any permission cards left over from the previous session.
    setSelectMode(false)
    setSelected(null)
    usePermissions.getState().clearPending()
    useSession.getState().setProjectRoot(null)
    void window.api.preview.setSelectMode(false)
    try {
      setLog('')
      setRetry(null)
      setStatus({
        kind: 'busy',
        label: commandOverride ? `Starting ${commandOverride}…` : 'Detecting project…'
      })
      let command = commandOverride
      let name = root.split('/').filter(Boolean).pop() ?? root
      if (!command) {
        const project = await window.api.project.detect(root)
        command = project.devCommand
        name = project.name
        attemptedCommand = command
        setStatus({ kind: 'busy', label: `Starting ${command}…` })
      }
      const { url } = await window.api.devServer.start({ root, command })
      await window.api.preview.load(url)
      await window.api.agent.openProject(root, {
        ...toAgentOptions(useSession.getState()),
        permissionMode: usePermissions.getState().mode
      })
      useSession.getState().setProjectRoot(root)
      // A fresh session — clear any turn left "running" from a previous project.
      useChat.getState().finish()
      setStatus({ kind: 'running', name, url })
    } catch (err) {
      await window.api.preview.reset()
      setRetry({ root, command: attemptedCommand })
      setStatus({ kind: 'error', message: err instanceof Error ? err.message : String(err) })
    }
  }

  const openProject = async (): Promise<void> => {
    const root = await window.api.project.pick()
    if (root) await attempt(root)
  }

  const toggleSelect = (): void => {
    const next = !selectMode
    setSelectMode(next)
    void window.api.preview.setSelectMode(next)
    if (!next) setSelected(null)
  }

  // Clear selection (rects/source go stale) but leave select mode — main
  // re-arms the overlay once the reloaded page finishes loading.
  const reload = (): void => {
    if (status.kind === 'running') {
      setSelected(null)
      void window.api.preview.load(status.url)
    }
  }

  const stop = async (): Promise<void> => {
    setSelectMode(false)
    setSelected(null)
    useSession.getState().setProjectRoot(null)
    void window.api.preview.setSelectMode(false)
    await window.api.devServer.stop()
    await window.api.preview.reset()
    setRetry(null)
    setStatus({ kind: 'idle' })
  }

  const hint =
    status.kind === 'idle'
      ? 'no project open'
      : status.kind === 'busy'
        ? status.label
        : status.kind === 'running'
          ? `${status.name} · ${status.url}`
          : 'failed to start'

  return (
    <div className="app">
      <header className="titlebar">
        <span className="titlebar__brand">dsgn</span>
        <span className="titlebar__hint">{hint}</span>
        <div className="titlebar__actions">
          {status.kind === 'running' && (
            <>
              <button
                className={`btn ${selectMode ? 'btn--active' : 'btn--ghost'}`}
                onClick={toggleSelect}
                aria-pressed={selectMode}
                title="Click an element in the preview to edit it"
              >
                {selectMode ? 'Selecting…' : 'Select'}
              </button>
              <button className="btn btn--ghost" onClick={reload}>
                Reload
              </button>
              <button className="btn btn--ghost" onClick={stop}>
                Stop
              </button>
            </>
          )}
          <button className="btn" onClick={openProject} disabled={status.kind === 'busy'}>
            {status.kind === 'running' ? 'Open another…' : 'Open project…'}
          </button>
        </div>
      </header>

      {authNeeded && (
        <div className="banner banner--auth">
          <span className="banner__text">
            dsgn couldn’t reach Claude. Each teammate authenticates with their own
            subscription — run <code>claude setup-token</code> (or <code>claude login</code>) in a
            terminal, then reopen the project.
          </span>
          <button className="banner__close" onClick={() => setAuthNeeded(false)} aria-label="Dismiss">
            ✕
          </button>
        </div>
      )}

      {status.kind === 'busy' && log && <div className="banner banner--info">{log}</div>}
      {status.kind === 'error' && (
        <div className="banner banner--error">
          <span className="banner__text">{status.message}</span>
          {retry && (
            <form
              className="banner__retry"
              onSubmit={(e) => {
                e.preventDefault()
                const cmd = String(new FormData(e.currentTarget).get('cmd') ?? '').trim()
                if (cmd) void attempt(retry.root, cmd)
              }}
            >
              <input
                name="cmd"
                className="banner__input"
                defaultValue={retry.command}
                placeholder="custom command, e.g. bun run dev:web"
                spellCheck={false}
              />
              <button className="btn" type="submit">
                Run
              </button>
            </form>
          )}
          <button
            className="banner__close"
            onClick={() => {
              setStatus({ kind: 'idle' })
              setRetry(null)
            }}
          >
            ✕
          </button>
        </div>
      )}

      <div className="panes">
        <section className="pane pane--chat" style={{ width: chatWidth }}>
          <ChatPanel />
        </section>
        <div
          className="divider"
          onMouseDown={startResize}
          role="separator"
          aria-orientation="vertical"
        />
        <section className="pane pane--preview">
          <PreviewPane />
        </section>
      </div>
    </div>
  )
}
