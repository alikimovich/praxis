export interface NativeSheetField {
  id: string
  label: string
  kind: 'text' | 'multiline' | 'secure' | 'choice' | 'multichoice'
  value: string
  choices?: { value: string; label: string }[]
}
export interface NativeSheetState {
  id: string
  title: string
  detail: string
  fields: NativeSheetField[]
  actions: { id: string; label: string; primary?: boolean }[]
  busy: boolean
  message?: string
}
export interface NativeSheetAction { id: string; action: string; values: Record<string, string> }

export interface NativeSheetsBridge { open(kind: 'new-project' | 'memory' | 'settings', key?: string): void }
declare global { interface Window { praxisNativeSheets?: NativeSheetsBridge } }
