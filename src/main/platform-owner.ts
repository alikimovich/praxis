import type { ImageAttachment, RunningSimulator, SimElementPick, SimPreflight } from '../shared/api'
import type { PreviewProcess } from '../native/preview-processes'

/**
 * The platform owner seam (S14). Under the Swift launch the service's platform owner
 * performs the OS services Bun used to run itself:
 * - the iOS Simulator preview: preflight, boot, the app's launch command as a
 *   supervised process group, the loopback bridge, idb input and element picks, stop;
 * - scoped media grants for the native source editor (view-bound, expiring, hashed);
 * - pasted composer images (uploaded in bounded chunks, hash-checked, written by it);
 * - the "Running servers" recovery sheet's inspection and SIGTERM.
 * With no Swift owner (`TREZI_BACKEND_OWNER=legacy`, unit tests) the original TS code
 * runs: `simulator.ts`, `media.ts`, `attachments.ts` and `preview-processes.ts`. Call
 * sites choose one or the other, never both.
 */

export class PlatformError extends Error {
  constructor(readonly code: string, message: string) { super(message) }
}

export interface MediaGrant {
  token: string
  url: string
  kind: string
  mediaType: string
  bytes: number
  sha256: string
  /** Milliseconds since the epoch; resolving extends it. */
  expires: number
}

export interface PlatformStatus {
  simulator: { running: boolean; starting: boolean; selectMode: boolean; streams: number }
  grants: number
  uploads: number
}

export interface PlatformOwner {
  readonly kind: 'swift'
  simulatorPreflight(): Promise<SimPreflight>
  simulatorStart(opts: { root: string; command?: string; udid?: string }): Promise<RunningSimulator>
  simulatorStop(): Promise<void>
  simulatorSelect(active: boolean): Promise<void>
  onSimulatorLog(listener: (line: string) => void): void
  onSimulatorPick(listener: (pick: SimElementPick) => void): void
  /** A media URL for the source editor, bound to that view, the file's size and hash. */
  grantMedia(root: string, file: string): Promise<MediaGrant>
  /** The granted file's path for the native editor; an expired or changed grant is issued again. */
  mediaPath(url: string, root: string, file: string): Promise<string | undefined>
  /** A pasted image's saved path, or '' when it could not be saved (the legacy contract). */
  saveAttachment(image: ImageAttachment, name?: string): Promise<string>
  findServers(root: string): Promise<PreviewProcess[]>
  stopServer(server: PreviewProcess): Promise<void>
  status(): Promise<PlatformStatus>
}

let owner: PlatformOwner | null = null

/** Installed once by the native entry point when the Swift service is supervising Bun. */
export function setPlatformOwner(next: PlatformOwner | null): void {
  owner = next
}

export function swiftPlatformOwner(): PlatformOwner | null {
  return owner
}
