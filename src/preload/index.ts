import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron'
import type {
  AgentEvent,
  AgentOptions,
  Annotation,
  AnnotationInput,
  Bounds,
  BranchResult,
  CommentMode,
  Diagnosis,
  DetectedProject,
  DsgnApi,
  Framework,
  PermissionMode,
  PreviewComment,
  PropEdit,
  PropEditResult,
  TokenEdit,
  PropInspection,
  PublishResult,
  RunningDevServer,
  RunningSimulator,
  SelectedElement,
  SessionRecord,
  SetupResult,
  SimPreflight,
  TokenScaffoldResult,
  TokenSet,
  UndoResult
} from '../shared/api'

const api: DsgnApi = {
  preview: {
    setBounds: (bounds: Bounds): void => ipcRenderer.send('preview:set-bounds', bounds),
    load: (url: string): Promise<void> => ipcRenderer.invoke('preview:load', url),
    reset: (): Promise<void> => ipcRenderer.invoke('preview:reset'),
    setDragging: (active: boolean): void => ipcRenderer.send('preview:set-dragging', active),
    setSelectMode: (active: boolean): Promise<void> =>
      ipcRenderer.invoke('preview:set-select-mode', active),
    onElementPicked: (cb: (el: SelectedElement) => void): (() => void) => {
      const listener = (_e: IpcRendererEvent, el: SelectedElement): void => cb(el)
      ipcRenderer.on('preview:element-picked', listener)
      return () => ipcRenderer.removeListener('preview:element-picked', listener)
    },
    onSelectCancelled: (cb: () => void): (() => void) => {
      const listener = (): void => cb()
      ipcRenderer.on('preview:select-cancelled', listener)
      return () => ipcRenderer.removeListener('preview:select-cancelled', listener)
    },
    setAnnotations: (pins: { id: string; selector: string }[]): void =>
      ipcRenderer.send('preview:set-annotations', pins),
    /** Reserve a right-edge strip (px) for the floating prop panel. */
    setPanelInset: (inset: number): void => ipcRenderer.send('preview:set-panel-inset', inset),
    /** Fires after the previewed app loads, with whether it's source-stamped. */
    onReadiness: (cb: (info: { stamps: number }) => void): (() => void) => {
      const listener = (_e: IpcRendererEvent, info: { stamps: number }): void => cb(info)
      ipcRenderer.on('preview:readiness', listener)
      return () => ipcRenderer.removeListener('preview:readiness', listener)
    },
    onTextEdit: (cb: (edit: { source: string; text: string }) => void): (() => void) => {
      const listener = (_e: IpcRendererEvent, edit: { source: string; text: string }): void =>
        cb(edit)
      ipcRenderer.on('preview:text-edit', listener)
      return () => ipcRenderer.removeListener('preview:text-edit', listener)
    },
    setCommentMode: (mode: CommentMode): Promise<void> =>
      ipcRenderer.invoke('preview:set-comment-mode', mode),
    onCommentMode: (cb: (mode: CommentMode) => void): (() => void) => {
      const listener = (_e: IpcRendererEvent, mode: CommentMode): void => cb(mode)
      ipcRenderer.on('preview:comment-mode', listener)
      return () => ipcRenderer.removeListener('preview:comment-mode', listener)
    },
    onComment: (cb: (c: PreviewComment) => void): (() => void) => {
      const listener = (_e: IpcRendererEvent, c: PreviewComment): void => cb(c)
      ipcRenderer.on('preview:comment', listener)
      return () => ipcRenderer.removeListener('preview:comment', listener)
    }
  },
  project: {
    pick: (): Promise<string | null> => ipcRenderer.invoke('project:pick'),
    detect: (root: string): Promise<DetectedProject> => ipcRenderer.invoke('project:detect', root)
  },
  devServer: {
    start: (opts: {
      root: string
      command: string
      framework?: Framework
    }): Promise<RunningDevServer> => ipcRenderer.invoke('devserver:start', opts),
    stop: (root: string): Promise<void> => ipcRenderer.invoke('devserver:stop', root),
    isRunning: (root: string): Promise<boolean> => ipcRenderer.invoke('devserver:running', root),
    onLog: (cb: (line: string) => void): (() => void) => {
      const listener = (_e: IpcRendererEvent, line: string): void => cb(line)
      ipcRenderer.on('devserver:log', listener)
      return () => ipcRenderer.removeListener('devserver:log', listener)
    }
  },
  git: {
    ensure: (root: string): Promise<BranchResult> => ipcRenderer.invoke('git:ensure', root),
    set: (root: string, name: string): Promise<BranchResult> =>
      ipcRenderer.invoke('git:set', root, name)
  },
  diagnose: {
    run: (root: string, error: string, context?: string): Promise<Diagnosis | null> =>
      ipcRenderer.invoke('diagnose:run', root, error, context),
    record: (root: string, signature: string, status: 'applied' | 'dismissed'): Promise<void> =>
      ipcRenderer.invoke('diagnose:record', root, signature, status)
  },
  simulator: {
    preflight: (): Promise<SimPreflight> => ipcRenderer.invoke('simulator:preflight'),
    start: (opts: { root: string; command?: string; udid?: string }): Promise<RunningSimulator> =>
      ipcRenderer.invoke('simulator:start', opts),
    stop: (): Promise<void> => ipcRenderer.invoke('simulator:stop'),
    // Phase 3: arm/disarm element-select (a tap then becomes a source pick).
    setSelectMode: (active: boolean): Promise<void> =>
      ipcRenderer.invoke('simulator:set-select-mode', active),
    onLog: (cb: (line: string) => void): (() => void) => {
      const listener = (_e: IpcRendererEvent, line: string): void => cb(line)
      ipcRenderer.on('simulator:log', listener)
      return () => ipcRenderer.removeListener('simulator:log', listener)
    },
    onElementPicked: (cb: (pick: { source: string; tag: string }) => void): (() => void) => {
      const listener = (_e: IpcRendererEvent, pick: { source: string; tag: string }): void =>
        cb(pick)
      ipcRenderer.on('simulator:element-picked', listener)
      return () => ipcRenderer.removeListener('simulator:element-picked', listener)
    }
  },
  props: {
    inspect: (root: string, source: string): Promise<PropInspection | null> =>
      ipcRenderer.invoke('props:inspect', root, source),
    apply: (root: string, edit: PropEdit): Promise<PropEditResult> =>
      ipcRenderer.invoke('props:apply', root, edit),
    applyToken: (root: string, edit: TokenEdit): Promise<PropEditResult> =>
      ipcRenderer.invoke('props:applyToken', root, edit)
  },
  text: {
    apply: (root: string, edit: { source: string; text: string }): Promise<PropEditResult> =>
      ipcRenderer.invoke('text:apply', root, edit)
  },
  edits: {
    undo: (root: string): Promise<UndoResult> => ipcRenderer.invoke('edit:undo', root),
    redo: (root: string): Promise<UndoResult> => ipcRenderer.invoke('edit:redo', root),
    can: (root: string): Promise<{ undo: boolean; redo: boolean }> =>
      ipcRenderer.invoke('edit:can', root)
  },
  tokens: {
    detect: (root: string): Promise<TokenSet> => ipcRenderer.invoke('tokens:detect', root),
    scaffold: (root: string): Promise<TokenScaffoldResult> =>
      ipcRenderer.invoke('tokens:scaffold', root)
  },
  annotations: {
    list: (root: string): Promise<Annotation[]> => ipcRenderer.invoke('annotations:list', root),
    add: (root: string, input: AnnotationInput): Promise<Annotation[]> =>
      ipcRenderer.invoke('annotations:add', root, input),
    remove: (root: string, id: string): Promise<Annotation[]> =>
      ipcRenderer.invoke('annotations:remove', root, id),
    onPinClick: (cb: (id: string) => void): (() => void) => {
      const listener = (_e: IpcRendererEvent, id: string): void => cb(id)
      ipcRenderer.on('annotations:pin-click', listener)
      return () => ipcRenderer.removeListener('annotations:pin-click', listener)
    }
  },
  publish: {
    toPr: (root: string, opts: { title: string }): Promise<PublishResult> =>
      ipcRenderer.invoke('publish:to-pr', root, opts)
  },
  setup: {
    scaffold: (root: string): Promise<SetupResult> => ipcRenderer.invoke('setup:scaffold', root),
    uninstall: (root: string): Promise<SetupResult> => ipcRenderer.invoke('setup:uninstall', root)
  },
  agent: {
    openProject: (root: string, options?: AgentOptions): Promise<void> =>
      ipcRenderer.invoke('agent:open-project', root, options),
    closeProject: (root: string): Promise<void> =>
      ipcRenderer.invoke('agent:close-project', root),
    setActive: (root: string): Promise<void> => ipcRenderer.invoke('agent:set-active', root),
    isOpen: (root: string): Promise<boolean> => ipcRenderer.invoke('agent:is-open', root),
    send: (text: string): Promise<void> => ipcRenderer.invoke('agent:send', text),
    setModel: (model: string): Promise<void> => ipcRenderer.invoke('agent:set-model', model),
    setPermissionMode: (mode: PermissionMode): Promise<void> =>
      ipcRenderer.invoke('agent:set-permission-mode', mode),
    respondPermission: (id: string, behavior: 'allow' | 'deny'): Promise<void> =>
      ipcRenderer.invoke('agent:respond-permission', id, behavior),
    interrupt: (): Promise<void> => ipcRenderer.invoke('agent:interrupt'),
    tagSession: (root: string, tag: { branch?: string; prUrl?: string }): Promise<void> =>
      ipcRenderer.invoke('agent:tag-session', root, tag),
    onEvent: (cb: (event: AgentEvent) => void): (() => void) => {
      const listener = (_e: IpcRendererEvent, event: AgentEvent): void => cb(event)
      ipcRenderer.on('agent:event', listener)
      return () => ipcRenderer.removeListener('agent:event', listener)
    }
  },
  sessions: {
    list: (root: string): Promise<SessionRecord[]> => ipcRenderer.invoke('sessions:list', root),
    get: (id: string): Promise<SessionRecord | null> => ipcRenderer.invoke('sessions:get', id),
    remove: (id: string): Promise<void> => ipcRenderer.invoke('sessions:remove', id)
  }
}

contextBridge.exposeInMainWorld('api', api)
