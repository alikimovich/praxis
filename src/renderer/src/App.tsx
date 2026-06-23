import { useEffect, useState } from 'react'
import ChatPanel from './components/ChatPanel'
import PreviewPane from './components/PreviewPane'
import { toAgentOptions, useSession } from './store'

type Status =
  | { kind: 'idle' }
  | { kind: 'busy'; label: string }
  | { kind: 'running'; name: string; url: string }
  | { kind: 'error'; message: string }

export default function App(): React.JSX.Element {
  const [status, setStatus] = useState<Status>({ kind: 'idle' })
  const [log, setLog] = useState('')
  // When a launch fails we remember the folder so the user can retry with a
  // custom command (monorepos, non-standard dev scripts).
  const [retry, setRetry] = useState<{ root: string; command: string } | null>(null)

  useEffect(() => window.api.devServer.onLog(setLog), [])

  // Capture the SDK's advertised slash commands for the "/" menu.
  useEffect(
    () =>
      window.api.agent.onEvent((event) => {
        if (event.type === 'commands') useSession.getState().setSlashCommands(event.commands)
      }),
    []
  )

  const attempt = async (root: string, commandOverride?: string): Promise<void> => {
    let attemptedCommand = commandOverride ?? ''
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
      await window.api.agent.openProject(root, toAgentOptions(useSession.getState()))
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

  const reload = (): void => {
    if (status.kind === 'running') void window.api.preview.load(status.url)
  }

  const stop = async (): Promise<void> => {
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
        <section className="pane pane--chat">
          <ChatPanel />
        </section>
        <section className="pane pane--preview">
          <PreviewPane />
        </section>
      </div>
    </div>
  )
}
