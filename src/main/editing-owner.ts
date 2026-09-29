import type { IslandBlock, IslandRecord, IslandValue } from '../shared/chat-islands'
import type { ControlPanelManifest } from '../shared/api'

/**
 * The editing owner seam (S12). Under the Swift launch the service's editing
 * coordinator decides the editing workflows between the preview, the inspectors and
 * the chat:
 * - chat islands: the only writer of their history files (`<userData>/chat-islands`),
 *   pending activation bound to the turn that defined them, command admission, the
 *   revision chain of a queued batch and each island's Undo group;
 * - the controls sidecars (`.trezi/control-panels.json`, `content-controls.json`),
 *   committed only if the file still holds the bytes Bun read, in the repository lane;
 * - unsaved content-editor drafts, kept across restarts;
 * - deferred preview navigation (`open_preview`), released when its turn lands.
 * Bun keeps the JS helpers (manifest/recipe validation, Jev composition, literal
 * resolution and splicing, source proposals), the isolated WebKit instrumentation and
 * the inspector views. With no Swift owner (`TREZI_BACKEND_OWNER=legacy`, unit tests)
 * the in-process twin in `editing-model.ts` decides the same way. Never both.
 */

export interface IslandAdmission {
  /** Names this composition in `islandCommit`/`islandAbort`. */
  token: string
  id: string
  revision: number
  turn: number
  /** The definition replaces the island of the same turn (same id). */
  replacing: boolean
}

export interface IslandCommandAdmission {
  ticket: string
  /** The source revision the command must be computed against (the batch's own writes). */
  expected: string
  /** Undo: the source-owner group to revert. */
  group?: string
  /** Reset: the island's initial values. */
  initial?: Record<string, IslandValue>
}

export interface ContentDraft {
  panel: string
  /** The document revision the draft was edited against. */
  revision: string
  value: Record<string, unknown>
  updated: string
}

export type SidecarName = 'control-panels.json' | 'content-controls.json'
export type SidecarCommit = { ok: true; hash: string } | { ok: false; conflict: true }
export type NavigationEvent = 'landed' | 'failed' | 'begin' | 'close'

export class EditingError extends Error {
  constructor(readonly code: string, message: string) { super(message) }
}

export interface EditingOwner {
  readonly kind: 'swift' | 'legacy'
  // Chat islands
  islandsOpen(chat: string, root: string, record: string): Promise<IslandRecord[]>
  islandsClose(chat: string): Promise<void>
  islands(chat: string): Promise<IslandRecord[]>
  /** `origin` is the turn id Bun attributes the tool call to (the owner checks it). */
  islandDefine(chat: string, turn: number, origin: string | null, id?: string, revision?: number): Promise<IslandAdmission>
  islandCommit(chat: string, token: string, definition: { manifest: ControlPanelManifest; blocks: IslandBlock[] },
    engine: 'agent' | 'jev', initial: Record<string, IslandValue>, fallback?: string): Promise<IslandRecord[]>
  islandAbort(chat: string, token: string): Promise<void>
  /** A turn's terminal (`turn` null: whatever the chat is doing). `records` null: chat not open. */
  islandSettle(chat: string, turn: string | null, successful: boolean): Promise<{ records: IslandRecord[] | null; cancelled: boolean }>
  islandCommand(chat: string, id: string, revision: number, action: 'commit' | 'reset' | 'undo' | 'reload', sourceRevision: string): Promise<IslandCommandAdmission>
  islandFinish(chat: string, ticket: string, outcome: { ok: boolean; group?: string; revision?: string }, last: boolean): Promise<void>
  // Deferred preview navigation
  /** Answers whether it may open now (false: it waits for its turn to land). */
  navigate(chat: string, root: string, path: string, turn: string | null): Promise<boolean>
  navigation(chat: string, kind: NavigationEvent, turn: string | null): Promise<boolean>
  navigationTake(chat: string): Promise<{ root: string; path: string } | null>
  navigationState(): Promise<Array<{ chat: string; root: string; path: string; turn: string | null; awaiting: boolean }>>
  // Content-editor drafts
  contentDrafts(root: string): Promise<ContentDraft[]>
  saveContentDraft(root: string, panel: string, revision: string, value: Record<string, unknown>): Promise<void>
  clearContentDraft(root: string, panel: string): Promise<void>
  /** Hash-bound sidecar commit; `expectedHash` null means the file must not exist. */
  sidecar(root: string, name: SidecarName, expectedHash: string | null, content: string): Promise<SidecarCommit>
}

let owner: EditingOwner | null = null

/** Installed once by the native entry point when the Swift service is supervising Bun. */
export function setEditingOwner(next: EditingOwner | null): void {
  owner = next
}

/** The Swift owner, when installed. */
export function swiftEditingOwner(): EditingOwner | null {
  return owner
}
