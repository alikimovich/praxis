export interface NativeSheetField {
  id: string
  label: string
  help?: string
  visibleWhen?: { field: string; value: string }
  kind: 'text' | 'multiline' | 'secure' | 'choice' | 'multichoice' | 'readonly' | 'image'
  value: string
  choices?: { value: string; label: string }[]
}
export interface NativeSheetState {
  id: string
  title: string
  detail: string
  fields: NativeSheetField[]
  actions: { id: string; label: string; primary?: boolean; destructive?: boolean }[]
  autosave?: boolean
  dismissible?: boolean
  busy: boolean
  message?: string
}
export interface NativeSheetAction { id: string; action: string; values: Record<string, string> }

export interface NativeSheetsBridge { open(kind: 'new-project' | 'memory' | 'settings' | 'review' | 'feedback' | 'diagnose', key?: string): void }
declare global { interface Window { treziNativeSheets?: NativeSheetsBridge } }

declare global { interface Window { treziNativeActivity?: { append(text: string, kind: string): void; action(action: string): void } } }

declare global { interface Window { treziNativeGit?: { action(action: 'publish' | 'branch' | 'new-branch' | 'git-updates' | 'connect', value?: string): void } } }
