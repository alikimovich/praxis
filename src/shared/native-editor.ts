import type { SourceView } from './api'
export interface NativeEditorState {
  root: string; visible: boolean; popped: boolean; files: string[]; source: string
  document: SourceView | null; text: string; revision: number; dirty: boolean
  busy: boolean; error: string; conflict: boolean
}
export type NativeEditorAction = {
  root: string
  action: 'open' | 'edit' | 'save' | 'reload' | 'hide' | 'popout' | 'dock' | 'create' | 'rename' | 'delete' | 'external' | 'component'
  source?: string; text?: string; name?: string; revision?: number
}

declare global { interface Window { praxisNativeEditor?: { open(source: string): void; close(): void } } }
