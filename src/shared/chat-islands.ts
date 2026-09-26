import type { ControlPanelManifest, ControlParam } from './api'

/** Versioned native wire format. Executable code is never part of a spec. */
export type IslandValue = string | number | boolean
export interface IslandBlock {
  id: string
  title: string
  kind: 'group' | 'point'
  params: string[]
}
export interface IslandRecord {
  version: 1
  id: string
  revision: number
  turn: number
  manifest: ControlPanelManifest
  blocks: IslandBlock[]
  engine: 'agent' | 'jev'
  fallback?: string
  status: 'waiting' | 'ready' | 'unavailable'
  initial: Record<string, IslandValue>
}
export interface IslandView {
  id: string
  revision: number
  title: string
  blocks: IslandBlock[]
  fields: (ControlParam & { value: IslandValue | null })[]
  sourceRevision: string
  status: IslandRecord['status']
  detail: string
  engine: string
  replay: boolean
}
export interface IslandCommand {
  chat: string
  id: string
  revision: number
  sourceRevision: string
  gesture?: string
  operation: string
  action: 'commit' | 'reset' | 'undo' | 'reload' | 'replay'
  values?: Record<string, IslandValue>
}
