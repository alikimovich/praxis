import type { NativeImage } from '../native/platform'

/**
 * A tiny registry that lets any main-process module read the live preview's
 * state without importing `index.ts` (which owns the `NativeView`) — that
 * would be a cycle, since `index.ts` already pulls in the agent/backends. The
 * preview owner registers a source once (see `registerPreviewIpc` in
 * `index.ts`); the shared Claude/Codex preview observation tools read it.
 *
 * Both accessors are null/absent-safe: before a source registers (or when no
 * preview is open) they report "nothing to see" rather than throwing.
 */
export interface PreviewSource {
  /** The preview's current URL, or null when no real web preview is showing. */
  getUrl: () => string | null
  /** A capture of the preview's current frame, or null when unavailable. */
  capture: () => Promise<NativeImage | null>
  /** The agent inspection host (LKM-138); absent before the native preview registers. */
  agent?: PreviewAgentHost
}

/** CSS-pixel rectangle in the preview viewport. */
export interface PreviewRect {
  x: number
  y: number
  width: number
  height: number
}

/** What `src/main/preview-agent-tools.ts` needs from the native preview. */
export interface PreviewAgentHost {
  /** Run `code` in the TreziPreview world (`preview`) or the handler-less TreziAgent world (`agent`). */
  evaluate: (code: string, world: 'preview' | 'agent', timeoutMs: number) => Promise<unknown>
  /** Snapshot of `rect` (CSS px), clipped to the visible viewport. */
  captureRect: (rect: PreviewRect) => Promise<NativeImage | null>
  /** Lay the page out at `width` CSS px (null restores the normal layout). */
  setViewport: (width: number | null) => Promise<{ width: number | null; zoom: number }>
}

let source: PreviewSource | null = null

/** The registered agent host, or null when no native preview is registered. */
export function previewAgentHost(): PreviewAgentHost | null {
  return source?.agent ?? null
}

export function registerPreviewSource(src: PreviewSource): void {
  source = src
}

/** The preview's current URL, or null when nothing usable is showing. */
export function getPreviewUrl(): string | null {
  try {
    return source?.getUrl() ?? null
  } catch {
    return null
  }
}

/** Capture the preview's current frame, or null on absence/error. */
export async function capturePreview(): Promise<NativeImage | null> {
  if (!source) return null
  try {
    return await source.capture()
  } catch {
    return null
  }
}
