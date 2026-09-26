export interface NativeSheetField {
  id: string
  label: string
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
  busy: boolean
  message?: string
}
export interface NativeSheetAction { id: string; action: string; values: Record<string, string> }

export interface NativeSheetsBridge { open(kind: 'new-project' | 'memory' | 'settings' | 'review' | 'feedback' | 'diagnose', key?: string): void }
declare global { interface Window { praxisNativeSheets?: NativeSheetsBridge } }

declare global { interface Window { praxisNativeActivity?: { append(text: string, kind: string): void; action(action: string): void } } }

declare global { interface Window { praxisNativeGit?: { action(action: 'publish' | 'branch' | 'new-branch' | 'git-updates' | 'connect', value?: string): void } } }
