import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron'
import type { AgentEvent, Bounds, DetectedProject, DsgnApi, RunningDevServer } from '../shared/api'

const api: DsgnApi = {
  preview: {
    setBounds: (bounds: Bounds): void => ipcRenderer.send('preview:set-bounds', bounds),
    load: (url: string): Promise<void> => ipcRenderer.invoke('preview:load', url),
    reset: (): Promise<void> => ipcRenderer.invoke('preview:reset')
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
  agent: {
    openProject: (root: string): Promise<void> => ipcRenderer.invoke('agent:open-project', root),
    send: (text: string): Promise<void> => ipcRenderer.invoke('agent:send', text),
    interrupt: (): Promise<void> => ipcRenderer.invoke('agent:interrupt'),
    onEvent: (cb: (event: AgentEvent) => void): (() => void) => {
      const listener = (_e: IpcRendererEvent, event: AgentEvent): void => cb(event)
      ipcRenderer.on('agent:event', listener)
      return () => ipcRenderer.removeListener('agent:event', listener)
    }
  }
}

contextBridge.exposeInMainWorld('api', api)
