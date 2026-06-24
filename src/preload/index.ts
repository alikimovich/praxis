import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron'
import type {
  AgentEvent,
  AgentOptions,
  Annotation,
  AnnotationInput,
  Bounds,
  DetectedProject,
  DsgnApi,
  PermissionMode,
  PropEdit,
  PropEditResult,
  PropInspection,
  PublishResult,
  RunningDevServer,
  SelectedElement,
  SetupResult,
  TokenSet
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
    }
  },
  project: {
    pick: (): Promise<string | null> => ipcRenderer.invoke('project:pick'),
    detect: (root: string): Promise<DetectedProject> => ipcRenderer.invoke('project:detect', root)
  },
  devServer: {
    start: (opts: { root: string; command: string }): Promise<RunningDevServer> =>
      ipcRenderer.invoke('devserver:start', opts),
    stop: (): Promise<void> => ipcRenderer.invoke('devserver:stop'),
    onLog: (cb: (line: string) => void): (() => void) => {
      const listener = (_e: IpcRendererEvent, line: string): void => cb(line)
      ipcRenderer.on('devserver:log', listener)
      return () => ipcRenderer.removeListener('devserver:log', listener)
    }
  },
  props: {
    inspect: (root: string, source: string): Promise<PropInspection | null> =>
      ipcRenderer.invoke('props:inspect', root, source),
    apply: (root: string, edit: PropEdit): Promise<PropEditResult> =>
      ipcRenderer.invoke('props:apply', root, edit)
  },
  tokens: {
    detect: (root: string): Promise<TokenSet> => ipcRenderer.invoke('tokens:detect', root)
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
    scaffold: (root: string): Promise<SetupResult> => ipcRenderer.invoke('setup:scaffold', root)
  },
  agent: {
    openProject: (root: string, options?: AgentOptions): Promise<void> =>
      ipcRenderer.invoke('agent:open-project', root, options),
    send: (text: string): Promise<void> => ipcRenderer.invoke('agent:send', text),
    setModel: (model: string): Promise<void> => ipcRenderer.invoke('agent:set-model', model),
    setPermissionMode: (mode: PermissionMode): Promise<void> =>
      ipcRenderer.invoke('agent:set-permission-mode', mode),
    respondPermission: (id: string, behavior: 'allow' | 'deny'): Promise<void> =>
      ipcRenderer.invoke('agent:respond-permission', id, behavior),
    interrupt: (): Promise<void> => ipcRenderer.invoke('agent:interrupt'),
    onEvent: (cb: (event: AgentEvent) => void): (() => void) => {
      const listener = (_e: IpcRendererEvent, event: AgentEvent): void => cb(event)
      ipcRenderer.on('agent:event', listener)
      return () => ipcRenderer.removeListener('agent:event', listener)
    }
  }
}

contextBridge.exposeInMainWorld('api', api)
