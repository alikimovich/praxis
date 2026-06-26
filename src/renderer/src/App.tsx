import { useEffect, useRef, useState } from 'react'
import ChatPanel from './components/ChatPanel'
import ConsolePanel from './components/ConsolePanel'
import DiagnoseCard from './components/DiagnoseCard'
import PreviewPane from './components/PreviewPane'
import PropPanel from './components/PropPanel'
import {
  describeSelectionForPrompt,
  isAuthError,
  oneLine,
  toAgentOptions,
  useAnnotations,
  useChat,
  useComposer,
  useDiagnosis,
  useLog,
  usePermissions,
  useSelection,
  useSession,
  useSetup,
  useTokens,
  useWorkspace,
  type ProjectEntry
} from './store'
import { projectKey } from '../../shared/projectKey'
import Rail from './components/Rail'
import type { CommentMode, Framework, PreviewComment, PreviewKind } from '../../shared/api'

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
  // The project a pending diagnosis belongs to (projectRoot is cleared on failure).
  const diagRoot = useRef<string | null>(null)
  // When a launch fails we remember the folder so the user can retry with a
  // custom command (monorepos, non-standard dev scripts).
  const [retry, setRetry] = useState<{ root: string; command: string } | null>(null)
  // How to relaunch the current preview (root + resolved dev command + framework
  // + previewKind), so we can restart the right backend after a setup/config turn.
  const launchSpec = useRef<{
    root: string
    command: string
    framework?: Framework
    previewKind: PreviewKind
  } | null>(null)
  // Web dev server vs iOS Simulator — drives which affordances show (e.g. Select).
  const [previewKind, setPreviewKind] = useState<PreviewKind>('web')

  const { selectMode, setSelectMode, setSelected, setCommentMode } = useSelection()
  const commentMode = useSelection((s) => s.commentMode)
  const selected = useSelection((s) => s.selected)
  const inspection = useSelection((s) => s.inspection)
  const projectRoot = useSession((s) => s.projectRoot)
  const branch = useSession((s) => s.branch)
  const [editingBranch, setEditingBranch] = useState(false)
  const authNeeded = useSession((s) => s.authNeeded)
  const setAuthNeeded = useSession((s) => s.setAuthNeeded)
  const logOpen = useLog((s) => s.open)
  const logCount = useLog((s) => s.lines.length)

  // Rename / switch the working branch (name is coerced to dsgn/<…> in main).
  const changeBranch = async (name: string): Promise<void> => {
    setEditingBranch(false)
    const root = useSession.getState().projectRoot
    if (!root || !name.trim() || name.trim() === branch) return
    const res = await window.api.git.set(root, name.trim())
    useSession.getState().setBranch(res.branch)
    // Keep the workspace entry's branch current for rail switch-back.
    useWorkspace.getState().patchEntry(projectKey(root), { branch: res.branch })
    if (res.branch) {
      useLog
        .getState()
        .append(`Switched to branch ${res.branch}${res.created ? ' (created)' : ''}`, 'success')
    }
    if (res.error) useLog.getState().append(`Couldn't switch branch: ${res.error}`, 'error')
  }

  useEffect(
    () =>
      window.api.devServer.onLog((line) => {
        setLog(line)
        useLog.getState().append(line, 'server')
      }),
    []
  )

  // Simulator lifecycle logs (boot / Metro / app launch) → same activity console.
  useEffect(
    () =>
      window.api.simulator.onLog((line) => {
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

  // Inline comment (C) / annotation (Y) modes. Mirror keyboard-initiated mode
  // changes from the preview into the toolbar, and route a submitted comment to
  // the agent (C) or to an annotation pin (Y).
  useEffect(() => {
    const offMode = window.api.preview.onCommentMode((m) =>
      useSelection.getState().setCommentMode(m)
    )
    const offComment = window.api.preview.onComment((c: PreviewComment) => {
      if (c.kind === 'comment') {
        // The element ref is page-derived (sanitized in describeSelectionForPrompt);
        // the comment is the user's own text — cap it so it can't bloat the prompt.
        const prompt = describeSelectionForPrompt(c.el) + oneLine(c.text, 2000)
        useComposer.getState().setSubmit(prompt)
      } else {
        const root = useSession.getState().projectRoot
        if (!root) {
          // Near-unreachable (the preview only exists with a project), but don't
          // drop the note silently if the click lands before the session is ready.
          useLog.getState().append(`Open a project before annotating — "${oneLine(c.text, 80)}"`, 'error')
          return
        }
        void window.api.annotations
          .add(root, {
            source: c.el.source,
            selector: c.el.selector,
            tag: c.el.tag,
            text: c.text
          })
          .then((list) => useAnnotations.getState().setList(list))
      }
    })
    return () => {
      offMode()
      offComment()
    }
  }, [])

  // Global C/Y/Escape shortcuts when focus is on the app side (the preview's own
  // preload handles them when the preview is focused). Ignored while typing.
  useEffect(() => {
    const arm = (mode: 'comment' | 'annotate' | null): void => {
      useSelection.getState().setCommentMode(mode)
      if (mode) useSelection.getState().setSelected(null)
      void window.api.preview.setCommentMode(mode)
    }
    const onKey = (e: KeyboardEvent): void => {
      if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.altKey) return
      const t = e.target as HTMLElement | null
      const tag = t?.tagName?.toLowerCase()
      if (tag === 'input' || tag === 'textarea' || tag === 'select' || t?.isContentEditable) return
      const cur = useSelection.getState().commentMode
      if (e.key === 'c' || e.key === 'C') {
        e.preventDefault()
        arm(cur === 'comment' ? null : 'comment')
      } else if (e.key === 'y' || e.key === 'Y') {
        e.preventDefault()
        arm(cur === 'annotate' ? null : 'annotate')
      } else if (e.key === 'Escape' && cur) {
        e.preventDefault()
        arm(null)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

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

  // Propose-first: on a failure, recall a cached fix or ask the AI, then show a card.
  const proposeFix = (root: string, error: string, context: string): void => {
    diagRoot.current = root
    const d = useDiagnosis.getState()
    d.setCurrent(null)
    d.setBusy(true)
    void window.api.diagnose
      .run(root, error, context)
      .then((res) => d.setCurrent(res))
      .catch(() => d.setCurrent(null))
      .finally(() => d.setBusy(false))
  }

  // "Apply repo fix" hands the repo-scoped steps to the chat agent (the user
  // reviews + sends), and records the choice in the per-machine memory.
  const applyFix = (): void => {
    const diag = useDiagnosis.getState().current
    if (!diag) return
    const repo = diag.steps.filter((s) => s.scope === 'repo')
    if (repo.length) {
      useComposer
        .getState()
        .setSeed(
          `Fix this so the project runs: ${diag.summary}\n` +
            repo.map((s) => `- ${s.text}${s.command ? ` (e.g. \`${s.command}\`)` : ''}`).join('\n')
        )
    }
    if (diagRoot.current)
      void window.api.diagnose.record(diagRoot.current, diag.signature, 'applied')
    useDiagnosis.getState().setCurrent(null)
  }

  const dismissFix = (): void => {
    const diag = useDiagnosis.getState().current
    if (diag && diagRoot.current)
      void window.api.diagnose.record(diagRoot.current, diag.signature, 'dismissed')
    useDiagnosis.getState().setCurrent(null)
  }

  const attempt = async (
    root: string,
    commandOverride?: string,
    keepWarm = false
  ): Promise<void> => {
    let attemptedCommand = commandOverride ?? ''
    // The previously-open project (if any) — captured before the reset clears it.
    // Opening another project tears the previous down UNLESS keepWarm (the rail's
    // "+", which keeps it running for a fast switch). Reopening the SAME project
    // (retry) is handled by start(). The backend is multi-capable (v5-A/B).
    const prevRoot = useSession.getState().projectRoot
    const switching = !!prevRoot && projectKey(prevRoot) !== projectKey(root)
    const tearDownPrev = switching && !keepWarm
    // (Keeping the previous project warm needs no snapshot here — its entry is kept
    // current as its url/branch change: open, restart, and branch-rename all patch it.)
    // Opening (or re-opening) a project starts fresh: a pick from the previous
    // repo points at a file that may not exist in the new one. Disarm + clear,
    // and drop any permission cards left over from the previous session.
    setSelectMode(false)
    setSelected(null)
    usePermissions.getState().clearPending()
    useSession.getState().setProjectRoot(null)
    useSession.getState().setBranch(null)
    useDiagnosis.getState().setCurrent(null)
    useAnnotations.getState().setList([])
    useAnnotations.getState().setFocused(null)
    useTokens.getState().reset()
    useSetup.getState().reset()
    // Drop the previous project from the workspace unless we're keeping it warm.
    if (tearDownPrev) useWorkspace.getState().close(projectKey(prevRoot))
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
      // A custom command is assumed to be a web dev command; only auto-detection
      // can route a project to the simulator path.
      let kind: PreviewKind = 'web'
      if (!command) {
        log.append('Detecting framework + package manager…')
        const project = await window.api.project.detect(root)
        command = project.devCommand
        name = project.name
        framework = project.framework
        kind = project.previewKind
        attemptedCommand = command
        log.append(
          `Detected ${project.framework} · ${project.packageManager} · ${project.previewKind} · "${command}"`
        )
        setStatus({ kind: 'busy', label: `Starting ${command}…` })
      } else {
        log.append(`Using custom command "${command}"`)
      }

      // Single-active: stop the previously-open project's dev server before
      // starting this one (multi-instance backend; the rail will keep them warm).
      if (tearDownPrev) {
        await window.api.devServer.stop(prevRoot)
        void window.api.agent.closeProject(prevRoot)
        useChat.getState().clearChat(projectKey(prevRoot))
      }

      // Do dsgn's work on a dsgn/* branch so the user's main branch stays clean.
      try {
        const b = await window.api.git.ensure(root)
        useSession.getState().setBranch(b.branch)
        if (b.isRepo && b.branch) {
          log.append(`Working on branch ${b.branch}${b.created ? ' (created)' : ''}`, 'success')
        } else if (!b.isRepo) {
          log.append('Not a git repo — branch management off.')
        }
        if (b.error) log.append(`Couldn't switch branch: ${b.error}`, 'error')
      } catch {
        /* non-fatal — keep opening */
      }

      setPreviewKind(kind)

      let url: string
      if (kind === 'simulator') {
        // iOS Simulator path (React Native / Expo). Preflight first so a non-Mac
        // or missing-Xcode host gets a clear card, not a crash.
        log.append('Checking simulator prerequisites…')
        const pf = await window.api.simulator.preflight()
        if (!pf.ok) throw new Error(pf.reason ?? 'Simulator preview is unavailable on this machine.')
        log.append(`Simulator available — ${pf.devices.length} device(s)`, 'success')
        setStatus({ kind: 'busy', label: 'Booting simulator…' })
        // Ignore the detected `expo start` for the auto path — `simulator.start`
        // defaults to `expo run:ios` (build + install + launch + serve).
        const sim = await window.api.simulator.start({ root, command: commandOverride })
        launchSpec.current = { root, command: commandOverride ?? '', framework, previewKind: kind }
        log.append(`Simulator preview at ${sim.url}`, 'success')
        url = sim.url
      } else {
        await window.api.simulator.stop() // tear down any simulator from a prior project
        // Remember how to relaunch so a post-setup restart can reuse it. Only when
        // we own the server (a fresh spawn) — never tear down a user-run one.
        const server = await window.api.devServer.start({ root, command, framework })
        launchSpec.current = server.attached
          ? null
          : { root, command, framework, previewKind: kind }
        log.append(
          server.attached
            ? `Attached to running server at ${server.url}`
            : `Dev server at ${server.url}`,
          'success'
        )
        url = server.url
      }
      await window.api.preview.load(url)
      log.append('Preview loaded')
      await window.api.agent.openProject(root, {
        ...toAgentOptions(useSession.getState()),
        permissionMode: usePermissions.getState().mode
      })
      log.append(`Agent session started (cwd ${root})`)
      useSession.getState().setProjectRoot(root)
      // v5: track the open project in the workspace + show its (per-project) chat,
      // so agent events tagged with this project route to the visible chat.
      useWorkspace.getState().openOrActivate(root, { name })
      // Start this project's chat fresh — clear any slice a trailing event from a
      // prior session may have resurrected, then show it.
      useChat.getState().clearChat(projectKey(root))
      useChat.getState().setActiveChat(projectKey(root))
      // Detect this repo's design tokens (manifest → tailwind → CSS vars).
      // Guard against a project switch racing a slow scan — only apply if `root`
      // is still the open project when it resolves. When the repo exposes no
      // tokens at all, offer to scaffold a starter `.dsgn/tokens.json`.
      void window.api.tokens.detect(root).then((t) => {
        if (useSession.getState().projectRoot !== root) return
        const tk = useTokens.getState()
        tk.setSet(t)
        if (t.source === 'none' && !tk.offerDismissed) tk.setOfferNeeded(true)
      })
      // Load this repo's existing handoff notes (renders pins via the effect above).
      useAnnotations.getState().setList(await window.api.annotations.list(root))
      // A fresh session — clear any turn left "running" from a previous project.
      useChat.getState().finish()
      log.append(`Ready — ${name}`, 'success')
      setStatus({ kind: 'running', name, url })
      // Snapshot this project so the rail can switch back to it without a restart.
      useWorkspace.getState().patchEntry(projectKey(root), {
        name,
        url,
        previewKind: kind,
        branch: useSession.getState().branch,
        launchSpec: launchSpec.current
      })
      // Bound warm dev servers (LRU-suspend beyond the cap).
      void evictWarmServers()
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      launchSpec.current = null
      // A later step (agent open, annotations…) can throw after the dev server
      // already started — stop it so it isn't orphaned (the renderer would lose
      // its root once projectRoot/launchSpec are cleared).
      void window.api.devServer.stop(root)
      void window.api.agent.closeProject(root)
      await window.api.preview.reset()
      setRetry({ root, command: attemptedCommand })
      log.append(message, 'error')
      setStatus({ kind: 'error', message })
      proposeFix(root, message, `previewKind=${previewKind}; command=${attemptedCommand}`)
    }
  }

  const openProject = async (): Promise<void> => {
    const root = await window.api.project.pick()
    if (root) await attempt(root)
  }

  // Rail "+": open another project while keeping the current one warm (its dev
  // server + agent session keep running so switching back is instant).
  const openAnother = async (): Promise<void> => {
    const root = await window.api.project.pick()
    if (root) await attempt(root, undefined, true)
  }

  // Make `target` the active project everywhere (preview, chat, agent, toolbar) —
  // no restart, the dev server + session are already warm.
  // Guard: a re-switch (the user clicking another rail item) changed the active
  // project mid-await — stop applying the stale one.
  const stillActive = (root: string): boolean => useSession.getState().projectRoot === root

  const applyProject = async (target: ProjectEntry): Promise<void> => {
    setSelectMode(false)
    setSelected(null)
    void window.api.preview.setSelectMode(false)
    useSetup.getState().reset()
    // Clear the outgoing project's tokens + pins NOW so they don't linger over the
    // new project's preview while we re-derive.
    useTokens.getState().reset()
    useAnnotations.getState().setList([])
    useAnnotations.getState().setFocused(null)
    useWorkspace.getState().activate(target.key)
    useChat.getState().setActiveChat(target.key)
    useSession.getState().setProjectRoot(target.root)
    useSession.getState().setBranch(target.branch)
    setPreviewKind(target.previewKind)
    launchSpec.current = target.launchSpec
    void window.api.agent.setActive(target.root)

    let url = target.url
    // A warm web server can die (crash) or be LRU-suspended — relaunch it before
    // navigating the preview to its now-stale URL (else: dead/blank frame).
    if (target.previewKind !== 'simulator' && target.launchSpec) {
      const alive = await window.api.devServer.isRunning(target.root)
      if (!stillActive(target.root)) return
      if (!alive) {
        setStatus({ kind: 'busy', label: `Restarting ${target.name}…` })
        try {
          const server = await window.api.devServer.start({
            root: target.launchSpec.root,
            command: target.launchSpec.command,
            framework: target.launchSpec.framework
          })
          if (!stillActive(target.root)) return
          url = server.url
          useWorkspace.getState().patchEntry(target.key, { url })
        } catch (err) {
          if (!stillActive(target.root)) return
          setStatus({ kind: 'error', message: err instanceof Error ? err.message : String(err) })
          return
        }
      }
    }
    if (!stillActive(target.root)) return
    if (url) {
      setStatus({ kind: 'running', name: target.name, url })
      await window.api.preview.load(url)
    }
    // Re-derive this project's tokens + annotations (guard against a fast re-switch).
    void window.api.tokens.detect(target.root).then((t) => {
      if (!stillActive(target.root)) return
      useTokens.getState().setSet(t)
      if (t.source === 'none' && !useTokens.getState().offerDismissed) {
        useTokens.getState().setOfferNeeded(true)
      }
    })
    const notes = await window.api.annotations.list(target.root)
    if (stillActive(target.root)) useAnnotations.getState().setList(notes)
  }

  // Rail: switch to an already-open (warm) project. Each project's display state
  // (url / previewKind / branch / launchSpec) is kept current in its entry as it
  // changes (open / restart / branch rename), so no snapshot is needed here.
  const switchTo = async (key: string): Promise<void> => {
    const ws = useWorkspace.getState()
    if (key === ws.activeKey) return
    const target = ws.projects.find((p) => p.key === key)
    if (target) {
      await applyProject(target)
      void evictWarmServers()
    }
  }

  // Rail ×: fully close a project (stop its server + agent, drop it). If it was
  // active, fall through to another open project or go idle.
  const closeProjectFromRail = async (key: string): Promise<void> => {
    const ws = useWorkspace.getState()
    const entry = ws.projects.find((p) => p.key === key)
    if (!entry) return
    const wasActive = ws.activeKey === key
    // Pick the fallback BEFORE close() (which would auto-pick its own activeKey).
    const next = wasActive ? (ws.projects.filter((p) => p.key !== key).at(-1) ?? null) : null
    ws.close(key)
    if (wasActive && !next) {
      // Last project — stop() fully tears it down (server + agent + chat + preview).
      await stop()
      return
    }
    void window.api.devServer.stop(entry.root)
    // Await the close so main disposes the session before we clear its chat — a
    // trailing emit then can't resurrect the cleared slice.
    await window.api.agent.closeProject(entry.root)
    useChat.getState().clearChat(key)
    if (next) await applyProject(next)
  }

  // Bound memory: keep at most N projects' dev servers warm; LRU-suspend the rest
  // (their entry/chat/agent stay — switching back relaunches the server, see
  // applyProject). Decided behavior: warm-to-N + LRU-suspend.
  const MAX_WARM_SERVERS = 3
  const evictWarmServers = async (): Promise<void> => {
    const ws = useWorkspace.getState()
    const byRecency = [...ws.projects].sort((a, b) => b.touchedAt - a.touchedAt)
    for (const p of byRecency.slice(MAX_WARM_SERVERS)) {
      if (p.key === ws.activeKey || p.previewKind === 'simulator') continue
      if (await window.api.devServer.isRunning(p.root)) {
        void window.api.devServer.stop(p.root)
        useLog.getState().append(`Suspended ${p.name} to bound memory (LRU); reloads on return.`)
      }
    }
  }

  const toggleSelect = (): void => {
    const next = !selectMode
    setSelectMode(next)
    void window.api.preview.setSelectMode(next)
    if (!next) setSelected(null)
  }

  // Arm/disarm an inline-comment mode (toggles off if already active). Clears any
  // lingering selection so the left inspector doesn't compete with the composer.
  const armComment = (mode: 'comment' | 'annotate'): void => {
    const next: CommentMode = useSelection.getState().commentMode === mode ? null : mode
    setCommentMode(next)
    if (next) setSelected(null)
    void window.api.preview.setCommentMode(next)
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
    try {
      let url: string
      if (spec.previewKind === 'simulator') {
        log.append('Restarting the simulator to apply the new config…')
        await window.api.simulator.stop()
        if (switched()) return
        const sim = await window.api.simulator.start({
          root: spec.root,
          command: spec.command || undefined
        })
        url = sim.url
      } else {
        log.append('Restarting dev server to apply the new config…')
        await window.api.devServer.stop(spec.root)
        if (switched()) return
        const server = await window.api.devServer.start(spec)
        url = server.url
      }
      if (switched()) return
      await window.api.preview.load(url)
      log.append(`Preview restarted at ${url}`, 'success')
      setStatus({ kind: 'running', name, url })
      // Keep the workspace entry's URL current so a rail switch-back loads the new one.
      useWorkspace.getState().patchEntry(projectKey(spec.root), { url })
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
    const closing = useSession.getState().projectRoot
    if (closing) useWorkspace.getState().close(projectKey(closing))
    useSession.getState().setProjectRoot(null)
    useAnnotations.getState().setList([])
    useAnnotations.getState().setFocused(null)
    useTokens.getState().reset()
    useSetup.getState().reset()
    void window.api.preview.setSelectMode(false)
    window.api.preview.setPanelInset(0)
    const spec = launchSpec.current
    launchSpec.current = null
    if (spec?.previewKind === 'simulator') await window.api.simulator.stop()
    else if (closing) await window.api.devServer.stop(closing)
    if (closing) {
      // Await the close so main has disposed the session before we clear its
      // chat (a trailing emit can't then resurrect the cleared slice).
      await window.api.agent.closeProject(closing)
      useChat.getState().clearChat(projectKey(closing))
    }
    useChat.getState().setActiveChat('')
    await window.api.preview.reset()
    setRetry(null)
    setPreviewKind('web')
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
        {branch &&
          (editingBranch ? (
            <input
              className="branch__input"
              defaultValue={branch}
              autoFocus
              spellCheck={false}
              onBlur={(e) => void changeBranch(e.currentTarget.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void changeBranch(e.currentTarget.value)
                else if (e.key === 'Escape') setEditingBranch(false)
              }}
            />
          ) : (
            <button
              className="branch"
              onClick={() => setEditingBranch(true)}
              title="dsgn works on this branch — click to rename / switch"
            >
              ⎇ {branch}
            </button>
          ))}
        <div className="titlebar__actions">
          {status.kind === 'running' && (
            <>
              {/* Element-select maps clicks → DOM source; not yet wired for the
                  simulator's streamed frame (Phase 3). Hidden in sim mode. */}
              {previewKind !== 'simulator' && (
                <>
                  <button
                    className={`btn ${selectMode ? 'btn--active' : 'btn--ghost'}`}
                    onClick={toggleSelect}
                    aria-pressed={selectMode}
                    title="Click an element in the preview to edit it"
                  >
                    {selectMode ? 'Selecting…' : 'Select'}
                  </button>
                  <button
                    className={`btn ${commentMode === 'comment' ? 'btn--active' : 'btn--ghost'}`}
                    onClick={() => armComment('comment')}
                    aria-pressed={commentMode === 'comment'}
                    title="Comment to the agent on an element (C)"
                  >
                    {commentMode === 'comment' ? 'Commenting…' : 'Comment'}
                  </button>
                  <button
                    className={`btn ${commentMode === 'annotate' ? 'btn--active' : 'btn--ghost'}`}
                    onClick={() => armComment('annotate')}
                    aria-pressed={commentMode === 'annotate'}
                    title="Pin a note on an element, no agent (Y)"
                  >
                    {commentMode === 'annotate' ? 'Annotating…' : 'Annotate'}
                  </button>
                </>
              )}
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

      <DiagnoseCard onApply={applyFix} onDismiss={dismissFix} />

      <div className="panes">
        <Rail
          onSwitch={(key) => void switchTo(key)}
          onClose={(key) => void closeProjectFromRail(key)}
          onOpen={() => void openAnother()}
        />
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
