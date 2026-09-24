/** Optional macOS shell transport. Electron continues to use the React rail. */
export interface NativeShellRow {
  id: string
  title: string
  kind: 'project' | 'chat' | 'history'
  project: string
  session?: string
  record?: string
  running?: boolean
  children?: NativeShellRow[]
}
export interface NativeShellState {
  rows: NativeShellRow[]
  selected: string | null
  project: string | null
  selectMode: boolean
  previewReady: boolean
  chatHidden: boolean
}
export interface NativeShellAction {
  action: 'select' | 'new-chat' | 'close' | 'memory'
  id?: string
  project?: string
}
export interface NativeShellBridge {
  update: (state: NativeShellState) => void
  onAction: (callback: (action: NativeShellAction) => void) => () => void
}
declare global {
  interface Window {
    praxisNativeShell?: NativeShellBridge
  }
}
