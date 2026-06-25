import { useEffect, useRef, useState } from 'react'
import ChatPanel from './components/ChatPanel'
import ConsolePanel from './components/ConsolePanel'
import PreviewPane from './components/PreviewPane'
import PropPanel from './components/PropPanel'
import {
  isAuthError,
  toAgentOptions,
  useAnnotations,
  useChat,
  useComposer,
  useLog,
  usePermissions,
  useSelection,
  useSession,
  useSetup,
  useTokens
} from './store'
import type { Framework } from '../../shared/api'

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
  // How to relaunch the current preview (root + resolved dev command + framework),
  // so we can restart the dev server after a setup turn edits the build config.
  const launchSpec = useRef<{ root: string; command: string; framework?: Framework } | null>(null)

  const { selectMode, setSelectMode, setSelected } = useSelection()
  const selected = useSelection((s) => s.selected)
  const inspection = useSelection((s) => s.inspection)
  const projectRoot = useSession((s) => s.projectRoot)
  const authNeeded = useSession((s) => s.authNeeded)
  const setAuthNeeded = useSession((s) => s.setAuthNeeded)
  const logOpen = useLog((s) => s.open)
  const logCount = useLog((s) => s.lines.length)

  useEffect(
    () =>
      window.api.devServer.onLog((line) => {
        setLog(line)
        useLog.getState().append(line, 'server')
      }),
    []
  )

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

  // Inspect the selected element's props (decides panel vs prompt-only). Guarded
  // against a fast re-select racing a slow inspect.
  useEffect(() => {
    const sel = useSelection.getState()
    if (!selected?.source || !projectRoot) {
      sel.setInspection(null)
      return
    }
    let live = true
    sel.setInspecting(true)
    const src = selected.source
    window.api.props
      .inspect(projectRoot, src)
      .then((res) => {
        // Only apply if this is still the selected element.
        if (live && useSelection.getState().selected?.source === src) sel.setInspection(res)
      })
      .finally(() => live && useSelection.getState().setInspecting(false))
    return () => {
      live = false
    }
  }, [selected, projectRoot])

  // On-open readiness: if the previewed app has no source stamps, offer setup.
  // When `verifying` is armed (a setup was just applied + the preview reloaded),
  // this report is the proof the instrumentation actually fired — don't report
  // silent success: zero stamps after a setup is a hard warning (fix #4).
  useEffect(
    () =>
      window.api.preview.onReadiness(({ stamps }) => {
        const s = useSetup.getState()
        if (s.verifying) {
          if (stamps > 0) {
            s.setStatus(`Setup verified — ${stamps} element(s) now mapped to source. You're ready.`)
            s.setNeeded(false)
          } else {
            s.setStatus(
              'Setup ran but no elements got stamped — the instrumentation did not fire. ' +
                'Check that the config wiring landed (and the dev server restarted), or ask me to look.'
            )
          }
          s.setVerifying(false)
          return
        }
        if (stamps === 0 && !s.dismissed && !s.busy) s.setNeeded(true)
        else if (stamps > 0) s.setNeeded(false)
      }),
    []
  )

  // The setup turn finished → restart the dev server + reload the preview so the
  // freshly-wired config applies (one-shot: consume the signal, then restart).
  const restartRequested = useSetup((s) => s.restartRequested)
  useEffect(() => {
    if (!restartRequested) return
    useSetup.getState().setRestartRequested(false)
    void restartPreview()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [restartRequested])

  // Inline text edits committed in the preview → write to source (or hand
  // expression/mixed content to the agent).
  useEffect(
    () =>
      window.api.preview.onTextEdit((edit) => {
        const root = useSession.getState().projectRoot
        if (!root) return
        const toAgent = (): void =>
          useComposer.getState().setSeed(`In ${edit.source}, set the element's text to “${edit.text}”.`)
        // A non-literal change (needsAgent) OR a write failure both route to the
        // agent so the user's edit is never silently dropped.
        void window.api.text
          .apply(root, edit)
          .then((res) => {
            if (!res.applied) toAgent()
          })
          .catch(toAgent)
      }),
    []
  )

  // v3: clicking an annotation pin in the preview focuses its note.
  useEffect(
    () => window.api.annotations.onPinClick((id) => useAnnotations.getState().setFocused(id)),
    []
  )

  // Keep the preview's pins in sync with the notes.
  const notes = useAnnotations((s) => s.list)
  useEffect(() => {
    window.api.preview.setAnnotations(notes.map((n) => ({ id: n.id, selector: n.selector })))
  }, [notes])

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
    useAnnotations.getState().setList([])
    useAnnotations.getState().setFocused(null)
    useTokens.getState().setSet(null)
    useSetup.getState().reset()
    void window.api.preview.setSelectMode(false)
    window.api.preview.setPanelInset(0)
    const log = useLog.getState()
    log.clear()
    log.append(`Opening ${root}`)
    try {
      setLog('')
      setRetry(null)
      setStatus({
        kind: 'busy',
        label: commandOverride ? `Starting ${commandOverride}…` : 'Detecting project…'
      })
      let command = commandOverride
      let name = root.split('/').filter(Boolean).pop() ?? root
      let framework: Framework | undefined
      if (!command) {
        log.append('Detecting framework + package manager…')
        const project = await window.api.project.detect(root)
        command = project.devCommand
        name = project.name
        framework = project.framework
        attemptedCommand = command
        log.append(`Detected ${project.framework} · ${project.packageManager} · "${command}"`)
        setStatus({ kind: 'busy', label: `Starting ${command}…` })
      } else {
        log.append(`Using custom command "${command}"`)
      }
      // Remember how to relaunch so a post-setup restart can reuse it. Only when
      // we own the server (a fresh spawn) — never tear down a user-run one.
      const server = await window.api.devServer.start({ root, command, framework })
      launchSpec.current = server.attached ? null : { root, command, framework }
      log.append(
        server.attached ? `Attached to running server at ${server.url}` : `Dev server at ${server.url}`,
        'success'
      )
      await window.api.preview.load(server.url)
      log.append('Preview loaded')
      const url = server.url
      await window.api.agent.openProject(root, {
        ...toAgentOptions(useSession.getState()),
        permissionMode: usePermissions.getState().mode
      })
      log.append(`Agent session started (cwd ${root})`)
      useSession.getState().setProjectRoot(root)
      // Detect this repo's design tokens (manifest → tailwind → CSS vars).
      // Guard against a project switch racing a slow scan — only apply if `root`
      // is still the open project when it resolves.
      void window.api.tokens.detect(root).then((t) => {
        if (useSession.getState().projectRoot === root) useTokens.getState().setSet(t)
      })
      // Load this repo's existing handoff notes (renders pins via the effect above).
      useAnnotations.getState().setList(await window.api.annotations.list(root))
      // A fresh session — clear any turn left "running" from a previous project.
      useChat.getState().finish()
      log.append(`Ready — ${name}`, 'success')
      setStatus({ kind: 'running', name, url })
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      launchSpec.current = null
      await window.api.preview.reset()
      setRetry({ root, command: attemptedCommand })
      log.append(message, 'error')
      setStatus({ kind: 'error', message })
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

  // Restart the dev server and reload the preview — used after a setup turn edits
  // the build config (Vite/SvelteKit read it only at boot, so a page reload alone
  // won't apply the new source-stamping plugin). The post-restart readiness report
  // is what verifies the stamps actually fired (see the readiness effect).
  const restartPreview = async (): Promise<void> => {
    const spec = launchSpec.current
    if (!spec) {
      // We don't own this server (attached to one the user already had running) —
      // we can't restart it, and a page reload won't apply a config change. Be
      // honest rather than emitting a false "no stamps" verdict.
      useSetup.getState().setVerifying(false)
      useSetup
        .getState()
        .setStatus(
          'Setup wired the config, but dsgn is attached to your own dev server — restart it to apply the change.'
        )
      return
    }
    const root = spec.root
    const name = root.split('/').filter(Boolean).pop() ?? root
    // If the user opened a different project, that flow owns the server + status now.
    const switched = (): boolean => useSession.getState().projectRoot !== root
    const log = useLog.getState()
    if (switched()) return
    setSelected(null)
    setStatus({ kind: 'busy', label: 'Restarting preview…' })
    log.append('Restarting dev server to apply the new config…')
    try {
      await window.api.devServer.stop()
      if (switched()) return
      const server = await window.api.devServer.start(spec)
      if (switched()) return
      await window.api.preview.load(server.url)
      log.append(`Preview restarted at ${server.url}`, 'success')
      setStatus({ kind: 'running', name, url: server.url })
    } catch (err) {
      if (switched()) return
      // A broken config edit can fail the relaunch — surface it and disarm the
      // verification so it doesn't hang waiting for a readiness that won't come.
      const message = err instanceof Error ? err.message : String(err)
      useSetup.getState().setVerifying(false)
      useSetup.getState().setStatus(`Couldn't restart the preview after setup: ${message}`)
      log.append(message, 'error')
      await window.api.preview.reset()
      setStatus({ kind: 'error', message })
    }
  }

  const stop = async (): Promise<void> => {
    setSelectMode(false)
    setSelected(null)
    useSession.getState().setProjectRoot(null)
    useAnnotations.getState().setList([])
    useAnnotations.getState().setFocused(null)
    useTokens.getState().setSet(null)
    useSetup.getState().reset()
    void window.api.preview.setSelectMode(false)
    window.api.preview.setPanelInset(0)
    launchSpec.current = null
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
          <button
            className={`btn ${logOpen ? 'btn--active' : 'btn--ghost'}`}
            onClick={() => useLog.getState().setOpen(!logOpen)}
            aria-pressed={logOpen}
            title="Show what dsgn is doing"
          >
            Logs{logCount ? ` (${logCount})` : ''}
          </button>
          <button
            className="btn btn--open"
            onClick={openProject}
            disabled={status.kind === 'busy'}
          >
            {status.kind === 'running' ? 'Open another…' : 'Open project…'}
          </button>
        </div>
      </header>

      {logOpen && <ConsolePanel />}

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

      {/* Floating prop panel — only for dsgn-ready components (schema resolved). */}
      {selected && projectRoot && inspection?.hasSchema && (
        <PropPanel
          root={projectRoot}
          inspection={inspection}
          onChange={(next) => useSelection.getState().setInspection(next)}
          onSeedPrompt={(t) => useComposer.getState().setSeed(t)}
          onClose={() => setSelected(null)}
        />
      )}
    </div>
  )
}
