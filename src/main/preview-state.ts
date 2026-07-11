import type { NativeImage } from 'electron'

/**
 * A tiny registry that lets any main-process module read the live preview's
 * state without importing `index.ts` (which owns the `WebContentsView`) — that
 * would be a cycle, since `index.ts` already pulls in the agent/backends. The
 * preview owner registers a source once (see `registerPreviewIpc` in
 * `index.ts`); the in-process `praxis` SDK tools (backends/claude.ts) read it.
 *
 * Both accessors are null/absent-safe: before a source registers (or when no
 * preview is open) they report "nothing to see" rather than throwing.
 */
export interface PreviewSource {
  /** The preview's current URL, or null when no real web preview is showing. */
  getUrl: () => string | null
  /** A capture of the preview's current frame, or null when unavailable. */
  capture: () => Promise<NativeImage | null>
}

let source: PreviewSource | null = null

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
