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
  chatWidth: number
  chatHidden: boolean
  branch: string | null
  branches: string[]
  publishLabel: string
  publishing: boolean
  publishMode: string
  codeOpen: boolean
  previewBase: string | null
  previewURL: string | null
  viewport: string
  deviceEnabled: boolean
}
export interface NativeShellAction {
  action:
    | 'select'
    | 'new-chat'
    | 'close'
    | 'memory'
    | 'branch'
    | 'new-branch'
    | 'git-updates'
    | 'publish'
    | 'publish-mode'
    | 'code'
    | 'layers'
    | 'expand'
    | 'address'
    | 'home'
    | 'device'
    | 'select-object'
  id?: string
  value?: string
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
