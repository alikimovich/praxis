import { useEffect, useState } from 'react'
import ChatPanel from './components/ChatPanel'
import PreviewPane from './components/PreviewPane'

type Status =
  | { kind: 'idle' }
  | { kind: 'busy'; label: string }
  | { kind: 'running'; name: string; url: string }
  | { kind: 'error'; message: string }

export default function App(): React.JSX.Element {
  const [status, setStatus] = useState<Status>({ kind: 'idle' })
  const [log, setLog] = useState('')

  useEffect(() => window.api.devServer.onLog((line) => setLog(line)), [])

  const openProject = async (): Promise<void> => {
    try {
      const root = await window.api.project.pick()
      if (!root) return
      setLog('')
      setStatus({ kind: 'busy', label: 'Detecting project…' })
      const project = await window.api.project.detect(root)
      setStatus({ kind: 'busy', label: `Starting ${project.devCommand}…` })
      const { url } = await window.api.devServer.start({
        root: project.root,
        command: project.devCommand
      })
      await window.api.preview.load(url)
      await window.api.agent.openProject(project.root)
      setStatus({ kind: 'running', name: project.name, url })
    } catch (err) {
      await window.api.preview.reset()
      setStatus({ kind: 'error', message: err instanceof Error ? err.message : String(err) })
    }
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
          <button className="btn" onClick={openProject} disabled={status.kind === 'busy'}>
            {status.kind === 'running' ? 'Open another…' : 'Open project…'}
          </button>
        </div>
      </header>

      {status.kind === 'busy' && log && <div className="banner banner--info">{log}</div>}
      {status.kind === 'error' && (
        <div className="banner banner--error">
          <span className="banner__text">{status.message}</span>
          <button className="banner__close" onClick={() => setStatus({ kind: 'idle' })}>
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
