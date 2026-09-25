import type { ProjectEntry } from './workspace'
import type { ChatAgentSettings } from './chat-settings'
import type { SessionRecord } from './api'

export type NativeProjectStatus =
  | { kind: 'idle' }
  | { kind: 'setup'; name: string }
  | { kind: 'busy'; label: string }
  | { kind: 'running'; name: string; url: string }
  | { kind: 'error'; message: string }
export interface NativeWorkspaceSnapshot {
  error?: string
  revision: number
  projects: ProjectEntry[]
  activeKey: string | null
  status: NativeProjectStatus
  history: Record<string, SessionRecord[]>
  recents: { root: string; name: string; at: number }[]
}
export type NativeWorkspaceCommand =
  | { type: 'attach'; legacy?: string | null; preferred?: ChatAgentSettings }
  | { type: 'open'; root?: string; command?: string }
  | { type: 'select' | 'close' | 'new-chat'; key: string }
  | { type: 'chat'; key: string; session: string }
  | { type: 'close-chat'; key: string; session: string }
  | { type: 'resume'; key: string; record: string }
  | { type: 'restart'; key: string; command?: string }
export interface NativeWorkspaceBridge {
  command(command: NativeWorkspaceCommand): Promise<void>
  onProjection(callback: (value: { chatHidden: boolean; viewport: string; selectMode: boolean }) => void): () => void
  onState(callback: (state: NativeWorkspaceSnapshot) => void): () => void
}
declare global { interface Window { praxisNativeWorkspace?: NativeWorkspaceBridge } }
